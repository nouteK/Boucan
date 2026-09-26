# Décisions d'architecture (ADR)

Décisions structurantes, difficiles à reconstituer six mois plus tard. Une décision = un fichier court : contexte, décision, conséquences. Pour revenir sur une décision, ajouter un nouvel ADR qui la remplace (ne pas réécrire l'ancien).

| # | Décision | Statut |
| --- | --- | --- |
| [0001](0001-websocket-json.md) | WebSocket brut + JSON plutôt que Socket.IO | accepté |
| [0002](0002-zod-source-unique.md) | Schémas Zod = source unique ; types, JSON Schema et fixtures générés | accepté |
| [0003](0003-snapshots-et-evenements.md) | Snapshots complets + événements sémantiques (pas de deltas) | accepté |
| [0004](0004-autorite-par-micro-jeu.md) | Autorité choisie par micro-jeu : local / relay / server | accepté |
| [0005](0005-scoring.md) | Scoring abstrait : résultats bruts → rang → points | accepté |
| [0006](0006-temps-et-synchronisation.md) | Temps : horloge serveur, timestamps, compensation par RTT | accepté |
| [0007](0007-deconnexion-host.md) | Déconnexion, reconnexion et host | accepté |
| [0008](0008-etat-en-memoire.md) | État en mémoire, un seul processus, pas de persistance | accepté |
| [0009](0009-moteur-sans-io.md) | Moteur sans IO, exécutable dans le navigateur | accepté |
