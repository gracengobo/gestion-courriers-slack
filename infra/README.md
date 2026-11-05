# Infrastructure

`docker-compose.yml` démarre l’infrastructure commune : quatre bases PostgreSQL, RabbitMQ et MinIO.

## Démarrage

Depuis la racine du dépôt :

```bash
docker compose up -d
docker compose ps
```

Arrêt sans perte de données : `docker compose down`.
Remise à zéro complète (supprime les volumes) : `docker compose down -v`.

Les identifiants restent ceux du développement local ; ils correspondent à `.env.example`.

## Services et ports

| Service | Conteneur | Port hôte | Identifiants |
|---|---|---|---|
| Service Courrier | `postgres-courrier` | 5433 | `courrier` / `courrier_dev`, base `courrier_db` |
| Service Workflow | `postgres-workflow` | 5434 | `workflow` / `workflow_dev`, base `workflow_db` |
| Service IA | `postgres-ia` | 5435 | `ia` / `ia_dev`, base `ia_db` |
| Service Notification | `postgres-notification` | 5436 | `notification` / `notification_dev`, base `notification_db` |
| RabbitMQ (AMQP) | `rabbitmq` | 5672 | `guest` / `guest` |
| RabbitMQ (console) | `rabbitmq` | 15672 | `guest` / `guest` |
| MinIO (API S3) | `minio` | 9000 | `minioadmin` / `minioadmin123` |
| MinIO (console) | `minio` | 9001 | `minioadmin` / `minioadmin123` |

Chaque base conserve ses données dans un volume nommé (`courrier-data`, `workflow-data`, `ia-data`, `notification-data`). Les volumes `rabbitmq-data` et `minio-data` jouent le même rôle pour le broker et les fichiers.

## Initialisation

- Les scripts `infra/init/*.sql` sont exécutés par PostgreSQL uniquement lors de la création du volume. Ils activent l’extension `uuid-ossp` ; les schémas métier sont créés par les migrations Prisma de chaque service.
- `infra/rabbitmq/rabbitmq.conf` charge `definitions.json`, qui déclare l’échange `courrier.events`. Les files et leurs liaisons sont déclarées par les services consommateurs.
- `infra/minio/init-minio.sh` attend MinIO puis crée le bucket `scans` (idempotent).

`loopback_users.guest = false` est présent dans `rabbitmq.conf` : sans cette option, le compte `guest` refuse toute connexion venant de l’hôte ou d’un autre conteneur. Elle ne doit pas être conservée en production.

## Sauvegarde

```bash
./backup.sh
```

Le script exporte les quatre bases dans `backups/` au format SQL daté.

## Portée

Ce compose ne démarre que l’infrastructure. Les services applicatifs (passerelle Slack, Service Courrier, Service IA, Workflow, Notification) se lancent séparément avec leurs propres variables `.env`, ou via leurs images une fois leurs `Dockerfile` disponibles.
