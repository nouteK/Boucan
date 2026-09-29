# Décisions d'architecture (ADR)

Décisions structurantes, difficiles à reconstituer six mois plus tard. Une décision = un fichier court : contexte, décision, conséquences. Pour revenir sur une décision, ajouter un nouvel ADR qui la remplace (ne pas réécrire l'ancien).

| # | Décision | Statut |
| --- | --- | --- |
| [0001](0001-websocket-json.md) | WebSocket brut + JSON plutôt que Socket.IO | accepté |
| [0002](0002-zod-source-unique.md) | Schémas Zod = source unique ; types, JSON Schema et fixtures générés | accepté (dérivés retirés par 0011) |
| [0003](0003-snapshots-et-evenements.md) | Snapshots complets + événements sémantiques (pas de deltas) | accepté |
| [0004](0004-autorite-par-micro-jeu.md) | Autorité choisie par micro-jeu : local / relay / server | remplacé par 0010 |
| [0005](0005-scoring.md) | Scoring abstrait : résultats bruts → rang → points | remplacé par 0010 |
| [0006](0006-temps-et-synchronisation.md) | Temps : horloge serveur, timestamps, compensation par RTT | accepté |
| [0007](0007-deconnexion-host.md) | Déconnexion, reconnexion et host | accepté |
| [0008](0008-etat-en-memoire.md) | État en mémoire, un seul processus, pas de persistance | accepté |
| [0009](0009-moteur-sans-io.md) | Moteur sans IO, exécutable dans le navigateur | accepté |
| [0010](0010-vies-et-autorite-v2.md) | Partie façon WarioWare : vies, rythme, autorité solo (client) / duel (serveur) | accepté |
| [0011](0011-client-unique-monorepo.md) | Un seul client dans le monorepo ; dérivés JSON Schema / fixtures supprimés | accepté |
| [0012](0012-nouveaux-mini-jeux.md) | 21 mini-jeux repris du prototype OUAF WARE, réécrits dans l'architecture Boucan | accepté (catalogue remplacé par 0013) |
| [0013](0013-catalogue-ouaf-ware.md) | Catalogue = les 32 jeux du prototype OUAF WARE v2 ; 4 mondes au lieu des lieux école ; niveaux sans boss ; boutons tactiles | accepté (catalogue et mondes remplacés par 0014) |
| [0014](0014-catalogue-ouaf-ware-v3.md) | Catalogue = les 38 jeux du prototype OUAF WARE v3 ; 5 mondes en diorama ; manches faciles ; contour papier, objets en images, sons | accepté |
