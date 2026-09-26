# ADR-0001 — WebSocket brut + JSON plutôt que Socket.IO

**Date** : 2026-09-26 · **Statut** : accepté

## Contexte

V1 utilisait Socket.IO (événements nommés + acks). V2 doit offrir un contrat explicite, versionné, documentable message par message et consommable par n'importe quel frontend (framework ou moteur 2D choisi librement par Astra).

## Décision

WebSocket standard (`ws` côté Node, `WebSocket` natif côté client), un objet JSON par trame, enveloppe maison `{ type, rid?, payload }` ; requête/réponse par `rid` ; version négociée par `hello`.

## Conséquences

- Contrat 100 % visible dans les schémas : pas de framing ni de comportement implicite de librairie ; testable avec un simple `new WebSocket()`.
- Aucune dépendance client obligatoire (le SDK fourni est optionnel).
- On réimplémente ce que Socket.IO offrait : acks (`rid`), reconnexion (SDK), heartbeat (ping/pong `ws`, qui mesure aussi le RTT), rooms (gateway). ~200 lignes, maîtrisées.
- Pas de fallback long-polling : acceptable pour les navigateurs ciblés.
- JSON plutôt que binaire : lisible et suffisant (messages < 2 Ko, état throttlé ~10 Hz). Un encodage binaire pourra être ajouté pour un micro-jeu très bavard sans changer l'architecture.
