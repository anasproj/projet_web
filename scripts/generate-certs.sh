#!/bin/bash
mkdir -p certs

# Génère un certificat auto-signé valide 1 an
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -subj "/C=FR/ST=Occitanie/L=Montpellier/O=Polytech/CN=localhost"

echo "Certificats HTTPS générés dans le dossier certs/"