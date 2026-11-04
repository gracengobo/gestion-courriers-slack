# CONTRATS - Projet G3 : Gestion des courriers via Slack

Version 0.1 - proposition du binome 5, a valider par tout le groupe.

Ce document est la reference commune des 5 binomes. Il dit comment les morceaux de code se parlent, pour qu'ils s'emboitent sans surprise.

---

## 0. Comment utiliser ce document

- Si ton code et ce fichier ne sont pas d'accord, c'est ton code qui change (ou on change ce fichier, mais ensemble).
- On ne change jamais un nom, un champ ou une valeur sans prevenir les binomes concernes. Le changement est ecrit ici, avec un nouveau numero de version (voir partie 11).
- Les mots entre guillemets, comme "RECU", s'ecrivent exactement comme indique : majuscules, sans accent.
- Les points marques **DECISION** sont des propositions a valider en reunion.
- Pour tester seul : on peut envoyer de faux messages RabbitMQ et appeler de fausses fonctions, tant que le format est respecte.

---

## 1. Vue d'ensemble

| Composant | Dossier | Binome | Base PostgreSQL | Port gRPC | Role |
|---|---|---|---|---|---|
| Infrastructure | `docker-compose.yml`, `infra/` | 1 | - | - | Lance les bases, RabbitMQ, MinIO |
| Passerelle Slack | `gateway/` | 2 | aucune | - | Recoit Slack, appelle les services en gRPC |
| Service Courrier | `service-courrier/` | 3 | `courrier_db` | 50051 | Cree le courrier, genere le numero |
| Service Workflow | `service-workflow/` | 4 | `workflow_db` | 50052 | Statuts, affectations, droits, historique |
| Service Notification | `service-notification/` | 4 | `notification_db` | - | Messages Slack, rappels, escalades |
| Service IA | `service-ia/` | 5 | `ia_db` | 50053 | OCR, resume, classement, suggestion |

### Deux facons de se parler

- **gRPC** : appel direct, on attend la reponse. Utilise par la passerelle vers les services (partie 4).
- **RabbitMQ** : on depose un message et on n'attend pas. Utilise entre les services (partie 3).

### Qui parle a qui

- La passerelle parle en gRPC au Service Courrier, au Service Workflow et au Service IA.
- Le Service Courrier publie `courrier.cree`.
- Le Service IA et le Service Workflow ecoutent `courrier.cree`. L'IA publie ensuite `courrier.analyse`.
- Le Service Workflow publie `courrier.affecte` et `courrier.statut_change`.
- Le Service Notification ecoute tous ces messages et envoie les messages Slack.

### Scenario 1 : un courrier arrive

1. L'agent du secretariat remplit le formulaire (ou depose un fichier). Slack appelle la passerelle.
2. La passerelle repond a Slack tout de suite (moins de 3 secondes). Si un fichier est joint, elle le depose dans MinIO.
3. La passerelle appelle `CourrierService.CreerCourrier` en gRPC.
4. Le Service Courrier enregistre, genere le numero `CE-2026-0042` et publie `courrier.cree`.
5. Le Service IA recoit `courrier.cree`, fait l'OCR et l'analyse, puis publie `courrier.analyse`.
6. Le Service Workflow recoit `courrier.cree`, cree le suivi (statut "ENREGISTRE") et calcule l'echeance. Si un destinataire est deja choisi, il l'affecte et publie `courrier.affecte`.
7. Le Service Notification recoit `courrier.analyse` et envoie la carte "Affecter a ... [Valider] [Modifier]" au responsable.
8. Quand le responsable valide, la passerelle appelle `WorkflowService.AffecterCourrier`. Le Workflow publie `courrier.affecte`.
9. Le Service Notification envoie le message prive au destinataire, avec les boutons.

### Scenario 2 : le destinataire clique sur "Recu"

1. Slack envoie le clic a la passerelle, qui repond a Slack tout de suite.
2. La passerelle appelle `WorkflowService.ChangerStatut` (action `accuser_reception`).
3. Le Workflow verifie les droits et la version, enregistre, puis publie `courrier.statut_change`.
4. Le Service Notification met a jour le message Slack et previent le secretariat.

---

## 2. Vocabulaire commun

Tout le monde utilise exactement ces valeurs, dans les messages, les bases et les appels gRPC.

### Statuts

