# Assets du jeu

`manifest.json` est le **seul** fichier à modifier pour ajouter ou remplacer un visuel ou un son du jeu. Chemins relatifs à ce dossier. En dev, recharger la page suffit (pas de rebuild).

Chaque entrée est facultative : sans fichier, le jeu dessine un rendu de secours (personnage rond coloré, bombe dessinée, sons synthétisés, décors dessinés).

## Personnages — `characters`

```json
"chien": {
  "name": "Chien",
  "image": "characters/chien.webp",
  "atlas": "characters/chien.json",
  "scale": 1,
  "poses": {
    "idle": "idle",
    "kick": "kick",
    "punch": { "anim": "idle", "rot": 0.12, "dx": 26 },
    "box": { "sprite": "chien-boxe", "anim": "box", "scale": 0.975 }
  }
}
```

- `image` : planche (sprite sheet), WebP de préférence.
- `atlas` : JSON au format TexturePacker (`frames` : `{ frame: {x, y, w, h}, anchor?: {x, y} }`) + `meta.anims` : `{ "idle": { "loop": true, "frames": [{ "frame": "idle_0", "ms": 260 }] } }`, `next` pour enchaîner une animation non bouclée. L'ancre par défaut est au milieu des pieds (0.5, 1). Une animation peut aussi être désignée par le nom d'une seule frame.
- `poses` : relie les poses logiques du jeu aux animations de l'atlas : `idle`, `run`, `start`, `stop`, `punch`, `kick`, `throw`, `duck`, `slide`, `ready`, `hold`, `catch`, `carry`, `hurt`, `win`, `lose`, et les poses des duels `box`, `box_punch`, `box_guard`, `box_hurt`, `box_win`, `paddle`, `paddle_hurt`, `pull`, `pull_hard`. Une pose absente retombe sur `idle`.
  Forme longue : `{ "anim", "sprite" (planche de la section sprites, pour une pose dessinée à part), "scale", "rot" (radians), "dx", "dy", "sx", "sy" (étirement fixe), "squash" (respiration) }`.
  Un personnage sans planche dédiée pour une pose donne une pose de repli (voir le renard) ; le jeu dessine alors lui-même l'accessoire (ex. la pagaie).
- `scale` : ajuste la taille relative (1 = hauteur normale).
- L'ordre des entrées = l'ordre de choix dans le salon (flèches ◀ ▶). L'id (`chien`) est envoyé au serveur : minuscules, chiffres, `-` ou `_`, 32 caractères max.

## Objets animés — `sprites`

Même format d'atlas. Utilisés par les micro-jeux via `drawSprite(id, animOuFrame, …)` et par les poses spéciales des personnages :

| id | Contenu |
| --- | --- |
| `bombe` | frames `b0`, `b1`, `b2`, `boom` (mèche du minuteur, bombes) |
| `balle` | ballon de LANCE LE PLUS LOIN |
| `skate` | planche de RESTE SUR LA RAMPE |
| `radeau` | radeau de RAME ! |
| `chien-boxe`, `chien-boxe-ko` | le chien en gants (anims `box`, `box_punch`, `box_guard`, `box_win`, `box_hurt`) |
| `chien-rame` | le chien assis qui pagaie (`rest`, `stroke`, `tired`) |
| `chien-corde` | le chien qui tire une corde (`c1`, `c2`) |
| `chien-ping` | le chien raquette de ping-pong (`ping`, `ping_ready`, `ping_hit`) |
| `route` | route en perspective (ESQUIVE LES BOMBES, RESTE SUR LA RAMPE) : une image, ancre en haut à gauche |
| `table-ping` | table de ping-pong : une image, ancre en haut à gauche |

## Musique — `music`

`menu` (menu et salon) et `match` (partie). MP3 en boucle ; la piste de match est accélérée avec le tempo (hauteur comprise) et baissée pendant les micro-jeux. Garder des fichiers raisonnables (~1,5 Mo).

## Effets — `sounds`

Facultatifs : `"win": "sounds/win.mp3"`. Noms disponibles : `tap`, `go`, `win`, `lose`, `tick`, `boom`, `speedup`, `boss`, `levelup`, `duel`, `hurt`, `jump`, `pop`, `whoosh`, `fanfare`, `select`, `hit`, `block`, `splash`. Un nom absent = son synthétisé.

## Décors — `backgrounds`

- Les 4 mondes : `{ "image": "backgrounds/foret.webp", "floor": 0.757 }`, où `floor` est la hauteur de la ligne de sol (0 = haut, 1 = bas). `sceneBg()` recadre l'image (sans la déformer) pour poser ce sol sur celui du jeu. Clés : `foret`, `ville`, `neige`, `futur` (1440×810). Chaque image sert aux micro-jeux de ce monde, à l'intro de niveau et à la scène des interludes ; absente = aplat de couleurs.

## Fond des écrans — `menu/fond.webp`

Fond du menu principal et du salon (1672×941, affiché en `cover`), référencé directement par le CSS et préchargé par `index.html`. Tout le reste de l'interface (logo, boutons, icônes) est dessiné en code : aucune autre image.
