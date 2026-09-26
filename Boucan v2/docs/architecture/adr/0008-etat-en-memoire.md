# ADR-0008 — État en mémoire, un seul processus, pas de persistance

**Date** : 2026-09-26 · **Statut** : accepté

## Contexte

Une partie dure quelques minutes ; il n'y a ni comptes, ni progression, ni classement persistant dans le périmètre actuel.

## Décision

Toutes les rooms vivent en mémoire d'un unique processus Node. Aucune base de données.

## Conséquences

- Simplicité maximale, latence minimale, zéro infrastructure.
- Un redémarrage du serveur termine les parties en cours (les clients reçoivent une fermeture 1001 et retournent à l'accueil après échec du `resume`).
- Capacité : plusieurs centaines de rooms par processus (coût dominé par le tick à 50 ms et les diffusions).
- Évolutions possibles sans refonte :
  - **plusieurs instances** : router par code de room (sticky) — le code est l'unité d'état ;
  - **persistance** (statistiques, profils) : écrire les `MatchResults` en fin de match dans un stockage externe, hors du chemin critique.
