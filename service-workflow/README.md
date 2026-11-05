# Service Workflow

Microservice TypeScript chargé du cycle de vie des courriers : statuts,
affectations, droits, échéances et historique. Il expose `WorkflowService` en
gRPC et réagit aux événements RabbitMQ.

## Rôle

- Consomme `courrier.cree` : crée le suivi du courrier, calcule l'échéance et
  l'affecte si un destinataire est déjà désigné (publication de
  `courrier.affecte`).
- Consomme `courrier.en_retard` : journalise l'escalade.
- Expose `WorkflowService` sur le port `50052` : affectation, redirection,
  changement de statut, historique, recherche par destinataire ou service,
  statistiques, langue de l'utilisateur.
- Publie `courrier.affecte` et `courrier.statut_change` sur l'exchange
  `courrier.events`, avec l'enveloppe décrite dans `CONTRATS.md`.

## Prérequis

- Node.js 20 ou plus récent
- PostgreSQL (base `workflow_db`, port `5434` avec le compose du dépôt)
- RabbitMQ (port `5672`)

## Démarrage

Depuis la racine du dépôt :

```powershell
docker compose up -d postgres-workflow rabbitmq
```

Puis, depuis `service-workflow` :

```powershell
Copy-Item .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Le serveur gRPC écoute sur `0.0.0.0:50052`. Pour la version compilée :

```powershell
npm run build
npm start
```

## Configuration

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `DATABASE_URL` | — | Connexion PostgreSQL de `workflow_db` |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | Connexion RabbitMQ |
| `RABBITMQ_EXCHANGE` | `courrier.events` | Exchange topic partagé |
| `GRPC_PORT` | `50052` | Port d'écoute gRPC |
| `DELAI_OUVRABLE_JOURS` | `5` | Échéance par défaut pour une priorité normale |
| `WORKFLOW_ROLE_PAR_DEFAUT` | `SECRETARIAT` | Rôle attribué à un utilisateur inconnu |

## Échéances et statuts

- Échéance : jours ouvrés à partir de la réception, fixée à 16:00 UTC.
- Transitions autorisées :

| Action | Statut de départ | Statut d'arrivée | Condition |
| --- | --- | --- | --- |
| `accuser_reception` | AFFECTE | RECU | Destinataire uniquement |
| `prendre_en_charge` | RECU | EN_COURS | Destinataire uniquement |
| `cloturer` | EN_COURS | TRAITE | Commentaire obligatoire |
| `rejeter` | ENREGISTRE, AFFECTE | REJETE | Motif obligatoire |
| `archiver` | TRAITE | ARCHIVE | Rôle autorisé |
| `deleguer` | RECU, EN_COURS | inchangé | Motif et nouveau destinataire |
| `signaler_erreur` | AFFECTE | ENREGISTRE | Motif obligatoire |

Un courrier `ARCHIVE` est figé. Chaque changement vérifie la version du suivi
et renvoie `CONFLIT_VERSION` en cas de modification concurrente.

## Protocole

Les fichiers `proto/workflow.proto` et `proto/courrier.proto` sont des copies du
contrat fourni par le binôme 2. Ils doivent rester identiques aux fichiers
`proto/` à la racine du dépôt après fusion des branches.

Les erreurs métier transportent leur code dans la métadonnée gRPC
`code-metier` (`COURRIER_INTROUVABLE`, `TRANSITION_INTERDITE`,
`DROIT_INSUFFISANT`, `CONFLIT_VERSION`, etc.).

## Tests

```powershell
npm run typecheck
npm test
$env:GRPC_PORT="50999"; npm run test:grpc
```

`npm test` exécute `src/test-statuts.ts` : calcul des jours ouvrés et
transitions de statut. `npm run test:grpc` démarre le serveur sur un port de
test et vérifie qu'une méthode du contrat est bien reliée. La base, RabbitMQ et
Slack ne sont pas nécessaires pour ces tests.

## Structure

```text
proto/                          Copies du contrat gRPC
prisma/schema.prisma            Modèles suivis, historique, utilisateurs
prisma/migrations/              Migration SQL versionnée
src/domain/echeance.ts          Calcul des jours ouvrés
src/domain/statuts.ts           Transitions et droits
src/services/workflow.service.ts Logique métier et statistiques
src/rabbitmq/                   Consommateur et publication
src/server.ts                   Serveur gRPC
src/index.ts                    Démarrage et reconnexion RabbitMQ
```
