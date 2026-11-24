# Blackjack · entraînement à la stratégie de base

Jeu de blackjack en un seul fichier (`index.html`, HTML/CSS/JS sans dépendance) pour s'entraîner à appliquer la stratégie de base optimale. Après chaque décision, un badge indique si le choix était le bon, avec une explication, sans interrompre la partie.

## Règles (configurables dans Réglages → Règles de la table)
- 4, 6 ou 8 jeux, remélangés après environ 75 % du sabot
- Croupier qui reste (S17) ou tire (H17) sur 17 soft, vérification de la carte cachée avec un As ou une bûche
- Blackjack payé 3:2 ou 6:5
- Double sur deux cartes, avec ou sans double après séparation
- Séparation jusqu'à 4 mains, une seule carte sur les As séparés
- Abandon tardif et assurance en option

La stratégie attendue et la table de référence intégrée s'adaptent aux règles choisies.

## Fonctionnalités
- Indicateur ✓ / ✗ avec explication après chaque décision (assurance comprise), indice optionnel avant de jouer
- Jusqu'à 4 joueurs à la table, chacun avec son prénom, sa mise, son solde, son gain de session et ses stats
- Modes d'entraînement : paires, soft, doubler ou pas, dur 12-16, « mes points faibles »
- Historique, précision par type de décision, erreurs fréquentes, sauvegarde dans le navigateur
- Croupier sans visage (buste, nœud papillon, mains) : ses mains lancent chaque carte jusqu'à sa place
- Bruitages (cartes, jetons, bon ou mauvais choix) et fanfare de blackjack, générés dans le navigateur et désactivables
- Panneau à onglets (Stats, Historique, Réglages, Stratégie) : la page tient sur un écran d'ordinateur
- Trois vitesses de jeu, aide intégrée
- Raccourcis : T tirer, R rester, D doubler, S séparer, A abandonner, O/N assurance, Espace nouvelle main, ? aide

## Utilisation
Ouvrir `index.html` dans un navigateur, ou via GitHub Pages : https://eliasjr923.github.io/blackjack-strategie/

## Tests
```
node tests/run-tests.js
```
Vérifie la stratégie selon les règles, les sons (avec un faux moteur audio), puis simule des centaines de mains de 1 à 4 joueurs dans chaque mode : règlement de chaque main, conservation de l'argent (doubles, séparations, abandon, assurance), arrêt correct du croupier et respect des catégories d'entraînement.
