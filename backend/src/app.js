import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

// 1. Chargement des certificats HTTPS (déjà bien fait par ton collègue)
const cert = Deno.readTextFileSync("./certs/server.crt");
const key = Deno.readTextFileSync("./certs/server.key");

// 2. Configuration de la connexion à la base de données
// On récupère les variables définies dans ton docker-compose.yml et .env
const client = new Client({
  user: Deno.env.get("DB_USER") || "foot_admin",
  database: Deno.env.get("DB_NAME") || "foot_app",
  hostname: Deno.env.get("DB_HOST") || "database",
  password: Deno.env.get("DB_PASSWORD") || "superpassword123",
  port: Deno.env.get("DB_PORT") || 5432,
});

// Connexion à la BDD
await client.connect();
console.log("✅ Connecté avec succès à la base de données PostgreSQL !");

console.log("🚀 Backend Deno prêt sur https://localhost:3000");

// 3. Création du serveur HTTP
Deno.serve({ port: 3000, cert, key }, async (req) => {
  const url = new URL(req.url);

  // Headers CORS pour autoriser le Frontend à communiquer avec l'API
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "http://localhost:8080",
    "Access-Control-Allow-Credentials": "true"
  });

  // --- ROUTE : GET /matchs ---
  // Permet de récupérer la liste des matchs depuis la base de données
  if (url.pathname === "/matchs" && req.method === "GET") {
    try {
      const result = await client.queryObject("SELECT * FROM matches");
      return new Response(JSON.stringify(result.rows), { status: 200, headers });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur base de données" }), { status: 500, headers });
    }
  }


  // --- ROUTE : GET /teams ---
  // Permet de récupérer la liste des équipes depuis la base de données
  if (url.pathname === "/teams" && req.method === "GET") {
    try {
      const result = await client.queryObject("SELECT * FROM teams");
      return new Response(JSON.stringify(result.rows), { status: 200, headers });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur base de données" }), { status: 500, headers });
    }
  }

  

  // --- ROUTE PAR DÉFAUT ---
  return new Response(JSON.stringify({ message: "API Foot fonctionnelle !" }), { status: 200, headers });
});