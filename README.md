# BOUCAN

Jeu navigateur multijoueur façon **WarioWare** : des micro-jeux de quelques secondes enchaînés à toute vitesse, en ligne, de 1 à 8 joueurs (chacun sur son écran). Des vies, des accélérations, des boss, des duels — le dernier debout gagne.

Tout le projet est dans [`Boucan v2/`](Boucan%20v2/) : voir son [README](Boucan%20v2/README.md) (démarrage, commandes, organisation) et [`docs/`](Boucan%20v2/docs/).

## Branches

| Branche | Rôle |
| --- | --- |
| `main` | version **stable**, celle qui est en ligne. Ne bouge que par fusion de `dev`, une fois la version testée et validée |
| `dev` | travail en cours : tous les nouveaux commits arrivent ici |

Chaque push sur `main` ou `dev` lance les tests et le build ([CI](.github/workflows/ci.yml)).

## Jouer, tester, mettre en ligne (Windows + Docker Desktop)

Dans le dossier `Boucan v2` :

| Fichier | Effet |
| --- | --- |
| `Tester la version dev.bat` | lance la branche `dev` à côté du jeu en ligne : http://localhost:3002 + un lien public temporaire (téléphones, amis) |
| `Arreter la version dev.bat` | arrête cette version de test |
| `Mettre en ligne.bat` | met en ligne la branche `main` (port 3001 + tunnel public) |
| `Revenir a la version precedente.bat` | remet la version en ligne d'avant |

Les images Docker sont construites depuis la **branche** (git), jamais depuis les fichiers du dossier : du travail en cours non commité ne part pas en ligne par accident. Détails : [docs/DEPLOYMENT.md](Boucan%20v2/docs/DEPLOYMENT.md).

## Développer

```bash
cd "Boucan v2"
npm install
npm run dev        # serveur :3001 + client http://localhost:5180
npm test
```
