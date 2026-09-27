# Pistes

Idées non engagées, à trier. Une piste retenue devient une tâche ; une piste écartée est supprimée.

## Micro-jeux

- **Projecteur** (duel, tous en vie) — un faisceau de lumière balaie la scène ; chacun déplace son élève (pointeur / flèches) pour rester dans l'ombre. Serveur : trajectoire seedée, positions bornées en vitesse, exposition cumulée ; perd celui qui a été le plus exposé. Beau à huit, lecture immédiate.
- **Pile Poil** (solo) — lancer une pile de cahiers sur une cible : maintenir pour charger, relâcher pour lancer ; réussi si la pile s'arrête dans la zone. Bon candidat `hint: 'hold'`.

## Contenu

- Personnages : seuls `chien` et `renard` ont une planche animée ; les autres sièges utilisent le personnage dessiné de secours (manifest `characters`).
- Effets sonores enregistrés (manifest `sounds`) : aujourd'hui tous synthétisés.
- Décors illustrés par lieu (manifest `backgrounds`, 1280×720) : aujourd'hui dessinés.

## Technique

- Rejouer une partie à l'identique à partir de sa graine (utile pour déboguer un micro-jeu signalé).
- Plusieurs instances serveur : nécessiterait un état partagé (voir [ADR-0008](adr/0008-etat-en-memoire.md)).
