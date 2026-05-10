FROM denoland/deno:alpine-2.0.0

WORKDIR /app

# Bascule sur l'utilisateur sécurisé non-root
USER deno

# Mise en cache de la configuration
COPY --chown=deno:deno backend/deno.json ./

# Copie des sources et mise en cache globale des dépendances
COPY --chown=deno:deno backend/src/ ./src/
RUN deno cache src/app.js

EXPOSE 3000

# Démarrage avec les autorisations strictes
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "src/app.js"]