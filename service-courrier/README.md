# Service Courrier

Microservice TypeScript du projet de gestion des courriers. Il reçoit des appels
gRPC, conserve les courriers dans PostgreSQL avec Prisma et publie l'événement
`courrier.cree` dans RabbitMQ.

## Fonctionnalités

- **Création** : attribue un numéro annuel (`CE-AAAA-0001`), enregistre le
  courrier et les entrées d'audit dans une transaction, puis publie
  `courrier.cree`.
- **Recherche** : cherche sans distinction de casse dans le numéro,
  l'expéditeur et l'objet. La recherche retourne au plus 100 résultats
  (20 par défaut).
- **Modification** : met à jour les champs du courrier et journalise les champs
  qui ont changé.
- **Consultation** : retrouve un courrier à partir de son numéro.

Le compteur annuel stocké en base attribue les numéros de façon atomique, y
compris lorsque plusieurs créations arrivent simultanément. Le journal d'audit
est conservé dans la table `journal_audit` ; il enregistre les attributions de
numéro, les créations et les modifications.

## Prérequis

- Node.js 20 ou plus récent et npm
- Docker avec Docker Compose

## Démarrage en développement

Les commandes suivantes sont à lancer depuis la racine du dépôt, sauf
indication contraire.

### 1. Démarrer PostgreSQL et RabbitMQ

```powershell
docker compose up -d postgres-courrier rabbitmq
```

Le `docker-compose.yml` du projet expose PostgreSQL sur le port `5433` et
RabbitMQ sur le port `5672` de la machine.

### 2. Configurer l'environnement

Dans PowerShell, depuis la racine du dépôt :

```powershell
Copy-Item service-courrier\.env.example service-courrier\.env
```

Vérifier ensuite les valeurs dans `service-courrier\.env`. En local, l'URL de
la base doit utiliser le port `5433` et l'URL RabbitMQ le port `5672`. Le port
gRPC par défaut est `50051`.

### 3. Installer les dépendances et préparer la base

```powershell
Set-Location service-courrier
npm install
npx prisma generate
npx prisma migrate deploy
```

La migration versionnée crée les tables `courriers`, `compteurs_courrier` et
`journal_audit`. `migrate deploy` applique les migrations présentes sans en
créer de nouvelles.

Pour créer une migration pendant le développement après avoir modifié
`prisma/schema.prisma`, utilisez :

```powershell
npm run prisma:migrate
```

### 4. Lancer le service

Depuis `service-courrier` :

```powershell
npm run dev
```

Le serveur gRPC écoute sur `0.0.0.0:50051`. Pour compiler puis lancer la version
de production :

```powershell
npm run build
npm start
```

## Contrat gRPC

Le contrat est défini dans [`proto/courrier.proto`](./proto/courrier.proto),
service `courrier.CourrierService` :

| Méthode | Fonction |
| --- | --- |
| `CreateCourrier` | Crée un courrier et retourne ses informations. |
| `GetCourrier` | Consulte un courrier avec son numéro. |
| `UpdateCourrier` | Modifie un courrier identifié par son numéro. |
| `SearchCourriers` | Recherche par numéro, expéditeur ou objet. |

`SearchCourriers` reçoit `query` et un `limit` facultatif ; une recherche vide
est refusée. `CreateCourrier` requiert `objet`, `expediteur` et `destinataire`.

## Structure utile

```text
proto/courrier.proto                 Contrat gRPC
prisma/schema.prisma                 Modèles de données
prisma/migrations/                   Migrations SQL versionnées
src/server.ts                        Serveur et handlers gRPC
src/services/courrier.service.ts     Création, numérotation, recherche, audit
src/rabbitmq/publisher.ts            Publication des événements
src/prisma.ts                        Client Prisma
```

## Scripts disponibles

| Commande | Fonction |
| --- | --- |
| `npm run dev` | Lance le serveur en développement avec redémarrage automatique. |
| `npm run build` | Compile TypeScript dans `dist/`. |
| `npm start` | Lance la version compilée. |
| `npm run prisma:generate` | Génère le client Prisma. |
| `npm run prisma:migrate` | Crée/applique une migration en développement. |

## Dépannage

- **`Cannot find type definition file for 'node'`** : depuis
  `service-courrier`, exécuter `npm install`. Le paquet `@types/node` est une
  dépendance de développement nécessaire à TypeScript ; garder
  `"types": ["node"]` dans `tsconfig.json`.
- **Connexion PostgreSQL refusée** : vérifier que `postgres-courrier` tourne
  (`docker compose ps`) et que `DATABASE_URL` utilise le port `5433` pour un
  service lancé directement sur la machine.
- **Connexion RabbitMQ refusée** : vérifier que RabbitMQ tourne et que
  `RABBITMQ_URL` utilise le port `5672`.
- **Le serveur n'écoute pas sur le port attendu** : vérifier `GRPC_PORT` dans
  `.env` (valeur par défaut : `50051`) et qu'aucun autre processus n'utilise ce
  port.