| Valeur | Sens |
|---|---|
| "ENREGISTRE" | Courrier saisi, numero cree |
| "AFFECTE" | Destinataire designe et notifie |
| "RECU" | Le destinataire a accuse reception |
| "EN_COURS" | Le destinataire traite le courrier |
| "TRAITE" | Clos, avec commentaire |
| "ARCHIVE" | Fige, lecture seule |
| "REJETE" | Ecarte, avec motif |

Le retard n'est pas un statut : c'est un calcul (echeance depassee et courrier ni "TRAITE" ni "ARCHIVE").

### Autres valeurs

| Sujet | Valeurs |
|---|---|
| Type de courrier | "ENTRANT", "SORTANT", "INTERNE" |
| Priorite et urgence | "BASSE", "NORMALE", "HAUTE" (dans le formulaire : "Normale" donne "NORMALE", "Urgente" donne "HAUTE") |
| Categorie | "ADMINISTRATIF", "FINANCIER", "JURIDIQUE", "PEDAGOGIQUE", "RH", "AUTRE" |
| Roles | "AGENT" (par defaut), "SECRETARIAT", "RESPONSABLE", "DIRECTION", "ADMIN" |
| Langue | "fr", "en" |
| Confidentiel | booleen `confidentiel` (true ou false) |

### Identifiants et formats

- **Numero de courrier** : `CE-AAAA-NNNN` (entrant), `CS-AAAA-NNNN` (sortant), `CI-AAAA-NNNN` (interne). Exemple : `CE-2026-0042`.
  - Un compteur par type et par annee, qui recommence a 0001 chaque annee.
  - Seul le Service Courrier le genere. Il ne change jamais et n'est jamais reutilise.
  - Le numero est la reference partout : messages, gRPC, noms de fichiers, logs.
- **Utilisateur** : toujours son identifiant Slack (exemple `U01ABC23`). Pas d'autre identifiant.
- **Service** (departement) : un code en majuscules, par exemple "SCOLARITE", "FINANCES", "RH". Le code est la reference.
- **Dates et heures** : format ISO 8601 en UTC, exemple `2026-11-05T09:30:00Z`. Une date seule s'ecrit `2026-11-05`.
- **Echeance par defaut** (RG-06) : 5 jours ouvres pour "NORMALE", 48 heures pour "HAUTE". Calculee par le Service Workflow.

### Qui possede quelles donnees

| Donnees | Base proprietaire |
|---|---|
| Courrier (objet, expediteur, type, priorite, confidentiel, piece jointe) | `courrier_db` |
| Statut, affectations, echeance, historique, utilisateurs, roles, services | `workflow_db` (DECISION, voir partie 10) |
| Resultat d'analyse de l'IA, decision humaine sur cette analyse | `ia_db` |
| Rappels planifies, emplacement des messages Slack (`dmChannel`, `dmTs`), messages deja traites | `notification_db` |

**Regle d'or** : un service ne lit jamais la base d'un autre. Il utilise gRPC ou les messages.

---

## 3. Messages RabbitMQ

### Regles generales

- Un seul exchange, de type `topic`, nomme `courrier.events`, durable.
- Le nom de l'evenement sert de cle de routage (exemple : `courrier.cree`).
- Chaque service a ses propres files, nommees `<service>.<evenement>` :
  - `ia.courrier.cree`
  - `workflow.courrier.cree`
  - `notification.courrier.cree`
  - `notification.courrier.analyse`
  - `notification.courrier.affecte`
  - `notification.courrier.statut_change`
  - `workflow.courrier.en_retard`
- Messages en JSON, encodage UTF-8, marques "persistent".
- Le consommateur confirme (ack) le message seulement apres l'avoir traite.
- Un message qui echoue est retente 3 fois (attente de 5 secondes), puis envoye dans la file `<nom de la file>.erreurs`.
- **Doublons** : chaque service garde dans sa base la liste des `eventId` deja traites et ignore ceux qu'il a deja vus.

### L'enveloppe (identique pour tous les evenements)

```json
{
  "eventId": "7c1f3b9e-5a0d-4d8e-9a77-0c2f8d1b6e44",
  "type": "courrier.cree",
  "version": 1,
  "emisLe": "2026-11-05T09:30:00Z",
  "emisPar": "service-courrier",
  "numero": "CE-2026-0042",
  "donnees": { }
}
```

Le contenu propre a chaque evenement va dans `donnees`. Ci-dessous, seul `donnees` est montre.

### Les 5 evenements

