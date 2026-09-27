# ADR-0004 — Autorité choisie par micro-jeu

**Date** : 2026-09-26 · **Statut** : remplacé par [ADR-0010](0010-vies-et-autorite-v2.md)

## Contexte

V1 simulait tous les micro-jeux sur le serveur. C'est robuste mais coûteux à écrire, et cela empêche Astra de transformer librement un jeu (chaque changement de gameplay devient un changement serveur). À l'inverse, tout confier au client rend triviale la triche sur les jeux compétitifs.

## Décision

Chaque module déclare son autorité :

- **local** : simulation client, un rapport final vérifié en plausibilité. Défaut pour la majorité des micro-jeux solo-en-parallèle.
- **relay** : simulation client, progression diffusée et validée (monotonie, vitesse max), état partagé relayé, arrivées horodatées par le serveur. Quand on doit voir les autres ou départager l'ordre.
- **server** : le client envoie des intentions, le serveur simule/juge. Quand il y a information secrète, timing compétitif ou ressource partagée.

Le moteur fournit les mêmes services aux trois (timing, routage, rate limit, isolation) ; seul le module change.

## Conséquences

- Un jeu `local` peut être entièrement redessiné par Astra sans toucher au serveur, tant que le rapport garde la même forme.
- Le niveau de confiance est explicite et documenté par jeu (`ServerInfo.minigames[].authority`).
- Triche possible sur les jeux `local` dans les bornes de plausibilité : accepté (party game entre amis), ajustable au cas par cas en passant un jeu en `relay`/`server`.
