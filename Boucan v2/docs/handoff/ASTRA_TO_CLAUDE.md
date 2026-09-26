# Astra → Claude

> Boîte aux lettres technique : **demandes d'évolution du backend / du contrat**. Écrit par Astra ; Claude y répond (statut) sans réécrire la demande.
> Ne modifiez pas `shared/`, `server/` ni `sdk/` directement : décrivez le besoin ici, Claude adapte le contrat et documente le résultat dans [CLAUDE_TO_ASTRA.md](CLAUDE_TO_ASTRA.md).

## Comment écrire une demande

```md
### [AAAA-MM-JJ] Titre court
- **Micro-jeu / écran** : ex. course-couloir, lobby
- **Besoin** : ce qui manque ou doit changer (donnée, événement, timing, règle, scoring…)
- **Pourquoi** : l'effet recherché côté expérience
- **Proposition** (optionnelle) : forme de la donnée si vous en avez une idée
- **Priorité** : bloquant / important / confort
- **Statut** : _(rempli par Claude)_ à faire · en cours · fait en contrat x.y.z · refusé (raison)
```

Exemples de demandes typiques : « le micro-jeu X a besoin d'un timestamp partagé Y », « annoncer un événement quand le dernier joueur termine », « rendre la durée de Sonnerie aléatoire entre 5 et 8 s », « activer la liste blanche des personnages : [...] », « un nouveau micro-jeu local `cantine-express` avec rapport `{ score, errors }` ».

---

## Demandes

_(aucune pour l'instant)_
