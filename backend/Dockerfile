FROM denoland/deno:alpine-2.0.0

WORKDIR /app

# Définit l'utilisateur non-root pour l'exécution.
USER deno

# Copie le fichier de configuration Deno.
COPY --chown=deno:deno backend/deno.json ./

# Copie le code source et met en cache les dépendances.
COPY --chown=deno:deno backend/src/ ./src/
RUN deno cache src/app.js

EXPOSE 3000

# Démarre l'application avec les permissions Deno requises.
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "--no-lock", "src/app.js"]