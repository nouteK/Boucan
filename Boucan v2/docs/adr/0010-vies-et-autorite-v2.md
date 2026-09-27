# ADR-0010 — Partie façon WarioWare : vies, rythme et autorité par type de micro-jeu

**Date** : 2026-09-27 · **Statut** : accepté · **Remplace** : [0004](0004-autorite-par-micro-jeu.md), [0005](0005-scoring.md)

## Contexte

Le jeu est devenu un WarioWare multijoueur en ligne (protocole 2) : des micro-jeux de ~4 s enchaînés sans temps mort, qui accélèrent, avec des boss et des duels. Le modèle v1 (manches longues, trois niveaux d'autorité, scoring par points et classement de manche) ne correspond plus au rythme ni à la lisibilité voulue (« qui est encore en vie ? »).

## Décision

- **Vies plutôt que points** : chaque joueur part avec 3 à 5 vies ; un échec coûte une vie, un boss réussi en rend une (plafond `maxLives`). À 0 vie, le joueur est éliminé mais continue en fantôme (il joue pour le plaisir, sans compter). Le classement final se fait sur survie, moment d'élimination, vies restantes, victoires.
- **Rythme piloté par le serveur** : niveaux de `gamesPerLevel` micro-jeux + un boss ; accélération (`tempo`) tous les `speedUpEvery` ; duel tous les `duelEvery`. Le client reçoit `tempo` et fait courir le temps de jeu plus vite.
- **Autorité par type**, plus par module :
  - **solo / boss** : chaque client joue sa copie (graine commune) et rapporte `success` / `failure` dès que c'est décidé. Aucun code serveur par micro-jeu (kit générique `kits/local.ts`, bots simulés par probabilité).
  - **duel** : arène commune simulée par un module serveur (intentions → état diffusé → issues tranchées par le serveur).

## Conséquences

- Ajouter un micro-jeu solo = une entrée de catalogue + un fichier client ([MICROGAMES.md](../MICROGAMES.md)).
- Triche possible sur les solos (un client peut se déclarer gagnant) : accepté pour un party game entre amis ; les duels, où l'on s'affronte directement, restent sous autorité serveur.
- `PROTOCOL_VERSION` 2 : les clients v1 sont refusés proprement (`PROTOCOL_MISMATCH`).
