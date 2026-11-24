#!/usr/bin/env node
/* Tests du jeu, sans dépendance : node tests/run-tests.js
   1. Stratégie de base selon les règles (S17/H17, DAS, abandon).
   2. Simulation de parties de 1 à 4 joueurs dans chaque mode : chaque main est réglée,
      l'argent est conservé (mises, doubles, séparations, abandon, assurance), le croupier
      respecte S17/H17 et les modes ne distribuent que des mains de leur catégorie. */
const fs = require('fs'), path = require('path'), os = require('os');

/* ---------- Extraction du script de index.html et faux DOM minimal ---------- */
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script>\n\{([\s\S]*)\}\n<\/script>/);
if (!m) throw new Error('Script principal introuvable dans index.html');
const mk = () => {
  const o = {style:{setProperty(){}}, dataset:{}, children:[], open:false, value:'', checked:false, disabled:false, hidden:false,
    textContent:'', className:'', firstChild:{textContent:''},
    setAttribute(){}, removeAttribute(){}, showModal(){}, close(){}, focus(){}, addEventListener(){},
    appendChild(c){ this.children.push(c); }, querySelector(){ return mk(); }, querySelectorAll(){ return []; },
    closest(){ return null; }, matches(){ return false; }, classList:{add(){}, remove(){}, toggle(){}, contains(){ return false; }}};
  let ih = ''; Object.defineProperty(o, 'innerHTML', {get(){ return ih; }, set(v){ ih = v; this.children = []; }});
  return o;
};
const els = {};
global.document = {getElementById: id => els[id] || (els[id] = mk()), querySelectorAll: () => [], createElement: () => mk(),
                   addEventListener(){}, documentElement: mk()};
global.localStorage = {getItem(){ return null; }, setItem(){}};
global.window = {};
const realTimeout = setTimeout;
global.setTimeout = f => realTimeout(f, 0);           // pas d'attente pendant les tests
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bj-')), 'engine.js');
fs.writeFileSync(tmp, m[1] + '\nmodule.exports = {S, act, deal, setCount, applyRules, answerInsurance, recommend, handValue, isPair, isBJ, SND};');
const E = require(tmp);

let failures = 0;
const fail = msg => { failures++; console.log('  ÉCHEC', msg); };
const C = (...r) => r.map(x => ({rank:x, suit:'♠'}));

/* ---------- 1. Stratégie ---------- */
function strategy(){
  const can = {double:true, split:true, surrender:true}, plain = {double:true, split:true, surrender:false};
  const cases = [
    // [règles, cartes, croupier, attendu, possibilités]
    [{}, ['10','6'], '10', 'hit', plain], [{}, ['10','6'], '6', 'stand', plain], [{}, ['10','2'], '3', 'hit', plain],
    [{}, ['6','5'], 'A', 'hit', plain], [{}, ['5','4'], '3', 'double', plain], [{}, ['A','7'], '2', 'stand', plain],
    [{}, ['A','7'], '3', 'double', plain], [{}, ['A','7'], '9', 'hit', plain], [{}, ['A','8'], '6', 'stand', plain],
    [{}, ['9','9'], '7', 'stand', plain], [{}, ['4','4'], '5', 'split', plain], [{}, ['2','2'], '2', 'split', plain],
    [{}, ['A','6','A'], '4', 'stand', {double:false, split:false}],
    [{h17:true}, ['6','5'], 'A', 'double', plain], [{h17:true}, ['A','7'], '2', 'double', plain], [{h17:true}, ['A','8'], '6', 'double', plain],
    [{das:false}, ['4','4'], '5', 'hit', plain], [{das:false}, ['2','2'], '2', 'hit', plain], [{das:false}, ['6','6'], '2', 'hit', plain],
    [{das:false}, ['3','3'], '4', 'split', plain],
    [{surrender:true}, ['10','6'], '10', 'surrender', can], [{surrender:true}, ['9','7'], '9', 'surrender', can],
    [{surrender:true}, ['10','5'], '10', 'surrender', can], [{surrender:true}, ['10','5'], 'A', 'hit', can],
    [{surrender:true}, ['8','8'], '10', 'split', can], [{surrender:true}, ['10','7'], 'A', 'stand', can],
    [{surrender:true}, ['10','6'], '10', 'hit', plain],
    [{surrender:true, h17:true}, ['10','5'], 'A', 'surrender', can], [{surrender:true, h17:true}, ['10','7'], 'A', 'surrender', can],
    [{surrender:true, h17:true}, ['8','8'], 'A', 'surrender', can], [{surrender:true, h17:true}, ['8','8'], 'A', 'split', plain]
  ];
  for (const [r, cards, up, exp, c] of cases){
    E.applyRules(r);
    const got = E.recommend(C(...cards), {rank:up, suit:'♥'}, c).action;
    if (got !== exp) fail(`stratégie ${JSON.stringify(r)} ${cards.join('-')} contre ${up} : ${got}, attendu ${exp}`);
  }
  console.log(`Stratégie : ${cases.length} cas vérifiés`);
}