| Evenement | Publie par | Ecoute par |
|---|---|---|
| `courrier.cree` | Service Courrier | IA, Workflow, Notification (confirmation a l'agent) |
| `courrier.analyse` | Service IA | Notification |
| `courrier.affecte` | Service Workflow | Notification |
| `courrier.statut_change` | Service Workflow | Notification |
| `courrier.en_retard` | Service Notification | Workflow (pour le journal d'audit) |

#### `courrier.cree`

```json
{
  "type": "ENTRANT",
  "objet": "Demande de bourse",
  "expediteur": "Mme Ngo",
  "dateCourrier": "2026-11-05",
  "priorite": "NORMALE",
  "confidentiel": false,
  "serviceCode": "SCOLARITE",
  "destinataireSlackId": "U01ABC23",
  "agentSlackId": "U02DEF45",
  "pieceJointe": {
    "bucket": "scans",
    "cle": "2026/3f2a9c1e.pdf",
    "nomOriginal": "lettre.pdf",
    "typeMime": "application/pdf",
    "tailleOctets": 245000,
    "empreinteSha256": "ab12..."
  }
}
```

- `destinataireSlackId`, `serviceCode` et `pieceJointe` peuvent valoir `null`.
- Le texte du courrier n'est pas dans ce message : l'IA le lit dans MinIO.

#### `courrier.analyse`

```json
{
  "statutAnalyse": "ok",
  "categorie": "ADMINISTRATIF",
  "confiance": 0.87,
  "urgence": "HAUTE",
  "datesDetectees": ["2026-11-20"],
  "resume": "Resume de 2 a 3 phrases.",
  "serviceSuggere": "SCOLARITE",
  "justification": "Le courrier parle d'une bourse.",
  "produitParIA": true,
  "langueDetectee": "fr"
}
```

- `statutAnalyse` vaut "ok", "echec" ou "ignore_confidentiel".
- Si `statutAnalyse` n'est pas "ok", les autres champs valent `null` et le courrier se traite a la main (repli manuel, BF-46).
- `produitParIA` vaut toujours `true` : l'affichage doit signaler que le contenu vient de l'IA, avec la confiance.

#### `courrier.affecte`

```json
{
  "destinataireSlackId": "U01ABC23",
  "ancienDestinataireSlackId": null,
  "serviceCode": "SCOLARITE",
  "responsableSlackId": "U03GHI67",
  "motif": null,
  "echeance": "2026-11-12T16:00:00Z",
  "objet": "Demande de bourse",
  "priorite": "NORMALE",
  "confidentiel": false,
  "agentSlackId": "U02DEF45",
  "langueDestinataire": "fr"
}
```

On repete `objet`, `priorite` et `langueDestinataire` ici pour que le Service Notification n'ait pas besoin d'appeler d'autres services.

#### `courrier.statut_change`

```json
{
  "ancienStatut": "AFFECTE",
  "nouveauStatut": "RECU",
  "acteurSlackId": "U01ABC23",
  "destinataireSlackId": "U01ABC23",
  "agentSlackId": "U02DEF45",
  "commentaire": null,
  "motif": null
}
```

#### `courrier.en_retard`

```json
{
  "echeance": "2026-11-12T16:00:00Z",
  "joursDeRetard": 1,
  "destinataireSlackId": "U01ABC23",
  "responsableSlackId": "U03GHI67"
}
```

### Rappels et escalade (Service Notification)

- Le Service Notification enregistre l'echeance quand il recoit `courrier.affecte`.
- Il envoie un rappel au destinataire **2 jours avant l'echeance**, puis **le jour de l'echeance** (BF-32).
- Il annule les rappels quand le statut devient "TRAITE", "ARCHIVE" ou "REJETE".
- Si l'echeance est depassee, il alerte le responsable et publie `courrier.en_retard` (BF-33).

---

## 4. Contrats gRPC

### Regles generales

- Les fichiers `.proto` sont dans le dossier `proto/` a la racine : `courrier.proto`, `workflow.proto`, `ia.proto`. Package : `courrier.v1`.
- Le binome 2 est proprietaire des fichiers `.proto`. On ne les modifie qu'apres accord des binomes concernes.
- La passerelle met un delai maximum de 2 secondes par appel (Slack exige une reponse en moins de 3 secondes).
- Chaque requete contient `acteurSlackId` : la personne qui fait l'action. Le service verifie ses droits, pas la passerelle seule.

### Methodes

**CourrierService** (port 50051)

| Methode | Role |
|---|---|
| `CreerCourrier` | Enregistre un courrier, renvoie le numero |
| `ObtenirCourrier` | Details d'un courrier a partir de son numero |
| `RechercherCourriers` | Recherche par numero, mots de l'objet, expediteur, categorie, service, periode |
| `CorrigerCourrier` | Modifie un courrier non encore recu, avec trace de l'ancienne valeur |

**WorkflowService** (port 50052)

| Methode | Role |
|---|---|
| `AffecterCourrier` | Affecte ou redirige (motif obligatoire pour une redirection) |
| `ChangerStatut` | Fait avancer le statut (voir actions ci-dessous) |
| `ObtenirHistorique` | Historique complet d'un courrier |
| `ListerCourriersDuDestinataire` | Courriers a traiter, tries par echeance |
| `ListerCourriersDuService` | Vue du responsable, avec les retards |
| `ObtenirStatistiques` | Chiffres pour le tableau de bord |
| `ObtenirUtilisateur` | Role, service et langue d'une personne |
| `DefinirLangue` | Enregistre la langue choisie ("fr" ou "en") |
| administration (DECISION) | Creer et modifier les services, donner les roles, regler les delais |

**IAService** (port 50053)

| Methode | Role |
|---|---|
| `ObtenirAnalyse` | Renvoie l'analyse deja faite d'un courrier |
| `EnregistrerDecision` | Garde la decision humaine : "VALIDEE", "CORRIGEE" ou "REJETEE" (BF-45) |
| `InterpreterRecherche` | Transforme une phrase ("courriers urgents de la scolarite non traites") en filtres (BF-44) |

### Actions de `ChangerStatut`

Ces mots servent aussi d'identifiants pour les boutons Slack (partie 7).

| Action | Statut de depart | Statut d'arrivee | Qui peut | Obligatoire |
|---|---|---|---|---|
| `accuser_reception` | "AFFECTE" | "RECU" | destinataire principal | rien |
| `prendre_en_charge` | "RECU" | "EN_COURS" | destinataire principal | rien |
| `cloturer` | "EN_COURS" | "TRAITE" | destinataire principal | commentaire |
| `rejeter` | "ENREGISTRE" ou "AFFECTE" | "REJETE" | secretariat ou responsable | motif |
| `archiver` | "TRAITE" | "ARCHIVE" | secretariat | rien |
| `deleguer` | "RECU" ou "EN_COURS" | meme statut | destinataire principal | motif et nouveau destinataire |
| `signaler_erreur` | "AFFECTE" | "ENREGISTRE" | destinataire principal | motif |

Regles : aucun statut ne peut etre saute (RG-03). Un courrier "ARCHIVE" est en lecture seule (RG-05).

### Double clic et conflits

`ChangerStatut` recoit `versionAttendue`. Si la version du courrier a change entre temps, le service refuse avec le code "CONFLIT_VERSION" et rien n'est modifie.

### Erreurs

Chaque erreur gRPC porte un code gRPC et un `code-metier` (dans les metadonnees). La passerelle transforme le code metier en message clair, en francais ou en anglais.

| Code gRPC | `code-metier` | Quand |
|---|---|---|
| INVALID_ARGUMENT | "CHAMP_MANQUANT" | Saisie incomplete |
| INVALID_ARGUMENT | "COMMENTAIRE_OBLIGATOIRE" | Cloture sans commentaire |
| INVALID_ARGUMENT | "MOTIF_OBLIGATOIRE" | Rejet, redirection ou delegation sans motif |
| PERMISSION_DENIED | "DROIT_INSUFFISANT" | Role ou personne non autorisee |
| NOT_FOUND | "COURRIER_INTROUVABLE" | Numero inconnu |
| FAILED_PRECONDITION | "TRANSITION_INTERDITE" | Saut d'etape ou action non permise |
| FAILED_PRECONDITION | "COURRIER_ARCHIVE" | Modification d'un courrier archive |
| ABORTED | "CONFLIT_VERSION" | Double clic ou modification simultanee |
| UNAVAILABLE | "SERVICE_INDISPONIBLE" | Service ou base en panne |

---

## 5. Fichiers (MinIO)

- Un seul bucket : `scans`.
- Nom d'un objet : `AAAA/<uuid>.<extension>` (exemple `2026/3f2a9c1e.pdf`). On ne met jamais le nom d'origine ni le numero dans le nom : le nom d'origine est dans `pieceJointe.nomOriginal`.
- Types acceptes : PDF, JPG, PNG. Taille maximale : 10 Mo.
- **DECISION** : c'est la **passerelle** qui telecharge le fichier depuis Slack, controle le type et la taille, calcule l'empreinte SHA-256 et le depose dans MinIO. Raison : elle seule a le droit de telecharger depuis Slack. Elle envoie ensuite seulement la reference dans `CreerCourrier`.
- Le Service IA ne fait que **lire** dans MinIO (pas d'ecriture).
- Les messages contiennent une reference au fichier (bucket et cle), jamais le fichier lui-meme.

---

## 6. Infrastructure (binome 1)

### Noms des conteneurs

| Conteneur | Port machine | Port dans Docker |
|---|---|---|
| `postgres-courrier` | 5433 | 5432 |
| `postgres-workflow` | 5434 | 5432 |
| `postgres-ia` | 5435 | 5432 |
| `postgres-notification` | 5436 | 5432 |
| `rabbitmq` | 5672 (messages), 15672 (interface web) | pareil |
| `minio` | 9000 (API), 9001 (interface web) | pareil |

- Un seul reseau Docker commun a tous les conteneurs.
- Depuis ta machine (hors Docker), on utilise `localhost` et le **port machine**. Depuis un conteneur, on utilise le **nom du conteneur** et le **port dans Docker**.
- `docker-compose up -d` doit tout demarrer en arriere-plan.
- Les fichiers d'initialisation des bases sont dans `infra/init/` (un `.sql` par base). L'exchange RabbitMQ `courrier.events` est cree au demarrage.

### Bases de donnees

| Base | Utilisateur | Mot de passe (developpement seulement) |
|---|---|---|
| `courrier_db` | `courrier` | `courrier_dev` |
| `workflow_db` | `workflow` | `workflow_dev` |
| `ia_db` | `ia` | `ia_dev` |
| `notification_db` | `notification` | `notification_dev` |

### Fichier `.env.example` commun

Chaque service a son propre `.env.example`, avec ces noms de variables (et seulement ceux dont il a besoin) :

```
# Base de donnees (exemple pour le Service Courrier, depuis la machine)
DATABASE_URL=postgresql://courrier:courrier_dev@localhost:5433/courrier_db

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE=courrier.events

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=scans

# Adresses gRPC (utilisees par la passerelle)
GRPC_COURRIER_URL=localhost:50051
GRPC_WORKFLOW_URL=localhost:50052
GRPC_IA_URL=localhost:50053

# Slack (passerelle et Service Notification)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...

# IA (Service IA)
IA_FOURNISSEUR=gemini
IA_API_KEY=...
```

Les vrais secrets (jetons Slack, cle IA) ne vont **jamais** dans Git. On commit `.env.example`, jamais `.env`.

---

## 7. Slack

### Qui fait quoi

- La **passerelle** recoit les commandes et les clics. Elle ouvre les formulaires (modales), repond a Slack en moins de 3 secondes et donne les reponses visibles seulement par la personne.
- Le **Service Notification** est le seul a envoyer les messages aux utilisateurs (messages prives, canaux de service, rappels, escalades) et a mettre a jour les messages existants.
- Le Service Notification garde dans `notification_db` l'emplacement de chaque message (`dmChannel`, `dmTs`) avec le numero du courrier, pour pouvoir le mettre a jour apres un clic.

### Commandes

| Commande | Role autorise |
|---|---|
| `/courrier nouveau` | Secretariat |
| `/courrier sortant` | Secretariat |
| `/courrier interne` | Secretariat |
| `/courrier chercher [mots]` | Tous (selon droits) |
| `/courrier statut [numero]` | Tous (selon droits) |
| `/courrier mes-courriers` | Destinataire |
| `/courrier stats` | Direction, responsable |
| `/courrier admin` | Administrateur |
| `/courrier aide` | Tous |
| `/courrier langue` | Tous |

### Identifiants des boutons

Le `action_id` d'un bouton est le nom de l'action (partie 4) : `accuser_reception`, `prendre_en_charge`, `cloturer`, `rejeter`, `archiver`, `deleguer`, `signaler_erreur`. Deux boutons de plus pour la carte de validation : `valider_affectation` et `modifier_affectation`.

La `value` d'un bouton est toujours le **numero du courrier** (exemple `CE-2026-0042`).

### Textes francais et anglais

- Un dossier partage `commun/i18n/` avec `fr.json` et `en.json`. Les memes cles sont utilisees par la passerelle et par le Service Notification.
- Un message n'est jamais ecrit en dur dans le code : on utilise une cle (exemple `notification.courrier_recu`).
- La langue d'un utilisateur vient du Service Workflow (`ObtenirUtilisateur`) ou des champs `langue...` des messages.

### Securite

**DECISION** : pour la premiere version, on garde le Socket Mode du MVP (pas besoin d'adresse publique). La verification des signatures Slack sera ajoutee si on passe aux webhooks HTTPS, comme prevu dans le cahier des charges.

---

## 8. Regles techniques communes

- **Versions** : Node.js 20 (LTS), TypeScript, Prisma, `@grpc/grpc-js`, `@grpc/proto-loader`, `amqplib`, `minio`, `node-cron`, `tesseract.js`. Chacun garde les memes versions que celles ecrites dans le `package.json` du depot (pas de mise a jour sans prevenir).
- **Structure du depot** :

```
courrier-slack/
  CONTRATS.md
  docker-compose.yml
  .env.example
  infra/init/           (fichiers .sql)
  proto/                (fichiers .proto)
  commun/               (types partages, i18n)
  gateway/
  service-courrier/
  service-workflow/
  service-ia/
  service-notification/
```

- Chaque dossier de service contient : `src/`, `Dockerfile`, `package.json`, `.env.example` et un `README.md` court (comment lancer et tester).
- **Logs** : chaque ligne commence par le nom du service entre crochets, puis le numero du courrier quand il y en a un. Exemple : `[service-ia] CE-2026-0042 analyse terminee`.
- **Types partages** : les types TypeScript des messages (partie 3) sont ecrits une seule fois dans `commun/types/`.
- **Pannes** : si un composant est indisponible, on renvoie une erreur claire ("SERVICE_INDISPONIBLE"), on ne plante pas, et le courrier n'est pas perdu.
- **Git** : une branche par fonctionnalite, fusionnee apres relecture par une personne d'un autre binome. Les fichiers `.proto` et `CONTRATS.md` ne se modifient qu'apres accord.
- **Tests** : chaque binome fournit au moins un exemple pour tester son service seul (faux message ou fausse requete).

---

## 9. Regles propres a l'IA (binome 5)

- L'IA propose, l'humain decide : aucune affectation ni reponse n'est appliquee sans validation (BF-45).
- Le modele repond en JSON. Le Service IA valide ce JSON avant de l'utiliser. Une reponse invalide est rejetee.
- Une seule analyse par courrier. Le resultat est garde dans `ia_db`.
- Un courrier "confidentiel" n'est pas envoye au fournisseur d'IA : le Service IA publie `courrier.analyse` avec `statutAnalyse` egal a "ignore_confidentiel".
- Si l'API ne repond pas (delai depasse, nouvelles tentatives echouees), le Service IA publie `courrier.analyse` avec `statutAnalyse` egal a "echec". Le courrier reste enregistre et se traite a la main.
- Tout contenu produit par l'IA est signale comme tel a l'utilisateur, avec son niveau de confiance.

---

## 10. Ce qui n'est attribue a personne (a trancher )

| Sujet | Besoins du cahier | Proposition |
|---|---|---|
| Utilisateurs, roles, services | BF-24, 25, 30, 22 | Base `workflow_db`, binome 4 (le cahier prevoit les droits par role dans les services metier) |
| Administration et interface web minimale | BF-24 a 29 | A attribuer : un binome qui finit en avance, ou le chef |
| Journal d'audit | BF-27, BF-34 | Service Workflow |
| Recherche | BF-06, 44 | Service Courrier pour les mots et les champs, Workflow pour le statut, la passerelle croise les deux (DECISION) |
| Statistiques, resume quotidien | BF-21, 23 | Workflow calcule, Notification envoie le resume |
| Bilinguisme | BF-37 | Dossier `commun/i18n/`, entretenu par binomes 2 et 4 |
| Depot de fichier et pieces jointes | BF-02, 03 | Passerelle (voir partie 5) |
| Tests, securite, integration continue, sauvegardes | Phases 7 et 8 | A attribuer : binome 1 apres l'infrastructure |
| Documentation, UML, manuel, soutenance | Phases 1, 2 et 8 | Chef de groupe, avec un volontaire |

La charge du binome 4 (Workflow et Notification) est elevee : il faudra peut-etre deplacer une partie vers un autre binome.

---

## 11. Historique des versions

| Version | Date | Changement | Auteur |
|---|---|---|---|
| 0.1 | 2026-11-04 | Premiere proposition | binome 5 |
