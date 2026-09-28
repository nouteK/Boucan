# ADR-0013 — Catalogue remplacé par les jeux du prototype OUAF WARE (v2), 4 mondes, niveaux sans boss

**Date** : 2026-09-28 · **Statut** : accepté · Complète [ADR-0012](0012-nouveaux-mini-jeux.md) (méthode d'intégration inchangée)

## Contexte

L'utilisateur a fourni une nouvelle version du prototype, `OUAF_WARE (2).html` (plein écran, boutons tactiles, 7 nouveaux jeux, plusieurs jeux revus), avec la consigne : **retirer les anciens jeux et remplacer tous les mini-jeux par les nouveaux**, intégrés comme les autres (plein écran, transitions Boucan), sans problème d'intégration avec le reste du jeu.

Le prototype joue 22 solos et 10 duels (ses listes `POOL` et `DUELS`), chacun dans un décor peint (`BGMAP` : forêt, ville, neige, futur). Il n'a ni boss ni lieux « école ».

## Décision

- **Catalogue = exactement les jeux jouables du prototype** : 22 solos (`cours`, `saute`, `attrape`, `bouge`, `but`, `combo`, `baisse`, `panier`, `lancer`, `skate`, `esquive`, `hautbas`, `rythme`, `fusee`, `laser`, `caisse`, `degage`, `bulle`, `glisse`, `plateau`, `puree`, `soupe`) et 10 duels (`patate`, `degaine`, `soleil`, `roi`, `gardien`, `sauter`, `ping`, `corde`, `radeau`, `boxe`). **19 jeux retirés** : `stop`, `queue`, `devore`, `renverse`, `recette`, `efface`, `copie`, `avion`, `main`, `taille`, `gemmes`, les 3 boss, et les duels `course`, `cristal`, `boules`, `glace`, `noir` (hors des listes du prototype). Leurs sources sont archivées dans `Claude/_archives/boucan-catalogue-44-jeux-2026-09-27.zip`.
- **Chaque jeu suit sa version du prototype** (règles, réglages, visuels, consigne), réécrit dans l'architecture Boucan (ADR-0012) :
  - revus : `cours` (gain / freinage selon le tempo), `saute` (3 bombes à vitesses propres), `degage` (4 bombes en cadence, coup de pied dans une zone), `plateau` (2 œufs), `puree` (boules de neige), `soupe` (fiole remplie par un drone), `combo` (« PRÊT… GO ! » avant la suite), `panier` (gymnase en 3D, panier qui glisse), `skate` (route peinte), `roi` (nouveau principe : le roi bombarde, les grimpeurs montent seuls et esquivent) ;
  - nouveaux : `esquive`, `hautbas`, `rythme`, `fusee`, `laser` (solos), `sauter`, `ping` (duels) ;
  - inchangés mais replacés dans leur monde : `but`, `attrape`, `bouge`, `patate`, `degaine`, et les autres ports de l'ADR-0012.
  Identifiants existants conservés (`puree`, `soupe`, `plateau`, `panier`, `bulle`) pour la liste blanche et les tests.
- **Les lieux « école » deviennent les 4 mondes du prototype** : `ZONES = foret | ville | neige | futur` (le champ du contrat garde le nom `zone`). Chaque micro-jeu appartient au monde de son décor ; le salon propose MONDE (Mélange, Forêt, Ville, Neige, Futur). L'intro de niveau et l'interlude posent la scène sur l'image du monde (teinte + soleil tournant + sol qui défile), « TOUS LES MONDES » en mélange. Les décors dessinés récré / cantine / classe et les accessoires scolaires sont supprimés. Changement de valeurs d'une énumération ⇒ **`PROTOCOL_VERSION` 3**, `CONTRACT_REVISION` 3.0.0 (client et serveur sont livrés ensemble dans la même image).
- **Niveaux sans boss** : un niveau se termine après `gamesPerLevel` micro-jeux quand le catalogue n'a pas de boss (montée de niveau, tempo relancé, bandeau « NIVEAU n ! »). Le chemin « boss » du moteur reste en place et testé (catalogue de test avec un boss) pour de futurs boss.
- **Commandes tactiles multi-doigts** : les événements de pointeur portent leur `id` ; `pad.ts` affiche des boutons ronds (mode tactile, `ctx.touch`) ou des touches (clavier) et gère plusieurs doigts. Utilisé là où il faut deux actions simultanées : `fusee` (◀ ▶ + SAUTE), `roi` (◀ ▶, + BOMBE pour le roi), `ping` (◀ ▶ + FRAPPE). Les autres jeux restent jouables à un doigt (moitiés d'écran, glisser) — `hautbas` : moitié gauche = se baisser, droite = sauter (nouvel indice de geste `updown`) ; `laser` : garder le doigt où aller. Le bouton « courir » de `fusee` est supprimé (vitesse unique).
- **Duels, autorité serveur** :
  - `roi` : positions continues simulées par le serveur ; les changements de direction sont appliqués depuis leur instant compensé ; l'état publie directions et dérives pour que les clients extrapolent entre deux états ; ton propre déplacement est prédit.
  - `sauter` : le calendrier de la corde est déterministe (période ×0,9 par tour) ; chaque passage est jugé 150 ms après, avec les instants de saut compensés.
  - `ping` : matchs à deux (l'impair contre la bombe maison) ; position de raquette envoyée par le client mais bornée par sa vitesse ; frappe jugée à l'instant compensé ; le point n'est donné que 150 ms après le dernier instant jouable ; raquette et renvoi prédits localement.
  - Les rôles spéciaux (roi, gardien, guetteur) restent tirés au sort par le serveur (le prototype prenait le joueur qui a le plus de vies ; un module de duel ne connaît pas les vies).
- **Adaptations** : scène 1280×800 → 1280×720 (sol à 612, caméras 3D des duels ×1,2) ; paliers de difficulté par niveau (`byLevel`) en plus du tempo ; consignes impératives et ≤ 24 caractères quand le titre du prototype ne l'était pas (`SUIS LE COMBO !`, `TIRS AU BUT !`, `TIRE LA CORDE !`, `RAME !`, `ÉVITE LA NEIGE !`) ; drone de `soupe` jaune et plus grand pour rester lisible sur le décor futur.
- **Assets extraits du HTML** : `sprites/route` (route en perspective), `sprites/table-ping`, `sprites/chien-ping` (poses `ping`, `ping_ready`, `ping_hit`, avec repli dessiné pour les autres personnages).

## Conséquences

- 32 micro-jeux (22 solos, 10 duels, 0 boss). Un vieux client (protocole 2) est refusé proprement (`PROTOCOL_MISMATCH`).
- Tests : fumée de tous les solos (3 niveaux × 3 graines, dont une en mode tactile), chaque duel de bout en bout (module réel + rendu, 2 / 3 / 5 joueurs, moitié en tactile), règles de `roi`, `sauter`, `ping` côté serveur, niveaux sans boss et boss optionnel dans le cycle de vie ; `npm run check:integration` 20/20.
- `?preview=<id>&freeze=t` avance maintenant directement jusqu'à `t` (simulation par pas de 16 ms) : captures fiables même quand l'onglet est ralenti.
- Le fichier HTML source n'est pas nécessaire au jeu.
