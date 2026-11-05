# Service Notification

Microservice TypeScript qui envoie tous les messages Slack liés aux courriers :
confirmation de création, carte de validation de l'analyse, affectation, suivi
de statut, rappels et escalades. Il conserve dans `notification_db` les
échéances, les emplacements des messages Slack et les événements déjà traités.

## Rôle

- Consomme `courrier.cree`, `courrier.analyse`, `courrier.affecte` et
  `courrier.statut_change`.
- Envoie en message privé Slack :
  - la confirmation d'enregistrement à l'agent qui a créé le courrier ;
  - la carte « Affectation proposée » avec les boutons `valider_affectation`
    et `modifier_affectation` après une analyse IA réussie ;
  - l'affectation au destinataire, avec les boutons d'action de son statut.
- Met à jour le message du destinataire à chaque changement de statut et
  prévient le secrétariat.
- Planifie les rappels : 2 jours avant l'échéance, le jour de l'échéance, puis
  alerte le responsable en cas de retard (BF-32, BF-33).
- Publie `courrier.en_retard` pour le journal d'audit du Service Workflow.

Les rappels sont annulés dès que le courrier passe à `TRAITE`, `ARCHIVE` ou
`REJETE`.

## Prérequis

- Node.js 20 ou plus récent
- PostgreSQL (`notification_db`, port `5436` avec le compose du dépôt)
- RabbitMQ (port `5672`)
- Un bot Slack avec les droits `chat:write` et `im:write`

## Démarrage

Depuis la racine du dépôt :

```powershell
docker compose up -d postgres-notification rabbitmq
```

Puis, depuis `service-notification` :

```powershell
Copy-Item .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Renseigner `SLACK_BOT_TOKEN` dans `.env`. Sans jeton, le service démarre quand
même mais journalise les messages au lieu de les envoyer.

## Configuration

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `DATABASE_URL` | — | Connexion PostgreSQL de `notification_db` |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | Connexion RabbitMQ |
| `RABBITMQ_EXCHANGE` | `courrier.events` | Exchange topic partagé |
| `SLACK_BOT_TOKEN` | — | Jeton du bot (`xoxb-...`) |
| `RAPPELS_CRON` | `0 8 * * *` | Heure du contrôle quotidien des rappels |
| `RAPPELS_FUSEAU` | `UTC` | Fuseau du planificateur `node-cron` |
| `I18N_DIR` | `<dépôt>/commun/i18n` | Dossier des traductions |

## Textes et langues

Aucun texte de message n'est écrit dans le code : les clés
`notification.*` et `statut.*` viennent de `commun/i18n/fr.json` et
`commun/i18n/en.json`. La langue est lue dans `langueDestinataire` (événements
du Workflow) ou dans le suivi local, avec repli sur le français.

## Files RabbitMQ

| File | Événement |
| --- | --- |
| `notification.courrier.cree` | `courrier.cree` |
| `notification.courrier.analyse` | `courrier.analyse` |
| `notification.courrier.affecte` | `courrier.affecte` |
| `notification.courrier.statut_change` | `courrier.statut_change` |

Chaque file possède sa file d'erreurs `<nom de la file>.erreurs` qui reçoit les
messages illisibles ou échoués après 3 tentatives (5 secondes entre chaque).

Chaque `eventId` est enregistré dans `evenements_traites` : un doublon est
ignoré.

## Tests

```powershell
npm run typecheck
npm test
```

`npm test` vérifie sans réseau ni base les textes français et anglais, le
calcul des rappels (J-2, jour J, retard) et les boutons Slack par statut.

## Structure

```text
prisma/schema.prisma              Suivis, rappels, messages et événements traités
prisma/migrations/                Migration SQL versionnée
src/slack.ts                      Messages privés et mises à jour Slack
src/i18n.ts                       Lecture des traductions partagées
src/domain/rappels.ts             Calcul des rappels et du retard
src/domain/boutons.ts             Boutons Slack par statut
src/services/notification.service.ts  Réactions aux événements et rappels
src/rabbitmq/                     Consommateur et publication
src/cron.ts                       Planification quotidienne
```
