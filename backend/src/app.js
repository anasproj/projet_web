import { create,verify, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";
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



// Fonction pour générer la clé cryptographique pour signer les JWT
async function getJwtKey() {
  const secret = Deno.env.get("JWT_SECRET") || "secret_jwt_tres_long_et_complexe";
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  return await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-512" }, false, ["sign", "verify"]
  );
}




// --- GESTION DES WEBSOCKETS ---
// Set qui va stocker toutes les connexions actives
const connectedClients = new Set();

// Fonction utilitaire pour extraire le token JWT depuis le header "Cookie"
function getCookieToken(req) {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  // Cherche la valeur après "token="
  const match = cookieHeader.match(/token=([^;]+)/);
  return match ? match[1] : null;
}





// 3. Création du serveur HTTP
Deno.serve({ port: 3000, cert, key }, async (req) => {
  const url = new URL(req.url);

  // Headers CORS pour autoriser le Frontend à communiquer avec l'API
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "http://localhost:8080",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // On autorise les méthodes
    "Access-Control-Allow-Headers": "Content-Type, Authorization" // LA LIGNE MAGIQUE POUR FIXER L'ERREUR
  });



  // --- GESTION DU PREFLIGHT CORS (REQUÊTE OPTIONS) ---
  // Le navigateur envoie une requête OPTIONS avant le POST pour vérifier les permissions
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }



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







  // --- ROUTE : POST /login ---
  // Permet de se connecter et de recevoir un cookie avec le JWT
  if (url.pathname === "/login" && req.method === "POST") {
    try {
      const body = await req.json();
      const { username, password } = body;

      // 1. Chercher l'utilisateur en base de données
      const result = await client.queryObject(
        "SELECT id, username, password_hash, salt, role FROM users WHERE username = $1",
        [username]
      );

      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Utilisateur introuvable" }), { status: 404, headers });
      }

      const user = result.rows[0];

      // 2. Vérifier le mot de passe avec le sel de la base
      const hashToVerify = await hashPassword(password, user.salt);
      
      if (hashToVerify !== user.password_hash) {
        return new Response(JSON.stringify({ error: "Mot de passe incorrect" }), { status: 401, headers });
      }

      // 3. Le mot de passe est bon ! On génère le JWT
      const jwtKey = await getJwtKey();
      const jwt = await create(
        { alg: "HS512", typ: "JWT" }, // Header
        { 
          userId: user.id, 
          username: user.username, 
          role: user.role,
          exp: getNumericDate(60 * 60 * 24) // Expire dans 24h
        }, 
        jwtKey // Signature
      );

      // 4. On crée le cookie HttpOnly
      const cookieHeader = `token=${jwt}; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=86400`;
      
      // On ajoute le cookie à nos headers CORS existants
      const responseHeaders = new Headers(headers);
      responseHeaders.append("Set-Cookie", cookieHeader);

      return new Response(JSON.stringify({ 
        message: "Connexion réussie !",
        user: { id: user.id, username: user.username, role: user.role }
      }), { 
        status: 200, 
        headers: responseHeaders 
      });

    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500, headers });
    }
  }



  // --- ROUTE : GET /matchs ---
  if (url.pathname === "/matchs" && req.method === "GET") {
    try {
      const result = await client.queryObject(`
        SELECT m.*,
          COALESCE(
            json_agg(
              json_build_object('user_id', u.id, 'username', u.username, 'team_id', mp.team_id)
            ) FILTER (WHERE u.id IS NOT NULL),
            '[]'
          ) AS players
        FROM matches m
        LEFT JOIN match_players mp ON mp.match_id = m.id
        LEFT JOIN users u ON u.id = mp.user_id
        GROUP BY m.id
        ORDER BY m.id DESC
      `);
      return new Response(JSON.stringify(result.rows), { status: 200, headers });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur base de données" }), { status: 500, headers });
    }
  }

  // ==========================================
  // --- SYSTÈME DE LOBBY (SALON D'ATTENTE) ---
  // ==========================================

  // Fonction utilitaire pour diffuser un rafraîchissement du lobby via WebSocket
  // Fonction utilitaire pour diffuser un rafraîchissement du lobby via WebSocket avec un type spécifique
  const broadcastLobbyUpdate = (matchId, eventType = "lobby_updated") => {
    for (const client of connectedClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: eventType, matchId }));
      }
    }
  };

  // 1. ROUTE : POST /matchs (Création du salon)
  if (url.pathname === "/matchs" && req.method === "POST") {
    try {
      const token = getCookieToken(req);
      if (!token) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers });
      
      const payload = await verify(token, await getJwtKey());
      const body = await req.json();
      
      const { name, rules, home_team_id, away_team_id } = body;
      if (!home_team_id || !away_team_id) {
        return new Response(JSON.stringify({ error: "Équipes requises" }), { status: 400, headers });
      }

      const matchName = name || "Match Amical";
      const matchRules = rules || "Classique";

      const result = await client.queryObject(
        "INSERT INTO matches (name, rules, home_team_id, away_team_id, status, creator_id, match_date) VALUES ($1, $2, $3, $4, 'scheduled', $5, NOW()) RETURNING *",
        [matchName, matchRules, parseInt(home_team_id), parseInt(away_team_id), payload.userId]
      );
      
      const newMatch = result.rows[0];

      await client.queryObject(
        "INSERT INTO match_players (match_id, user_id) VALUES ($1, $2)",
        [newMatch.id, payload.userId]
      );

      broadcastLobbyUpdate(newMatch.id, "player_joined");
      return new Response(JSON.stringify(newMatch), { status: 201, headers });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur création lobby" }), { status: 500, headers });
    }
  }

  // Analyse des routes dynamiques pour le Lobby (ex: /matchs/5/join)
  const pathParts = url.pathname.split("/");
  // CORRECTION : On autorise 'matchs' ET 'matches' pour être compatible avec le Frontend
  const isMatchRoute = (pathParts[1] === "matchs" || pathParts[1] === "matches") && pathParts.length === 4;

  // 2. ROUTE : POST /matches/:id/join (Rejoindre un salon)
  if (isMatchRoute && pathParts[3] === "join" && req.method === "POST") {
    try {
      const token = getCookieToken(req);
      if (!token) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers });
      
      const payload = await verify(token, await getJwtKey());
      const matchId = parseInt(pathParts[2]);

      await client.queryObject(
        "INSERT INTO match_players (match_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [matchId, payload.userId]
      );

      // DIFFUSION WEBSOCKET SPÉCIFIQUE
      broadcastLobbyUpdate(matchId, "player_joined");
      return new Response(JSON.stringify({ message: "Salon rejoint avec succès" }), { status: 200, headers });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur lors de la jonction" }), { status: 500, headers });
    }
  }

  // 3. ROUTE : POST /matches/:id/assign (Le créateur assigne un joueur à une équipe)
  if (isMatchRoute && pathParts[3] === "assign" && req.method === "POST") {
    try {
      const token = getCookieToken(req);
      if (!token) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers });
      
      const payload = await verify(token, await getJwtKey());
      const matchId = parseInt(pathParts[2]);
      
      const body = await req.json();
      // CORRECTION : Le frontend envoie userId et non target_user_id
      const targetUserId = body.userId || body.target_user_id; 
      const teamId = body.teamId || body.team_id;

      const matchCheck = await client.queryObject("SELECT creator_id FROM matches WHERE id = $1", [matchId]);
      
      if (matchCheck.rows.length === 0 || matchCheck.rows[0].creator_id !== payload.userId) {
        return new Response(JSON.stringify({ error: "Seul le créateur peut assigner les équipes" }), { status: 403, headers });
      }

      await client.queryObject(
        "UPDATE match_players SET team_id = $1 WHERE match_id = $2 AND user_id = $3",
        [teamId, matchId, targetUserId]
      );

      // DIFFUSION WEBSOCKET SPÉCIFIQUE
      broadcastLobbyUpdate(matchId, "team_assigned");
      return new Response(JSON.stringify({ message: "Joueur assigné avec succès" }), { status: 200, headers });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur d'assignation" }), { status: 500, headers });
    }
  }

  // 4. ROUTE : POST /matches/:id/start (Le créateur lance le match)
  if (isMatchRoute && pathParts[3] === "start" && req.method === "POST") {
    try {
      const token = getCookieToken(req);
      if (!token) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers });
      
      const payload = await verify(token, await getJwtKey());
      const matchId = parseInt(pathParts[2]);

      const matchCheck = await client.queryObject("SELECT creator_id FROM matches WHERE id = $1", [matchId]);
      
      if (matchCheck.rows.length === 0 || matchCheck.rows[0].creator_id !== payload.userId) {
        return new Response(JSON.stringify({ error: "Seul le créateur peut lancer le match" }), { status: 403, headers });
      }

      await client.queryObject(
        "UPDATE matches SET status = 'live', started_at = CURRENT_TIMESTAMP WHERE id = $1",
        [matchId]
      );

      // DIFFUSION WEBSOCKET SPÉCIFIQUE
      broadcastLobbyUpdate(matchId, "match_started");
      return new Response(JSON.stringify({ message: "Le match a commencé !" }), { status: 200, headers });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur au lancement du match" }), { status: 500, headers });
    }
  }



  // 5. ROUTE : POST /matchs/:id/goal (Le créateur enregistre un but)
  if (isMatchRoute && pathParts[3] === "goal" && req.method === "POST") {
    try { 
      // 1. Vérification du token JWT
      const token = getCookieToken(req);
      if (!token) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers });
      
      const payload = await verify(token, await getJwtKey());
      const matchId = parseInt(pathParts[2]);
      const body = await req.json();
      
      // On récupère les infos envoyées par le frontend
      const { team_id, scorer_id, assist_id, minute } = body;

      if (!team_id) {
        return new Response(JSON.stringify({ error: "L'ID de l'équipe (team_id) est requis" }), { status: 400, headers });
      }

      // 2. Sécurité : Vérifier que c'est bien le créateur du match qui fait la requête
      const matchCheck = await client.queryObject(
        "SELECT creator_id, home_team_id, away_team_id, home_score, away_score FROM matches WHERE id = $1", 
        [matchId]
      );
      
      if (matchCheck.rows.length === 0 || matchCheck.rows[0].creator_id !== payload.userId) {
        return new Response(JSON.stringify({ error: "Seul le créateur peut enregistrer un but" }), { status: 403, headers });
      }

      const match = matchCheck.rows[0];

      // 3. Ajouter le but dans la table 'goals'
      await client.queryObject(
        "INSERT INTO goals (match_id, team_id, scorer_id, assist_id, minute) VALUES ($1, $2, $3, $4, $5)",
        [matchId, parseInt(team_id), scorer_id || null, assist_id || null, minute || 1]
      );

      // 4. Mettre à jour le score du match
      let newHomeScore = match.home_score;
      let newAwayScore = match.away_score;

      if (parseInt(team_id) === match.home_team_id) {
        newHomeScore += 1;
        await client.queryObject("UPDATE matches SET home_score = $1 WHERE id = $2", [newHomeScore, matchId]);
      } else if (parseInt(team_id) === match.away_team_id) {
        newAwayScore += 1;
        await client.queryObject("UPDATE matches SET away_score = $1 WHERE id = $2", [newAwayScore, matchId]);
      }

      // 5. Diffuser le nouveau score en temps réel à tout le salon via WebSocket !
      const messageToSend = JSON.stringify({
        type: "score_update",
        matchId: matchId,
        home_score: newHomeScore,
        away_score: newAwayScore
      });

      // --- NOUVEAUTÉ : Annonce du buteur dans le chat en direct ---
      let scorerName = "Un joueur";
      if (scorer_id) {
        const userRes = await client.queryObject("SELECT username FROM users WHERE id = $1", [scorer_id]);
        if (userRes.rows.length > 0) scorerName = userRes.rows[0].username;
      }
      
      const teamName = parseInt(team_id) === match.home_team_id ? "l'équipe Domicile" : "l'équipe Extérieur";
      const chatAnnouncement = JSON.stringify({
        type: "new_message",
        username: "Système",
        text: `⚽ BUUUUT pour ${teamName} ! Buteur : ${scorerName} (${minute}')`
      });

      // On diffuse le score ET le message à tout le monde
      for (const clientWS of connectedClients) {
        if (clientWS.readyState === WebSocket.OPEN) {
          clientWS.send(messageToSend);
          clientWS.send(chatAnnouncement); 
        }
      }

      return new Response(JSON.stringify({ message: "But enregistré avec succès !" }), { status: 201, headers });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur lors de l'enregistrement du but" }), { status: 500, headers });
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



  

