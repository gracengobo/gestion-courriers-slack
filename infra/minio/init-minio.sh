#!/bin/sh
# Crée le bucket "scans" dès que MinIO répond.
set -eu

until mc alias set myminio http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  echo "Attente de MinIO..."
  sleep 2
done

mc mb --ignore-existing myminio/scans
echo "Bucket scans prêt."
