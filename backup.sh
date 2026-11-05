#!/bin/bash
# Créer un dossier de sauvegarde
mkdir -p backups

echo "Début de la sauvegarde..."

# Sauvegarder la base courrier_db
docker exec -t $(docker ps -qf "name=postgres") pg_dump -U postgres courrier_db > backups/courrier_db_$(date +%Y-%m-%d).sql

# Sauvegarder la base workflow_db
docker exec -t $(docker ps -qf "name=postgres") pg_dump -U postgres workflow_db > backups/workflow_db_$(date +%Y-%m-%d).sql

echo "Sauvegarde terminée avec succès !"