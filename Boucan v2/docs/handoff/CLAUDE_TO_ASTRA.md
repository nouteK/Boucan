# Claude → Astra

> Boîte aux lettres technique : **tout changement backend qui a un impact frontend**. Écrit par Claude uniquement. Le plus récent en haut.
> Format : date · version · quoi · impact frontend · migration.

---

## 2026-09-26 · protocole 1 · contrat 1.0.0 — première version du moteur V2

**Nouveau** : backend V2 complet (base propre, rien d'imposé par V1). Vertical slice réseau fonctionnel et testé de bout en bout : connexion → room → joueurs → pseudo → ready → démarrage → annonce du micro-jeu → timestamp commun → actions → fin → résultats → scores → manche suivante → classement → retour lobby.

**Ce que vous pouvez utiliser dès maintenant**

- `@boucan/sdk` → `BoucanClient` : seul point d'accès réseau (horloge synchronisée, reconnexion, erreurs typées). Guide : [FRONTEND_BACKEND.md](../integration/FRONTEND_BACKEND.md).
- `@boucan/sdk/local` → `createLocalGame({ bots: 7 })` : le vrai moteur dans la page, avec des bots qui jouent — **aucun serveur à lancer** pour développer toute l'UI.
- `@boucan/shared/fixtures` → 20 états réels (lobby vide/8 joueurs, countdown, jeu actif ×3 autorités, résultats, podium, déconnexion, erreurs, log complet d'un match).
- `@boucan/shared` → types, `checkNickname` (même règle que le serveur), `createRng` (seed partagée), `phaseProgress`.
- Outils : `npm run check:integration`, `npm run bots`.

**Points de design à connaître**

- Une seule valeur pilote l'écran : `snapshot.match.phase` (9 phases, voir [GAME_LIFECYCLE.md](../architecture/GAME_LIFECYCLE.md)).
- Les timers s'animent localement : `phaseStartedAt` / `phaseEndsAt` / `phaseEndsExactly` + `client.serverNow()`. Le début du jeu (`minigame.timing.activeAt`) est connu dès le countdown.
- `MINIGAME_PREPARING` attend votre `client.minigameReady()` (assets chargés) — minimum 3 s, maximum 12 s : c'est votre fenêtre d'écran d'annonce.
- Le serveur n'envoie **aucune** donnée de présentation. Noms, règles affichées, décors, sons, personnages : déduits de `minigameId` / `characterId` / événements sémantiques.
- `characterId` : identifiant libre choisi par vous (validation de format seulement). Liste blanche activable quand la distribution sera figée.
- Pseudo : 2–16 caractères, refus explicites (`details.reason`), suffixe automatique en cas de doublon.
- 4 micro-jeux de référence (`sonnerie`, `interro-surprise`, `course-couloir`, `fausse-couleur`) couvrant les 3 autorités. **Ce sont des placeholders techniques** tirés de Notion : règles, durées, entrées et scoring sont à redéfinir par vous ; demandez les adaptations serveur dans `ASTRA_TO_CLAUDE.md`.

**Migration** : aucune (première version).
