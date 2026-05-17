import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

// 1. Chargement des certificats HTTPS
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



// --- UTILITAIRES DE SÉCURITÉ ---

// Fonction pour hacher le mot de passe avec Sel et Poivre
async function hashPassword(password, salt) {
  // Le poivre est un secret serveur (stocké dans le .env, jamais en base de données)
  const pepper = Deno.env.get("PEPPER_SECRET") || "secret_poivre";
  
  // On combine : Mot de passe + Sel + Poivre
  const dataToHash = password + salt + pepper;
  
  // On hache avec l'algorithme SHA-256 natif
  const dataBuffer = new TextEncoder().encode(dataToHash);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  
  // On convertit le résultat en chaîne de caractères (hexadécimal)
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Fonction pour générer un sel aléatoire (Différent pour chaque utilisateur)
function generateSalt() {
  return crypto.randomUUID();
}




// 3. Création du serveur HTTP
Deno.serve({ port: 3000, cert, key }, async (req) => {
  const url = new URL(req.url);

  // Headers CORS pour autoriser le Frontend à communiquer avec l'API
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "http://localhost:8080",
    "Access-Control-Allow-Credentials": "true"
  });


  

  // --- ROUTE : POST /register ---
  // Permet de créer un compte avec un mot de passe sécurisé (Sel + Poivre)
  if (url.pathname === "/register" && req.method === "POST") {
    try {
      // 1. Récupération des données envoyées (comme dans le TD4)
      const body = await req.json();
      const { username, password } = body;

      if (!username || !password) {
        return new Response(JSON.stringify({ error: "Username et password requis" }), { status: 400, headers });
      }

      // 2. Sécurité : Création du sel et hachage du mot de passe
      const salt = generateSalt();
      const passwordHash = await hashPassword(password, salt);

      // 3. Insertion dans la base de données PostgreSQL
      await client.queryObject(
        "INSERT INTO users (username, password_hash, salt, role) VALUES ($1, $2, $3, $4)",
        [username, passwordHash, salt, "fan"]
      );

      return new Response(JSON.stringify({ message: "Utilisateur créé avec succès !" }), { status: 201, headers });
    } catch (error) {
      console.error(error);
      // Si l'utilisateur existe déjà (erreur de contrainte UNIQUE sur le username)
      if (error.message.includes("unique constraint") || error.message.includes("duplicate key")) {
        return new Response(JSON.stringify({ error: "Ce nom d'utilisateur est déjà pris" }), { status: 409, headers });
      }
      return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500, headers });
    }
  }






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