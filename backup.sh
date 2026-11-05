#!/usr/bin/env bash
# Sauvegarde les quatre bases PostgreSQL de l'infrastructure.
set -euo pipefail

mkdir -p backups
suffixe=$(date +%Y-%m-%d)

sauvegarder() {
  conteneur=$1
  utilisateur=$2
  base=$3
  echo "Sauvegarde de ${base}..."
  docker exec -t "${conteneur}" pg_dump -U "${utilisateur}" -d "${base}" \
    > "backups/${base}_${suffixe}.sql"
}

sauvegarder postgres-courrier courrier courrier_db
sauvegarder postgres-workflow workflow workflow_db
sauvegarder postgres-ia ia ia_db
sauvegarder postgres-notification notification notification_db

echo "Sauvegarde terminée : fichiers dans backups/."
