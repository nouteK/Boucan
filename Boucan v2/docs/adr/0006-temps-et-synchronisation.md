# ADR-0006 — Temps : horloge serveur, timestamps, compensation par RTT

**Date** : 2026-09-26 · **Statut** : accepté

## Contexte

Des micro-jeux de quelques secondes rendent visible le moindre décalage. Envoyer le temps restant à chaque frame est coûteux et saccadé.

## Décision

- L'horloge de référence est celle du serveur (epoch ms). Le client estime son décalage par `time.sync` (NTP simplifié : meilleur échantillon au plus faible RTT, 5 à la connexion puis 1 toutes les 30 s).
- Le serveur n'envoie que des **timestamps** : début/fin de phase (`phaseStartedAt`, `phaseEndsAt`, `phaseEndsExactly`), et pour le micro-jeu `activeAt` / `endsAt` dès le countdown. Le client anime localement.
- Transitions sur échéance calées sur l'échéance, pas sur le tick (pas de dérive).
- Entrées : `at` client borné à `[réception − 150 ms, réception]`. Jugements compétitifs serveur : `réaction = réception − signal − RTT mesuré par ping WebSocket` (plafonné), sans faire confiance à l'horloge client.
- Tick serveur 50 ms, états partagés throttlés (10 Hz par défaut, par module).

## Conséquences

- Timers fluides sans trafic ; tous les clients démarrent un jeu au même instant serveur (± précision de sync, typiquement < 20 ms).
- Un client à l'horloge système fausse fonctionne quand même (seul le décalage compte).
- Équité raisonnable entre latences différentes sur les jeux jugés par le serveur ; pas de rollback/prédiction (inutile pour ce type de jeux).
