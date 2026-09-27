# ADR-0005 — Scoring abstrait : résultats bruts → rang → points

**Date** : 2026-09-26 · **Statut** : remplacé par [ADR-0010](0010-vies-et-autorite-v2.md)

## Contexte

Astra peut changer le scoring de n'importe quel micro-jeu (réussite/échec, points, temps, précision, erreurs, rang, valeur normalisée). Le score du match doit rester cohérent d'une manche à l'autre.

## Décision

1. Un module produit un `PlayerResult` brut (`outcome` + métriques optionnelles + `stats` libres). Il ne calcule jamais de points de match.
2. Il déclare un `ScoringSpec` : `rankBy` (clé principale + départages), `strategy`, `failures`.
3. Le moteur classe (réussite > échec > dnf, puis les clés ; ex æquo = même rang, classement « compétition ») et convertit en points avec des **tables globales** (`game-config.ts`) :
   - `placement` : 10, 7, 5, 3, 2, 1, 1, 1 ;
   - `threshold` : 6 par réussite ;
   - `normalized` : `normalized × 10` ;
   - échec : 0 sauf `failures: "ranked"` (échec partiel classé) ; dnf : 0 ;
   - manche solo : barème sur `normalized` (10/7/5/2).

## Conséquences

- Changer le scoring d'un jeu = changer son `ScoringSpec` ou les métriques de son rapport, pas le moteur.
- Les manches restent comparables (même échelle de points), l'équilibrage global se règle dans un seul fichier.
- Un jeu qui veut imposer un classement (ex. ordre d'élimination) utilise la métrique `rank`.