/* ---------- 2. Audio : faux AudioContext qui compte les notes, pour détecter les erreurs silencieuses ---------- */
function audio(){
  const count = {osc:0};
  const param = () => ({value:0, setValueAtTime(){}, exponentialRampToValueAtTime(){}, setTargetAtTime(){}});
  const node = () => { const n = {connect: x => x || n, start(){}, stop(){}, frequency:param(), gain:param(), type:'', buffer:null}; return n; };
  E.SND.ctx = {currentTime:0, sampleRate:8000, destination:{}, state:'running', resume(){}, suspend(){},
    createOscillator(){ count.osc++; return node(); }, createGain: node, createBiquadFilter: node,
    createBufferSource: node, createBuffer: (c, n) => ({getChannelData: () => new Float32Array(n)})};
  E.S.opts.sound = true;
  for (const f of ['blackjack', 'win', 'lose', 'good', 'bad', 'chip', 'card']){
    const b = count.osc;
    try { E.SND[f](); } catch(e){ fail(`son ${f} : ${e.message}`); }
    if (f !== 'card' && count.osc === b) fail(`son ${f} : aucune note jouée`);
  }
  E.SND.ctx = null;
  console.log('Audio : 7 sons vérifiés, sans erreur');
}

/* ---------- 3. Simulation ---------- */
const wait = () => new Promise(r => realTimeout(r, 0));
const ACTIONS = ['hit', 'stand', 'double', 'split', 'surrender', 'stand'];
async function drive(){                                 // joue au hasard jusqu'au retour en phase de mise
  for (let i = 0; i < 20000; i++){
    const S = E.S;
    if (S.phase === 'bet' && !S.busy) return;
    if (S.phase === 'ins' && !S.busy){ E.answerInsurance(Math.random() < .5); await wait(); }
    else if (S.phase === 'play' && !S.busy) await E.act(ACTIONS[Math.floor(Math.random() * ACTIONS.length)]);
    else await wait();
  }
  throw new Error('partie bloquée en phase ' + E.S.phase);
}
const inCat = {
  pair: h => E.isPair(h.cards),
  soft: h => h.cards.some(c => c.rank === 'A') && !E.isPair(h.cards),
  double: h => { const v = E.handValue(h.cards); return !E.isPair(h.cards) && (v.soft ? v.total >= 13 && v.total <= 18 : v.total >= 8 && v.total <= 11); },
  hard: h => { const v = E.handValue(h.cards); return !v.soft && !E.isPair(h.cards) && v.total >= 12 && v.total <= 16; }
};
async function simulate(rules, label){
  E.applyRules(rules);
  const S = E.S; let rounds = 0;
  for (const n of [1, 2, 3, 4]){
    E.setCount(n);
    for (const mode of ['all', 'pair', 'soft', 'double', 'hard', 'weak']){
      S.mode = mode;
      for (let r = 0; r < 25; r++){
        for (const p of S.players){ if (p.balance < 200) p.balance = 1000; p.bet = 10 * (1 + Math.floor(Math.random() * 3)); }
        const before = S.players.map(p => p.balance);
        let starts = null;
        const dealing = E.deal();
        // mains de départ lues dès que la distribution est terminée
        while (!['play', 'ins', 'bet'].includes(S.phase) || (S.phase === 'bet' && S.busy)) await wait();
        starts = S.players.map(p => p.hands[0] ? p.hands[0].cards.slice(0, 2) : null);
        await drive(); await dealing;
        rounds++;
        if (inCat[mode]) starts.forEach((c, i) => { if (c && c.length === 2 && !E.isBJ(c) && !inCat[mode]({cards:c})) fail(`${label} mode ${mode} : main hors catégorie ${c.map(x => x.rank)}`); });
        const d = E.handValue(S.dealer), dBJ = E.isBJ(S.dealer);
        const live = S.players.some(p => p.hands.some(h => !h.nat && h.result !== 'bust' && h.result !== 'surr'));
        if (!dBJ && live && (d.total < 17 || (rules.h17 && d.total === 17 && d.soft))) fail(`${label} : croupier arrêté à ${d.total}${d.soft ? ' soft' : ''}`);
        if (!rules.h17 && !dBJ && S.dealer.length > 2 && E.handValue(S.dealer.slice(0, -1)).total >= 17) fail(`${label} : le croupier a tiré sur 17`);
        S.players.forEach((p, i) => {
          let exp = 0;
          for (const h of p.hands){
            if (!h.result) fail(`${label} : main sans résultat`);
            exp += {bust:-h.bet, surr:-h.bet / 2, lose:-h.bet, push:0, win:h.bet, bj:h.bet * rules.bjPay}[h.result];
            if (h.result === 'bj' && !h.nat) fail(`${label} : blackjack payé sur une main séparée`);
          }
          if (p.ins) exp += dBJ ? 2 * p.ins : -p.ins;
          if (p.hands.length > 4) fail(`${label} : plus de 4 mains`);
          if (Math.abs((p.balance - before[i]) - exp) > 1e-9) fail(`${label} ${n}j ${mode} place ${i} : solde ${p.balance - before[i]}, attendu ${exp}`);
        });
      }
    }
  }
  console.log(`Simulation ${label} : ${rounds} mains, 1 à 4 joueurs, 6 modes`);
}

(async () => {
  strategy();
  audio();
  await simulate({decks:6, h17:false, bjPay:1.5, das:true, surrender:false, insurance:false}, 'règles par défaut');
  await simulate({decks:8, h17:true, bjPay:1.2, das:false, surrender:true, insurance:true}, 'H17, 6:5, abandon, assurance');
  await simulate({decks:4, h17:false, bjPay:1.5, das:true, surrender:true, insurance:true}, '4 jeux, abandon, assurance');
  console.log(failures ? `\n${failures} échec(s)` : '\nTous les tests passent');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
