# ADR-0003 — Snapshots complets + événements sémantiques

**Date** : 2026-09-26 · **Statut** : accepté

## Contexte

Le frontend doit toujours connaître l'état exact de la room (lobby, phase, manche, résultats) et animer les « moments » (arrivée d'un joueur, changement de phase). Les deltas imposent de gérer l'ordre, les pertes et la resynchronisation.

## Décision

- À chaque changement, le serveur diffuse le **snapshot complet** de la room (`RoomSnapshot`, ≤ ~6 Ko à 8 joueurs), numéroté par `rev` (croissant par room) ; au plus un par commande ou par tick.
- Les « moments » sont en plus signalés par des **événements sémantiques** (`room.event`), envoyés après le snapshot qui les contient.
- Les données à haute fréquence d'un micro-jeu ne passent **pas** par le snapshot : `minigame.state` (throttlé, seulement si modifié) et `minigame.event` (ponctuels).

## Conséquences

- Le client est un simple « dernier snapshot gagne » : reconnexion et rattrapage triviaux, aucun état reconstruit par accumulation.
- Les événements sont un confort d'animation : le frontend peut les ignorer sans devenir incohérent.
- Coût réseau négligeable : les snapshots sont rares (changements de phase, ready, arrivées), pas par frame.
