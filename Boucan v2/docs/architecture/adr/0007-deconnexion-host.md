# ADR-0007 — Déconnexion, reconnexion et host

**Date** : 2026-09-26 · **Statut** : accepté

## Contexte

Navigateurs et mobiles perdent la connexion souvent (onglet en veille, changement de réseau). Une partie ne doit jamais rester bloquée à cause d'un absent, et une micro-coupure ne doit pas coûter sa place.

## Décision

- Chaque joueur reçoit un **jeton de session** opaque ; `room.resume` le replace sur son siège (même id, même score). Un seul socket actif par joueur (le plus récent gagne, l'ancien reçoit `session.ended: replaced`).
- Grâces : 30 s en lobby (puis retrait), 90 s en match (puis `left` : conservé dans le classement, retiré au retour lobby). Room sans connecté fermée après 60 s.
- Aucune phase n'attend un déconnecté : chargement, fin de jeu et rapports ignorent les absents ; sans résultat ⇒ dnf (0 point).
- Démarrage : seuls les connectés doivent être prêts ; les sièges déconnectés sont libérés.
- **Host** : rôle de confort (configuration, démarrage, kick, retour lobby), jamais nécessaire au déroulé d'une manche. Transfert immédiat s'il part, après 5 s s'il est déconnecté, au connecté de plus petit siège.

## Conséquences

- Une coupure courte est invisible pour les autres (au pire une manche dnf).
- La room ne meurt pas avec son créateur.
- Pas de rejoindre en cours de match pour un nouveau joueur (simplicité) : à revoir si besoin de spectateurs.