// --- ROUTE : GET /leaderboard ---
  // Permet de récupérer le classement de tous les joueurs trié par note globale (OVR)
  if (url.pathname === "/leaderboard" && req.method === "GET") {
    try {
      // 1. Requête SQL d'agrégation pour récupérer les stats de base de tous les joueurs
      const query = `
        SELECT 
          u.id, 
          u.username,
          COUNT(DISTINCT mp.match_id) AS matches_played,
          COUNT(DISTINCT g.id) AS goals,
          COUNT(DISTINCT a.id) AS assists
        FROM users u
        LEFT JOIN match_players mp ON u.id = mp.user_id
        LEFT JOIN goals g ON u.id = g.scorer_id
        LEFT JOIN goals a ON u.id = a.assist_id
        GROUP BY u.id, u.username
      `;
      const result = await client.queryObject(query);
      
      // 2. Calcul de la note globale (OVR) pour chaque joueur (même logique que le profil)
      const leaderboard = result.rows.map(user => {
        const matches_played = Number(user.matches_played);
        const goals = Number(user.goals);
        const assists = Number(user.assists);
        
        // Calculs simulés des victoires et notes
        const wins = Math.ceil(matches_played * 0.5);
        const rating_shot = Math.min(99, 50 + goals * 5);
        const rating_pass = Math.min(99, 50 + assists * 5);
        const rating_victory = Math.min(99, 50 + wins * 6);
        const rating_defense = Math.min(99, 50 + (matches_played - goals) * 2);
        const rating_form = Math.min(99, 50 + wins * 4);
        
        const overall = Math.round((rating_shot + rating_pass + rating_victory + rating_defense + rating_form) / 5);

        return {
          id: user.id,
          username: user.username,
          matches_played,
          goals,
          assists,
          wins,
          overall
        };
      });

      // 3. Trier le tableau : du meilleur joueur (overall le plus élevé) au moins bon
      leaderboard.sort((a, b) => b.overall - a.overall);

      // On retourne le Top 50 pour éviter de surcharger le Frontend
      return new Response(JSON.stringify(leaderboard.slice(0, 50)), { status: 200, headers });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur lors de la génération du leaderboard" }), { status: 500, headers });
    }
  }


  


  // --- ROUTE : GET /ws ---
  // WebSockets pour le chat en direct (Sécurisé par Cookie JWT)
  if (url.pathname === "/ws" && req.method === "GET") {
    try {
      // 1. On cherche le token dans les cookies
      const token = getCookieToken(req);
      if (!token) {
        console.log("❌ Accès WS refusé : Pas de cookie token");
        return new Response("Non autorisé", { status: 401, headers });
      }

      // 2. On vérifie que le token est valide et on récupère les infos de l'utilisateur
      const jwtKey = await getJwtKey();
      const payload = await verify(token, jwtKey);

      // 3. Si tout est bon, on "upgrade" la requête HTTP en WebSocket
      const { socket, response } = Deno.upgradeWebSocket(req);

      // --- ÉVÉNEMENTS WEBSOCKET ---
      
      // A. Quand l'utilisateur se connecte
      socket.onopen = () => {
        console.log(`🟢 ${payload.username} a rejoint le chat WS !`);
        connectedClients.add(socket);
      };

      // B. Quand l'utilisateur envoie un message
      // B. Quand l'utilisateur envoie un message
      socket.onmessage = (event) => {
        try {
          // 1. On traduit le JSON envoyé par le Frontend
          const dataFromClient = JSON.parse(event.data);
          console.log(`💬 ${payload.username} a envoyé : ${dataFromClient.text}`);
          
          // 2. On prépare le message propre au format attendu par le Frontend
          const messageToSend = JSON.stringify({
            type: "new_message",
            username: payload.username,
            text: dataFromClient.text
          });

          // 3. BROADCAST : On l'envoie à TOUT LE MONDE
          for (const client of connectedClients) {
            if (client !== socket && client.readyState === WebSocket.OPEN) {
              client.send(messageToSend);
            }
          }
        } catch(error) {
          console.error("Erreur lors de la lecture du message WS :", error);
        }
      };

      // C. Quand l'utilisateur quitte la page
      socket.onclose = () => {
        console.log(`🔴 ${payload.username} a quitté le chat.`);
        connectedClients.delete(socket);
      };

      // D. En cas de crash réseau
      socket.onerror = (e) => {
        console.error("Erreur WS :", e);
        connectedClients.delete(socket);
      };

      return response;

    } catch (error) {
      console.error("Erreur WS Auth :", error.message);
      return new Response("Token invalide ou expiré", { status: 401, headers });
    }
  }






  // --- ROUTE : GET /profile/:id ---
  // Permet de récupérer les informations de profil et statistiques d'un joueur
  if (url.pathname.startsWith("/profile/") && req.method === "GET") {
    try {
      const userIdStr = url.pathname.split("/")[2];
      const userId = parseInt(userIdStr);
      if (isNaN(userId)) {
        return new Response(JSON.stringify({ error: "ID invalide" }), { status: 400, headers });
      }

      // 1. Récupérer l'utilisateur
      const userResult = await client.queryObject(
        "SELECT id, username, role FROM users WHERE id = $1",
        [userId]
      );

      if (userResult.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Utilisateur introuvable" }), { status: 404, headers });
      }

      const user = userResult.rows[0];

      // 2. Calculer les statistiques du joueur dynamiquement
      // Matchs joués
      const matchesPlayedResult = await client.queryObject(
        "SELECT COUNT(*) as count FROM match_players WHERE user_id = $1",
        [userId]
      );
      const matches_played = Number(matchesPlayedResult.rows[0].count);

      // Buts marqués
      const goalsResult = await client.queryObject(
        "SELECT COUNT(*) as count FROM goals WHERE scorer_id = $1",
        [userId]
      );
      const goals = Number(goalsResult.rows[0].count);

      // Passes décisives
      const assistsResult = await client.queryObject(
        "SELECT COUNT(*) as count FROM goals WHERE assist_id = $1",
        [userId]
      );
      const assists = Number(assistsResult.rows[0].count);

      // Mock logique cohérente pour les victoires/défaites
      const wins = Math.ceil(matches_played * 0.5);
      const losses = Math.floor(matches_played * 0.4);
      const draws = matches_played - wins - losses;
      
      const rating_shot = Math.min(99, 50 + goals * 5);
      const rating_pass = Math.min(99, 50 + assists * 5);
      const rating_victory = Math.min(99, 50 + wins * 6);
      const rating_defense = Math.min(99, 50 + (matches_played - goals) * 2);
      const rating_form = Math.min(99, 50 + wins * 4);
      const overall = Math.round((rating_shot + rating_pass + rating_victory + rating_defense + rating_form) / 5);

      user.created_at = new Date().toISOString(); // Mock date
      user.stats = {
        overall,
        rating_shot,
        rating_pass,
        rating_victory,
        rating_form,
        rating_defense,
        matches_played,
        wins,
        losses,
        draws,
        goals,
        assists,
        motm_count: 0,
        current_streak: wins,
        best_streak: wins
      };

      return new Response(JSON.stringify({
        user,
        recentMatches: []
      }), { status: 200, headers });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500, headers });
    }
  }

  // --- ROUTE PAR DÉFAUT ---
  return new Response(JSON.stringify({ message: "API Foot fonctionnelle !" }), { status: 200, headers });
});