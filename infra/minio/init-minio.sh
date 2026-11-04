#!/bin/sh
# Script pour créer le bucket "scans" au démarrage
sleep 5
mc alias set myminio http://minio:9000 minioadmin minioadmin123
mc mb myminio/scans
exit 0