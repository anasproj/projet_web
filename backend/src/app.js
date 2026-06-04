/* Importe les fonctions de création et vérification des JWT ainsi que le client PostgreSQL. */
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

/* Lit les certificats TLS nécessaires pour démarrer le serveur en HTTPS. */
const cert = Deno.readTextFileSync("./certs/server.crt");
const key = Deno.readTextFileSync("./certs/server.key");

/* Configure la connexion PostgreSQL à partir des variables d'environnement. */
const client = new Client({
  user: Deno.env.get("DB_USER") || "foot_admin",
  database: Deno.env.get("DB_NAME") || "foot_app",
  hostname: Deno.env.get("DB_HOST") || "database",
  password: Deno.env.get("DB_PASSWORD") || "superpassword123",
  port: Deno.env.get("DB_PORT") || 5432,
});

/* Ouvre la connexion à la base de données au démarrage. */
await client.connect();
console.log("✅ Connecté avec succès à la base de données PostgreSQL !");

/* Applique les migrations de schéma idempotentes pour les bases déjà existantes. */
await client.queryObject(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP`);
await client.queryObject(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS elapsed_seconds INT DEFAULT 0`);
await client.queryObject(`
  CREATE TABLE IF NOT EXISTS player_stats (
    user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    overall INT DEFAULT 50,
    rating_shot INT DEFAULT 50,
    rating_pass INT DEFAULT 50,
    rating_victory INT DEFAULT 50,
    rating_form INT DEFAULT 50,
    rating_defense INT DEFAULT 50,
    matches_played INT DEFAULT 0,
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    draws INT DEFAULT 0,
    goals INT DEFAULT 0,
    assists INT DEFAULT 0,
    motm_count INT DEFAULT 0,
    current_streak INT DEFAULT 0,
    best_streak INT DEFAULT 0
  )
`);
await client.queryObject(`
  CREATE TABLE IF NOT EXISTS match_stat_changes (
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    result VARCHAR(10) NOT NULL,
    goals INT DEFAULT 0,
    assists INT DEFAULT 0,
    stats_before JSONB NOT NULL,
    stats_after JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (match_id, user_id)
  )
`);
await client.queryObject(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);
await client.queryObject(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
await client.queryObject(`UPDATE users SET role = 'admin' WHERE username = 'imade'`);
await client.queryObject(`INSERT INTO player_stats (user_id) SELECT id FROM users ON CONFLICT (user_id) DO NOTHING`);
await client.queryObject(`CREATE INDEX IF NOT EXISTS idx_player_stats_overall ON player_stats(overall DESC)`);
await client.queryObject(`CREATE INDEX IF NOT EXISTS idx_match_stat_changes_match ON match_stat_changes(match_id)`);

console.log("🚀 Backend Deno prêt sur https://localhost:3000");

// ================================================================
// SECTION 1 — UTILITAIRES DE SÉCURITÉ
// ================================================================

/* Hache le mot de passe en combinant le mot de passe, le sel et le poivre avec SHA-256. */
async function hashPassword(password, salt) {
  const pepper = Deno.env.get("PEPPER_SECRET") || "secret_poivre";
  const dataToHash = password + salt + pepper;
  const dataBuffer = new TextEncoder().encode(dataToHash);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/* Génère un sel aléatoire unique sous forme d'UUID. */
function generateSalt() {
  return crypto.randomUUID();
}

/* Génère la clé cryptographique HMAC-SHA512 utilisée pour signer les JWT. */
async function getJwtKey() {
  const secret = Deno.env.get("JWT_SECRET") || "secret_jwt_tres_long_et_complexe";
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  return await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-512" }, false, ["sign", "verify"]
  );
}

/* Définit la durée de validité de l'Access Token (15 min) et du Refresh Token (7 jours). */
const ACCESS_TOKEN_MAX_AGE = 60 * 15;
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7;

/* Crée un Access Token JWT signé contenant l'identifiant, le nom et le rôle de l'utilisateur. */
async function createAccessToken(user) {
  return await create(
    { alg: "HS512", typ: "JWT" },
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      exp: getNumericDate(ACCESS_TOKEN_MAX_AGE)
    },
    await getJwtKey()
  );
}

/* Génère un Refresh Token aléatoire de 48 octets encodé en base64url. */
function generateRefreshToken() {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* Hache un token avec le poivre avant de le stocker en base de données. */
async function hashToken(token) {
  const pepper = Deno.env.get("PEPPER_SECRET") || "secret_poivre";
  const data = new TextEncoder().encode(`${token}${pepper}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* Crée un Refresh Token, le hache et l'enregistre en base de données. */
async function createRefreshToken(userId) {
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = await hashToken(refreshToken);
  await client.queryObject(
    "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')",
    [userId, refreshTokenHash]
  );
  return refreshToken;
}

/* Ajoute les cookies d'authentification HttpOnly sécurisés dans les headers de la réponse. */
function appendAuthCookies(responseHeaders, accessToken, refreshToken = null) {
  responseHeaders.append("Set-Cookie", `token=${accessToken}; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=${ACCESS_TOKEN_MAX_AGE}`);
  if (refreshToken) {
    responseHeaders.append("Set-Cookie", `refreshToken=${refreshToken}; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=${REFRESH_TOKEN_MAX_AGE}`);
  }
}

/* Efface les cookies d'authentification en les remplaçant par des cookies expirés. */
function appendClearAuthCookies(responseHeaders) {
  responseHeaders.append("Set-Cookie", "token=; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=0");
  responseHeaders.append("Set-Cookie", "refreshToken=; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=0");
}




// ================================================================
// SECTION 2 — GESTION DES WEBSOCKETS
// ================================================================

/* Stocke toutes les connexions WebSocket actives pour permettre le broadcast. */
const connectedClients = new Set();

/* Envoie un événement JSON à tous les clients WebSocket dont la connexion est ouverte. */
function broadcastRealtimeEvent(matchId, eventType = "lobby_updated") {
  for (const client of connectedClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: eventType, matchId }));
    }
  }
}



function clampStat(value) {
  return Math.max(30, Math.min(99, Math.round(Number(value) || 50)));
}

function defaultStats(userId) {
  return {
    user_id: userId,
    overall: 50,
    rating_shot: 50,
    rating_pass: 50,
    rating_victory: 50,
    rating_form: 50,
    rating_defense: 50,
    matches_played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    goals: 0,
    assists: 0,
    motm_count: 0,
    current_streak: 0,
    best_streak: 0
  };
}

async function ensurePlayerStats(userId) {
  await client.queryObject(
    `INSERT INTO player_stats (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

function normalizeStats(row, userId = null) {
  const base = defaultStats(userId ?? row?.user_id);
  return {
    user_id: Number(row?.user_id ?? base.user_id),
    overall: Number(row?.overall ?? base.overall),
    rating_shot: Number(row?.rating_shot ?? base.rating_shot),
    rating_pass: Number(row?.rating_pass ?? base.rating_pass),
    rating_victory: Number(row?.rating_victory ?? base.rating_victory),
    rating_form: Number(row?.rating_form ?? base.rating_form),
    rating_defense: Number(row?.rating_defense ?? base.rating_defense),
    matches_played: Number(row?.matches_played ?? base.matches_played),
    wins: Number(row?.wins ?? base.wins),
    losses: Number(row?.losses ?? base.losses),
    draws: Number(row?.draws ?? base.draws),
    goals: Number(row?.goals ?? base.goals),
    assists: Number(row?.assists ?? base.assists),
    motm_count: Number(row?.motm_count ?? base.motm_count),
    current_streak: Number(row?.current_streak ?? base.current_streak),
    best_streak: Number(row?.best_streak ?? base.best_streak)
  };
}

/*
 * ============================================================================
 * MODULE DE CALCUL DES STATISTIQUES FUT (PRÉSENTATION SOUTENANCE)
 * ============================================================================
 * Cette fonction algorithmique est le cœur du système de progression des joueurs.
 * Elle prend les statistiques d'un joueur avant un match, et calcule ses 
 * nouvelles statistiques (façon carte FUT) en fonction de deux critères majeurs :
 * 1. Le résultat collectif de l'équipe (Victoire, Défaite, Nul)
 * 2. La performance individuelle (Buts marqués, Passes décisives)
 * 
 * Concepts de Génie Logiciel appliqués ici : 
 * - Pure Function : La fonction prend des entrées, renvoie un nouvel objet sans 
 *   muter l'objet d'origine (immutabilité avec le spread operator {...before}).
 * - Clamping : Utilisation de `clampStat` pour garantir que les notes restent 
 *   toujours contenues dans les bornes autorisées (ex: 1 à 99).
 */
function calculateUpdatedStats(before, result, goals, assists) {
  // On clone l'objet pour ne pas modifier la référence originale (immutabilité)
  const after = { ...before };
  
  // 1. Mise à jour des compteurs absolus (volume de jeu)
  after.matches_played += 1;
  after.goals += goals;
  after.assists += assists;

  // 2. Impact du résultat COLLECTIF sur le mental et la forme
  if (result === "win") {
    after.wins += 1;
    // Si la série était négative, elle repart à +1, sinon elle s'incrémente
    after.current_streak = Math.max(1, after.current_streak + 1);
    // On met à jour la meilleure série historique du joueur si elle est battue
    after.best_streak = Math.max(after.best_streak, after.current_streak);
    
    // Une victoire booste fortement la note de victoire (+2) et légèrement la forme (+1)
    after.rating_victory = clampStat(after.rating_victory + 2);
    after.rating_form = clampStat(after.rating_form + 1);
    after.overall = clampStat(after.overall + 1);
    
  } else if (result === "loss") {
    after.losses += 1;
    // Si la série était positive, elle tombe à -1, sinon elle s'aggrave
    after.current_streak = Math.min(-1, after.current_streak - 1);
    
    // Une défaite pénalise les statistiques mentales du joueur
    after.rating_victory = clampStat(after.rating_victory - 1);
    after.rating_form = clampStat(after.rating_form - 1);
    after.overall = clampStat(after.overall - 1);
    
  } else {
    // Cas du match Nul : La série en cours est brisée (remise à 0)
    after.draws += 1;
    after.current_streak = 0;
    // Un match nul est considéré comme "correct", on booste légèrement la forme
    after.rating_form = clampStat(after.rating_form + 1);
  }

  // 3. Impact de la performance INDIVIDUELLE sur les attributs techniques
  // Chaque but marqué augmente significativement la note de Frappe (rating_shot)
  after.rating_shot = clampStat(after.rating_shot + goals * 2);
  
  // Chaque passe décisive augmente la note de Passe (rating_pass)
  after.rating_pass = clampStat(after.rating_pass + assists * 2);
  
  // La note Globale (OVR) est un agrégat qui monte aussi selon la perf individuelle
  after.overall = clampStat(after.overall + goals + assists);
  
  // La note de Défense dépend de la solidité de l'équipe (victoire = bonne défense)
  after.rating_defense = clampStat(after.rating_defense + (result === "win" ? 1 : result === "loss" ? -1 : 0));

  return after;
}

async function requireMatchController(req, matchId) {
  const token = getCookieToken(req);
  if (!token) {
    return { error: { message: "Non autorisé", status: 401 } };
  }

  try {
    const payload = await verify(token, await getJwtKey());
    const userId = Number(payload.userId);
    const userRes = await client.queryObject("SELECT id, role FROM users WHERE id = $1", [userId]);
    if (userRes.rows.length === 0) {
      return { error: { message: "Utilisateur introuvable", status: 401 } };
    }

    const matchRes = await client.queryObject("SELECT * FROM matches WHERE id = $1", [matchId]);
    if (matchRes.rows.length === 0) {
      return { error: { message: "Match introuvable", status: 404 } };
    }

    const user = userRes.rows[0];
    const match = matchRes.rows[0];
    if (user.role !== "admin" && Number(match.creator_id) !== userId) {
      return { error: { message: "Seul le créateur ou un admin peut effectuer cette action", status: 403 } };
    }

    return { user, match };
  } catch (error) {
    console.error("Erreur requireMatchController:", error);
    return { error: { message: "Token invalide ou expiré", status: 401 } };
  }
}

// ================================================================
// SECTION 3 — MIDDLEWARES ET HELPERS HTTP
// ================================================================

/* Parse le header Cookie de la requête et retourne un objet clé/valeur. */
function parseCookies(req) {
  const cookieHeader = req.headers.get("cookie") || "";
  return Object.fromEntries(cookieHeader.split(";").map(part => {
    const [key, ...value] = part.trim().split("=");
    return [key, value.join("=")];
  }).filter(([key]) => key));
}

/* Extrait la valeur du cookie "token" (Access Token) de la requête. */
function getCookieToken(req) {
  return parseCookies(req).token || null;
}

/* Extrait la valeur du cookie "refreshToken" de la requête. */
function getRefreshCookieToken(req) {
  return parseCookies(req).refreshToken || null;
}

/* Construit une réponse JSON avec le statut HTTP donné. */
function jsonResponse(payload, { status = 200, headers } = {}) {
  return new Response(JSON.stringify(payload), { status, headers });
}

/* Vérifie que l'Access Token JWT de la requête est valide et retourne l'utilisateur correspondant. */
async function requireAuth(req) {
  const token = getCookieToken(req);
  if (!token) return { error: { message: "Non autorisé", status: 401 } };

  try {
    const payload = await verify(token, await getJwtKey());
    const userRes = await client.queryObject("SELECT id, username, role FROM users WHERE id = $1", [payload.userId]);
    if (userRes.rows.length === 0) {
      return { error: { message: "Utilisateur introuvable", status: 401 } };
    }
    return { user: userRes.rows[0], payload };
  } catch (_error) {
    return { error: { message: "Token invalide ou expiré", status: 401 } };
  }
}

/* Vérifie que l'utilisateur authentifié possède le rôle "admin". */
async function requireAdmin(req) {
  const auth = await requireAuth(req);
  if (auth.error) return auth;
  if (auth.user.role !== "admin") {
    return { error: { message: "Accès refusé. Rôle administrateur requis.", status: 403 } };
  }
  return auth;
}

/* Convertit une erreur d'authentification en réponse HTTP JSON. */
function authErrorResponse(auth, headers) {
  return jsonResponse({ error: auth.error.message }, { status: auth.error.status, headers });
}





// ================================================================
// SECTION 4 — SERVEUR HTTPS ET ROUTES REST
// ================================================================

/* Démarre le serveur HTTPS Deno sur le port 3000 et traite chaque requête entrante. */
Deno.serve({ port: 3000, cert, key }, async (req) => {
  const url = new URL(req.url);

  /* Définit les headers CORS autorisant le frontend (port 8080) à appeler l'API. */
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "http://localhost:8080",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });

  /* Répond au preflight CORS (OPTIONS) pour autoriser les requêtes cross-origin. */
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }



  /* Crée un nouveau compte utilisateur et hache son mot de passe avec sel + poivre. */
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
      const result = await client.queryObject(
        "INSERT INTO users (username, password_hash, salt, role) VALUES ($1, $2, $3, $4) RETURNING id",
        [username, passwordHash, salt, "fan"]
      );
      await ensurePlayerStats(result.rows[0].id);

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







  /* Vérifie les identifiants, génère un Access Token et un Refresh Token, puis les dépose en cookies. */
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

      // 3. Le mot de passe est bon : on génère un Access Token court + un Refresh Token rotatif.
      await client.queryObject("DELETE FROM refresh_tokens WHERE user_id = $1 OR expires_at < NOW()", [user.id]);
      const jwt = await createAccessToken(user);
      const refreshToken = await createRefreshToken(user.id);

      // 4. On crée les cookies HttpOnly sécurisés.
      const responseHeaders = new Headers(headers);
      appendAuthCookies(responseHeaders, jwt, refreshToken);

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




  /* Renouvelle l'Access Token à partir du Refresh Token et effectue une rotation du token. */
  if (url.pathname === "/refresh" && req.method === "POST") {
    try {
      const refreshToken = getRefreshCookieToken(req);
      if (!refreshToken) {
        return jsonResponse({ error: "Refresh token manquant" }, { status: 401, headers });
      }

      const refreshTokenHash = await hashToken(refreshToken);
      const tokenRes = await client.queryObject(`
        SELECT rt.user_id, u.id, u.username, u.role
        FROM refresh_tokens rt
        JOIN users u ON u.id = rt.user_id
        WHERE rt.token = $1 AND rt.expires_at > NOW()
      `, [refreshTokenHash]);

      if (tokenRes.rows.length === 0) {
        const responseHeaders = new Headers(headers);
        appendClearAuthCookies(responseHeaders);
        return jsonResponse({ error: "Refresh token invalide ou expiré" }, { status: 401, headers: responseHeaders });
      }

      const user = tokenRes.rows[0];
      await client.queryObject("DELETE FROM refresh_tokens WHERE token = $1 OR expires_at < NOW()", [refreshTokenHash]);
      const newAccessToken = await createAccessToken(user);
      const newRefreshToken = await createRefreshToken(user.id);
      const responseHeaders = new Headers(headers);
      appendAuthCookies(responseHeaders, newAccessToken, newRefreshToken);

      return jsonResponse({ message: "Session renouvelée", user: { id: user.id, username: user.username, role: user.role } }, { status: 200, headers: responseHeaders });
    } catch (error) {
      console.error("Erreur refresh:", error);
      return jsonResponse({ error: "Erreur serveur" }, { status: 500, headers });
    }
  }

  /* Supprime le Refresh Token en base et efface les cookies du navigateur. */
  if (url.pathname === "/logout" && req.method === "POST") {
    try {
      const refreshToken = getRefreshCookieToken(req);
      if (refreshToken) {
        await client.queryObject("DELETE FROM refresh_tokens WHERE token = $1", [await hashToken(refreshToken)]);
      }
      const responseHeaders = new Headers(headers);
      appendClearAuthCookies(responseHeaders);
      return jsonResponse({ message: "Déconnexion réussie" }, { status: 200, headers: responseHeaders });
    } catch (error) {
      console.error("Erreur logout:", error);
      return jsonResponse({ error: "Erreur serveur" }, { status: 500, headers });
    }
  }

  /* Retourne la liste de tous les matchs avec leurs joueurs et leurs buts en une seule requête SQL. */
  if (url.pathname === "/matchs" && req.method === "GET") {
    try {
      const result = await client.queryObject(`
        SELECT m.*,
          EXTRACT(EPOCH FROM m.started_at) * 1000 AS started_at_ms,
          EXTRACT(EPOCH FROM m.paused_at) * 1000 AS paused_at_ms,
          (
            SELECT COALESCE(json_agg(
              json_build_object('user_id', u.id, 'username', u.username, 'team_id', mp.team_id)
            ), '[]')
            FROM match_players mp
            JOIN users u ON u.id = mp.user_id
            WHERE mp.match_id = m.id
          ) AS players,
          (
            SELECT COALESCE(json_agg(
              json_build_object(
                'id', g.id,
                'team_id', g.team_id,
                'scorer_id', g.scorer_id,
                'scorer_name', us.username,
                'assist_id', g.assist_id,
                'assist_name', ua.username,
                'minute', g.minute
              ) ORDER BY g.minute ASC
            ), '[]')
            FROM goals g
            LEFT JOIN users us ON us.id = g.scorer_id
            LEFT JOIN users ua ON ua.id = g.assist_id
            WHERE g.match_id = m.id
          ) AS goals
        FROM matches m
        ORDER BY m.id DESC
      `);
      return new Response(JSON.stringify(result.rows), { status: 200, headers });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur base de données" }), { status: 500, headers });
    }
  }

  /* Vérifie les droits du demandeur puis supprime le match et toutes ses données liées. */
  if ((url.pathname.startsWith("/matchs/") || url.pathname.startsWith("/matches/")) && req.method === "DELETE") {
    try {
      const pathParts = url.pathname.split("/").filter(Boolean);
      const matchId = Number(pathParts[1]);
      if ((pathParts[0] !== "matchs" && pathParts[0] !== "matches") || pathParts.length !== 2 || !Number.isInteger(matchId)) {
        return new Response(JSON.stringify({ error: "ID de match invalide" }), { status: 400, headers });
      }

      const token = getCookieToken(req);
      if (!token) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers });

      const payload = await verify(token, await getJwtKey());
      const userId = Number(payload.userId);
      if (!Number.isInteger(userId)) {
        return new Response(JSON.stringify({ error: "Token invalide" }), { status: 401, headers });
      }

      const userRes = await client.queryObject(`SELECT role FROM users WHERE id = $1`, [userId]);
      if (userRes.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Utilisateur introuvable" }), { status: 401, headers });
      }
      const userRole = userRes.rows[0].role;

      const matchRes = await client.queryObject(`SELECT creator_id FROM matches WHERE id = $1`, [matchId]);
      if (matchRes.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Match introuvable" }), { status: 404, headers });
      }
      const creatorId = Number(matchRes.rows[0].creator_id);

      if (userRole !== "admin" && userId !== creatorId) {
        return new Response(JSON.stringify({ error: "Droits insuffisants pour supprimer ce lobby" }), { status: 403, headers });
      }

      // Nettoyage explicite des données liées avant suppression du lobby.
      // Les contraintes sont normalement en ON DELETE CASCADE, mais ces DELETE
      // évitent les erreurs si une base existante n'a pas été initialisée avec le bon schéma.
      try {
        await client.queryObject("BEGIN");
        await client.queryObject(`DELETE FROM live_messages WHERE match_id = $1`, [matchId]);
        await client.queryObject(`DELETE FROM goals WHERE match_id = $1`, [matchId]);
        await client.queryObject(`DELETE FROM match_players WHERE match_id = $1`, [matchId]);
        await client.queryObject(`DELETE FROM matches WHERE id = $1`, [matchId]);
        await client.queryObject("COMMIT");
      } catch (deleteError) {
        await client.queryObject("ROLLBACK");
        throw deleteError;
      }

      broadcastRealtimeEvent(matchId, "match_deleted");
      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    } catch (error) {
      console.error("Erreur DELETE /matchs/:id:", error);
      return new Response(JSON.stringify({ error: "Erreur serveur lors de la suppression" }), { status: 500, headers });
    }
  }

  // ==========================================
  // --- SYSTÈME DE LOBBY (SALON D'ATTENTE) ---
  // ==========================================

  // Fonction utilitaire pour diffuser un rafraîchissement du lobby via WebSocket avec un type spécifique
  const broadcastLobbyUpdate = broadcastRealtimeEvent;

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

      await ensurePlayerStats(payload.userId);
      await client.queryObject(
        "INSERT INTO match_players (match_id, user_id) VALUES ($1, $2)",
        [newMatch.id, payload.userId]
      );

      broadcastLobbyUpdate(newMatch.id, "match_created");
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

      const matchRes = await client.queryObject("SELECT status FROM matches WHERE id = $1", [matchId]);
      if (matchRes.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Match introuvable" }), { status: 404, headers });
      }
      if (matchRes.rows[0].status === "finished") {
        return new Response(JSON.stringify({ error: "Impossible de rejoindre un match terminé" }), { status: 400, headers });
      }

      await client.queryObject(
        "INSERT INTO match_players (match_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [matchId, payload.userId]
      );
      await ensurePlayerStats(payload.userId);

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

      const matchCheck = await client.queryObject("SELECT creator_id, status FROM matches WHERE id = $1", [matchId]);
      const userRoleRes = await client.queryObject("SELECT role FROM users WHERE id = $1", [payload.userId]);
      const isAdmin = userRoleRes.rows[0]?.role === "admin";
      
      if (matchCheck.rows.length === 0 || (!isAdmin && matchCheck.rows[0].creator_id !== payload.userId)) {
        return new Response(JSON.stringify({ error: "Seul le créateur ou un admin peut assigner les équipes" }), { status: 403, headers });
      }
      if (!["scheduled", "waiting"].includes(matchCheck.rows[0].status)) {
        return new Response(JSON.stringify({ error: "Impossible de modifier les équipes après le lancement" }), { status: 400, headers });
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

  /*
   * ROUTE : POST /matches/:id/start — Lancement officiel du match.
   *
   * Cause   : le lancement définit l'instant t=0 du chronometre et passe
   *           le match en statut "live". Seuls le créateur/admin peuvent lancer.
   * Effet   : vérifie que tous les joueurs sont assignés à une équipe, met
   *           started_at = CURRENT_TIMESTAMP (timestamp serveur fiable) et
   *           diffuse match_started via WebSocket.
   * Sans ça : le chronometre ne serait pas synchronisé entre les clients,
   *           chacun démarrant son propre compteur local à des moments différents.
   */
  if (isMatchRoute && pathParts[3] === "start" && req.method === "POST") {
    try {
      const token = getCookieToken(req);
      if (!token) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers });
      
      const payload = await verify(token, await getJwtKey());
      const matchId = parseInt(pathParts[2]);

      const matchCheck = await client.queryObject("SELECT creator_id, status FROM matches WHERE id = $1", [matchId]);
      const userRoleRes = await client.queryObject("SELECT role FROM users WHERE id = $1", [payload.userId]);
      const isAdmin = userRoleRes.rows[0]?.role === "admin";
      
      if (matchCheck.rows.length === 0 || (!isAdmin && matchCheck.rows[0].creator_id !== payload.userId)) {
        return new Response(JSON.stringify({ error: "Seul le créateur ou un admin peut lancer le match" }), { status: 403, headers });
      }
      if (!["scheduled", "waiting"].includes(matchCheck.rows[0].status)) {
        return new Response(JSON.stringify({ error: "Ce match ne peut plus être lancé" }), { status: 400, headers });
      }

      const unassignedRes = await client.queryObject(
        "SELECT COUNT(*) AS count FROM match_players WHERE match_id = $1 AND team_id IS NULL",
        [matchId]
      );
      if (Number(unassignedRes.rows[0].count) > 0) {
        return new Response(JSON.stringify({ error: "Tous les joueurs doivent être assignés à une équipe avant le lancement" }), { status: 400, headers });
      }

      await client.queryObject(
        "UPDATE matches SET status = 'live', started_at = CURRENT_TIMESTAMP, paused_at = NULL, elapsed_seconds = 0 WHERE id = $1",
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



  /*
   * ROUTE : POST /matches/:id/goal — Enregistrement d'un but en temps réel.
   *
   * Cause   : un but modifie le score du match et doit être diffusé instantanément
   *           à tous les spectateurs via WebSocket.
   * Effet   : valide que le match est "live", que le buteur appartient à l'équipe,
   *           insère le but en BDD, met à jour le score et diffuse score_update
   *           + new_message (annonce chat) à tous les clients WS connectés.
   * Sans ça : les scores ne seraient pas enregistrés en base et les autres
   *           joueurs n'auraient pas de mise à jour en temps réel.
   */
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
        "SELECT creator_id, home_team_id, away_team_id, home_score, away_score, status FROM matches WHERE id = $1",
        [matchId]
      );
      
      const userRoleRes = await client.queryObject("SELECT role FROM users WHERE id = $1", [payload.userId]);
      const isAdmin = userRoleRes.rows[0]?.role === "admin";
      if (matchCheck.rows.length === 0 || (!isAdmin && matchCheck.rows[0].creator_id !== payload.userId)) {
        return new Response(JSON.stringify({ error: "Seul le créateur ou un admin peut enregistrer un but" }), { status: 403, headers });
      }
      if (matchCheck.rows[0].status !== "live") {
        return new Response(JSON.stringify({ error: "Impossible d'enregistrer un but si le match n'est pas en direct" }), { status: 400, headers });
      }

      const match = matchCheck.rows[0];
      if (![match.home_team_id, match.away_team_id].includes(parseInt(team_id))) {
        return new Response(JSON.stringify({ error: "Cette équipe ne participe pas au match" }), { status: 400, headers });
      }

      if (scorer_id) {
        const scorerCheck = await client.queryObject(
          "SELECT team_id FROM match_players WHERE match_id = $1 AND user_id = $2",
          [matchId, scorer_id]
        );
        if (scorerCheck.rows.length === 0 || scorerCheck.rows[0].team_id !== parseInt(team_id)) {
          return new Response(JSON.stringify({ error: "Le buteur doit appartenir à l'équipe choisie" }), { status: 400, headers });
        }
      }

      if (assist_id) {
        const assistCheck = await client.queryObject(
          "SELECT team_id FROM match_players WHERE match_id = $1 AND user_id = $2",
          [matchId, assist_id]
        );
        if (assistCheck.rows.length === 0 || assistCheck.rows[0].team_id !== parseInt(team_id)) {
          return new Response(JSON.stringify({ error: "Le passeur doit appartenir à l'équipe choisie" }), { status: 400, headers });
        }
      }

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

      // --- NOUVEAUTÉ : Annonce du buteur et passeur dans le chat en direct ---
      let scorerName = "Un joueur";
      if (scorer_id) {
        const userRes = await client.queryObject("SELECT username FROM users WHERE id = $1", [scorer_id]);
        if (userRes.rows.length > 0) scorerName = userRes.rows[0].username;
      }

      let assistName = "";
      if (assist_id) {
        const assistRes = await client.queryObject("SELECT username FROM users WHERE id = $1", [assist_id]);
        if (assistRes.rows.length > 0) assistName = assistRes.rows[0].username;
      }
      
      const teamName = parseInt(team_id) === match.home_team_id ? "l'équipe Domicile" : "l'équipe Extérieur";
      const assistText = assistName ? ` (passe décisive de ${assistName})` : "";
      const chatAnnouncement = JSON.stringify({
        type: "new_message",
        username: "Système",
        text: `⚽ BUUUUT pour ${teamName} ! Buteur : ${scorerName}${assistText} (${minute}')`
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


  /* Met le match en pause en sauvegardant le temps écoulé et diffuse l'événement. */
  if (isMatchRoute && pathParts[3] === "pause" && req.method === "POST") {
    try {
      const matchId = parseInt(pathParts[2]);
      const auth = await requireMatchController(req, matchId);
      if (auth.error) return new Response(JSON.stringify({ error: auth.error.message }), { status: auth.error.status, headers });

      if (auth.match.status !== "live") {
        return new Response(JSON.stringify({ error: "Seul un match en direct peut être mis en pause" }), { status: 400, headers });
      }

      const elapsed = Number(auth.match.elapsed_seconds || 0) + Math.max(0, Math.floor((Date.now() - new Date(auth.match.started_at).getTime()) / 1000));
      await client.queryObject(
        "UPDATE matches SET status = 'paused', paused_at = CURRENT_TIMESTAMP, elapsed_seconds = $1 WHERE id = $2",
        [elapsed, matchId]
      );

      broadcastLobbyUpdate(matchId, "match_paused");
      return new Response(JSON.stringify({ message: "Match mis en pause", elapsed_seconds: elapsed }), { status: 200, headers });
    } catch (error) {
      console.error("Erreur pause match:", error);
      return new Response(JSON.stringify({ error: "Erreur lors de la pause" }), { status: 500, headers });
    }
  }

  /* Reprend un match en pause en remettant started_at à maintenant pour recalculer le chrono. */
  if (isMatchRoute && pathParts[3] === "resume" && req.method === "POST") {
    try {
      const matchId = parseInt(pathParts[2]);
      const auth = await requireMatchController(req, matchId);
      if (auth.error) return new Response(JSON.stringify({ error: auth.error.message }), { status: auth.error.status, headers });

      if (auth.match.status !== "paused") {
        return new Response(JSON.stringify({ error: "Seul un match en pause peut reprendre" }), { status: 400, headers });
      }

      await client.queryObject(
        "UPDATE matches SET status = 'live', started_at = CURRENT_TIMESTAMP, paused_at = NULL WHERE id = $1",
        [matchId]
      );

      broadcastLobbyUpdate(matchId, "match_resumed");
      return new Response(JSON.stringify({ message: "Match repris" }), { status: 200, headers });
    } catch (error) {
      console.error("Erreur reprise match:", error);
      return new Response(JSON.stringify({ error: "Erreur lors de la reprise" }), { status: 500, headers });
    }
  }

  /* Clôture le match, calcule les évolutions de stats FUT et les sauvegarde dans une transaction SQL. */
  if (isMatchRoute && pathParts[3] === "finish" && req.method === "POST") {
    try {
      const matchId = parseInt(pathParts[2]);
      const auth = await requireMatchController(req, matchId);
      if (auth.error) return new Response(JSON.stringify({ error: auth.error.message }), { status: auth.error.status, headers });

      if (!["live", "paused"].includes(auth.match.status)) {
        return new Response(JSON.stringify({ error: "Ce match ne peut pas être terminé" }), { status: 400, headers });
      }

      const match = auth.match;
      const finalElapsed = Number(match.elapsed_seconds || 0) + (match.status === "live" && match.started_at
        ? Math.max(0, Math.floor((Date.now() - new Date(match.started_at).getTime()) / 1000))
        : 0);
      const playersRes = await client.queryObject(`
        SELECT mp.user_id, mp.team_id, u.username
        FROM match_players mp
        JOIN users u ON u.id = mp.user_id
        WHERE mp.match_id = $1
        ORDER BY u.username ASC
      `, [matchId]);

      if (playersRes.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Aucun joueur dans ce match" }), { status: 400, headers });
      }

      const goalsRes = await client.queryObject("SELECT scorer_id, assist_id, team_id, minute FROM goals WHERE match_id = $1 ORDER BY minute ASC", [matchId]);
      const winnerTeamId = match.home_score > match.away_score ? match.home_team_id : match.away_score > match.home_score ? match.away_team_id : null;
      const playerSummaries = [];

      await client.queryObject("BEGIN");
      try {
        for (const player of playersRes.rows) {
          await ensurePlayerStats(player.user_id);
          const statsRes = await client.queryObject("SELECT * FROM player_stats WHERE user_id = $1", [player.user_id]);
          const before = normalizeStats(statsRes.rows[0], player.user_id);
          const goals = goalsRes.rows.filter(g => g.scorer_id === player.user_id).length;
          const assists = goalsRes.rows.filter(g => g.assist_id === player.user_id).length;
          const result = winnerTeamId === null ? "draw" : player.team_id === winnerTeamId ? "win" : "loss";
          const after = calculateUpdatedStats(before, result, goals, assists);

          await client.queryObject(`
            UPDATE player_stats SET
              overall = $2,
              rating_shot = $3,
              rating_pass = $4,
              rating_victory = $5,
              rating_form = $6,
              rating_defense = $7,
              matches_played = $8,
              wins = $9,
              losses = $10,
              draws = $11,
              goals = $12,
              assists = $13,
              motm_count = $14,
              current_streak = $15,
              best_streak = $16
            WHERE user_id = $1
          `, [
            player.user_id,
            after.overall,
            after.rating_shot,
            after.rating_pass,
            after.rating_victory,
            after.rating_form,
            after.rating_defense,
            after.matches_played,
            after.wins,
            after.losses,
            after.draws,
            after.goals,
            after.assists,
            after.motm_count,
            after.current_streak,
            after.best_streak
          ]);

          await client.queryObject(`
            INSERT INTO match_stat_changes (match_id, user_id, result, goals, assists, stats_before, stats_after)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
            ON CONFLICT (match_id, user_id) DO UPDATE SET
              result = EXCLUDED.result,
              goals = EXCLUDED.goals,
              assists = EXCLUDED.assists,
              stats_before = EXCLUDED.stats_before,
              stats_after = EXCLUDED.stats_after
          `, [matchId, player.user_id, result, goals, assists, JSON.stringify(before), JSON.stringify(after)]);

          playerSummaries.push({
            user_id: player.user_id,
            username: player.username,
            team_id: player.team_id,
            result,
            goals,
            assists,
            before,
            after
          });
        }

        await client.queryObject("UPDATE matches SET status = 'finished', ended_at = CURRENT_TIMESTAMP, paused_at = NULL, elapsed_seconds = $2 WHERE id = $1", [matchId, finalElapsed]);
        await client.queryObject("COMMIT");
      } catch (error) {
        await client.queryObject("ROLLBACK");
        throw error;
      }

      const summary = {
        match: { ...match, status: "finished", elapsed_seconds: finalElapsed },
        winner_team_id: winnerTeamId,
        goals: goalsRes.rows,
        players: playerSummaries
      };

      broadcastLobbyUpdate(matchId, "match_finished");
      return new Response(JSON.stringify(summary), { status: 200, headers });
    } catch (error) {
      console.error("Erreur finish match:", error);
      return new Response(JSON.stringify({ error: "Erreur lors de la fin du match" }), { status: 500, headers });
    }
  }

  // --- ROUTE : GET /matches/:id/summary ---
  if (isMatchRoute && pathParts[3] === "summary" && req.method === "GET") {
    try {
      const matchId = parseInt(pathParts[2]);
      const matchRes = await client.queryObject("SELECT * FROM matches WHERE id = $1", [matchId]);
      if (matchRes.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Match introuvable" }), { status: 404, headers });
      }

      const goalsRes = await client.queryObject(`
        SELECT g.*, us.username AS scorer_name, ua.username AS assist_name
        FROM goals g
        LEFT JOIN users us ON us.id = g.scorer_id
        LEFT JOIN users ua ON ua.id = g.assist_id
        WHERE g.match_id = $1
        ORDER BY g.minute ASC
      `, [matchId]);

      const changesRes = await client.queryObject(`
        SELECT msc.user_id, u.username, mp.team_id, msc.result, msc.goals, msc.assists, msc.stats_before, msc.stats_after
        FROM match_stat_changes msc
        JOIN users u ON u.id = msc.user_id
        LEFT JOIN match_players mp ON mp.match_id = msc.match_id AND mp.user_id = msc.user_id
        WHERE msc.match_id = $1
        ORDER BY u.username ASC
      `, [matchId]);

      const match = matchRes.rows[0];
      const winnerTeamId = match.home_score > match.away_score ? match.home_team_id : match.away_score > match.home_score ? match.away_team_id : null;
      const players = changesRes.rows.map(row => ({
        user_id: row.user_id,
        username: row.username,
        team_id: row.team_id,
        result: row.result,
        goals: Number(row.goals),
        assists: Number(row.assists),
        before: typeof row.stats_before === "string" ? JSON.parse(row.stats_before) : row.stats_before,
        after: typeof row.stats_after === "string" ? JSON.parse(row.stats_after) : row.stats_after
      }));

      return new Response(JSON.stringify({ match, winner_team_id: winnerTeamId, goals: goalsRes.rows, players }), { status: 200, headers });
    } catch (error) {
      console.error("Erreur summary match:", error);
      return new Response(JSON.stringify({ error: "Erreur lors du chargement du résumé" }), { status: 500, headers });
    }
  }

  /* Récupère la liste des équipes depuis la base de données. */
  if (url.pathname === "/teams" && req.method === "GET") {
    try {
      const result = await client.queryObject("SELECT * FROM teams");
      return new Response(JSON.stringify(result.rows), { status: 200, headers });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur base de données" }), { status: 500, headers });
    }
  }



  

  /* Récupère le classement de tous les joueurs trié par note globale (OVR). */
  if (url.pathname === "/leaderboard" && req.method === "GET") {
    try {
      const result = await client.queryObject(`
        SELECT
          u.id,
          u.username,
          ps.overall,
          ps.matches_played,
          ps.wins,
          ps.goals,
          ps.assists
        FROM users u
        LEFT JOIN player_stats ps ON ps.user_id = u.id
        ORDER BY COALESCE(ps.overall, 50) DESC, u.username ASC
        LIMIT 50
      `);

      const leaderboard = [];
      for (const user of result.rows) {
        if (user.overall === null || user.overall === undefined) {
          await ensurePlayerStats(user.id);
          leaderboard.push({ id: user.id, username: user.username, overall: 50, matches_played: 0, wins: 0, goals: 0, assists: 0 });
        } else {
          leaderboard.push({
            id: user.id,
            username: user.username,
            overall: Number(user.overall),
            matches_played: Number(user.matches_played),
            wins: Number(user.wins),
            goals: Number(user.goals),
            assists: Number(user.assists)
          });
        }
      }

      leaderboard.sort((a, b) => b.overall - a.overall);
      return new Response(JSON.stringify(leaderboard), { status: 200, headers });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur lors de la génération du leaderboard" }), { status: 500, headers });
    }
  }


  


  /* Authentifie l'utilisateur via le cookie JWT puis met à niveau la connexion HTTP en WebSocket. */
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







  /* Récupère l'historique des matchs joués par un utilisateur spécifique. */
  if (url.pathname.startsWith("/profile/") && url.pathname.endsWith("/history") && req.method === "GET") {
    try {
      const userIdStr = url.pathname.split("/")[2];
      const userId = parseInt(userIdStr);
      if (isNaN(userId)) {
        return new Response(JSON.stringify({ error: "ID invalide" }), { status: 400, headers });
      }

      const historyRes = await client.queryObject(`
        SELECT
          m.id AS match_id,
          m.name,
          m.home_score,
          m.away_score,
          m.home_team_id,
          m.away_team_id,
          m.ended_at,
          ht.name AS home_team_name,
          at.name AS away_team_name,
          msc.result,
          msc.goals,
          msc.assists,
          msc.stats_before,
          msc.stats_after
        FROM match_stat_changes msc
        JOIN matches m ON m.id = msc.match_id
        LEFT JOIN teams ht ON ht.id = m.home_team_id
        LEFT JOIN teams at ON at.id = m.away_team_id
        WHERE msc.user_id = $1
        ORDER BY COALESCE(m.ended_at, m.match_date) DESC, m.id DESC
      `, [userId]);

      const history = historyRes.rows.map(row => ({
        match_id: row.match_id,
        name: row.name,
        home_score: Number(row.home_score),
        away_score: Number(row.away_score),
        home_team_id: row.home_team_id,
        away_team_id: row.away_team_id,
        home_team_name: row.home_team_name,
        away_team_name: row.away_team_name,
        ended_at: row.ended_at,
        result: row.result,
        goals: Number(row.goals),
        assists: Number(row.assists),
        before: typeof row.stats_before === "string" ? JSON.parse(row.stats_before) : row.stats_before,
        after: typeof row.stats_after === "string" ? JSON.parse(row.stats_after) : row.stats_after
      }));

      return new Response(JSON.stringify({ history }), { status: 200, headers });
    } catch (error) {
      console.error("Erreur profile history:", error);
      return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500, headers });
    }
  }

  /* Récupère les informations de profil et statistiques d'un joueur. */
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

      await ensurePlayerStats(userId);
      const statsResult = await client.queryObject("SELECT * FROM player_stats WHERE user_id = $1", [userId]);
      const stats = normalizeStats(statsResult.rows[0], userId);

      const recentRes = await client.queryObject(`
        SELECT
          m.id AS match_id,
          m.name,
          m.home_score,
          m.away_score,
          m.home_team_id,
          m.away_team_id,
          m.ended_at,
          ht.name AS home_team_name,
          at.name AS away_team_name,
          msc.result,
          msc.goals,
          msc.assists,
          msc.stats_before,
          msc.stats_after
        FROM match_stat_changes msc
        JOIN matches m ON m.id = msc.match_id
        LEFT JOIN teams ht ON ht.id = m.home_team_id
        LEFT JOIN teams at ON at.id = m.away_team_id
        WHERE msc.user_id = $1
        ORDER BY COALESCE(m.ended_at, m.match_date) DESC, m.id DESC
        LIMIT 3
      `, [userId]);

      const recentMatches = recentRes.rows.map(row => ({
        match_id: row.match_id,
        name: row.name,
        home_score: Number(row.home_score),
        away_score: Number(row.away_score),
        home_team_id: row.home_team_id,
        away_team_id: row.away_team_id,
        home_team_name: row.home_team_name,
        away_team_name: row.away_team_name,
        ended_at: row.ended_at,
        result: row.result,
        goals: Number(row.goals),
        assists: Number(row.assists),
        before: typeof row.stats_before === "string" ? JSON.parse(row.stats_before) : row.stats_before,
        after: typeof row.stats_after === "string" ? JSON.parse(row.stats_after) : row.stats_after
      }));

      user.created_at = new Date().toISOString(); // Mock date
      user.stats = stats;

      return new Response(JSON.stringify({
        user,
        recentMatches
      }), { status: 200, headers });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500, headers });
    }
  }



  // ================================================================
  // SECTION 5 — ROUTES D'ADMINISTRATION
  // ================================================================

  /* Bloque l'accès à toutes les routes /admin/ si l'utilisateur n'a pas le rôle administrateur. */
  const isAdminRoute = url.pathname.startsWith("/admin");

  if (isAdminRoute) {
    try {
      const auth = await requireAdmin(req);
      if (auth.error) return authErrorResponse(auth, headers);

      // On découpe l'URL proprement en ignorant les slashs vides
      const pathParts = url.pathname.split("/").filter(Boolean); 

      /* Récupère la liste de tous les utilisateurs avec le nombre de matchs joués et de lobbys créés. */
      if (pathParts.length === 2 && pathParts[1] === "users" && req.method === "GET") {
        // Requête SQL optimisée avec des sous-requêtes pour compter les matchs et lobbys
        const query = `
          SELECT 
            u.id, 
            u.username, 
            u.role,
            (SELECT COUNT(*) FROM match_players mp WHERE mp.user_id = u.id) AS matches_played,
            (SELECT COUNT(*) FROM matches m WHERE m.creator_id = u.id) AS lobbies_created
          FROM users u
          ORDER BY u.id ASC
        `;
        const result = await client.queryObject(query);
        
        // On s'assure que les COUNT soient bien des nombres (PostgreSQL les renvoie parfois en string)
        const formattedRows = result.rows.map(row => ({
          ...row,
          matches_played: Number(row.matches_played),
          lobbies_created: Number(row.lobbies_created)
        }));

        return new Response(JSON.stringify(formattedRows), { status: 200, headers });
      }

      /* Modifie le rôle ("admin" ou "fan") d'un utilisateur spécifique. */
      if (pathParts.length === 4 && pathParts[1] === "users" && pathParts[3] === "role" && req.method === "PATCH") {
        const targetUserId = parseInt(pathParts[2]);
        if (isNaN(targetUserId)) {
            return new Response(JSON.stringify({ error: "ID invalide" }), { status: 400, headers });
        }

        const body = await req.json();
        const newRole = body.role; // Doit être "admin" ou "fan"

        if (newRole !== "admin" && newRole !== "fan") {
          return new Response(JSON.stringify({ error: "Le rôle doit être 'admin' ou 'fan'" }), { status: 400, headers });
        }

        // Mise à jour dans la base de données
        await client.queryObject("UPDATE users SET role = $1 WHERE id = $2", [newRole, targetUserId]);
        
        return new Response(JSON.stringify({ message: `Le rôle de l'utilisateur ${targetUserId} est passé à ${newRole}` }), { status: 200, headers });
      }

      // Si la route admin demandée n'existe pas
      return new Response(JSON.stringify({ error: "Route admin introuvable" }), { status: 404, headers });

    } catch (error) {
      console.error("Erreur Admin:", error);
      return new Response(JSON.stringify({ error: "Erreur serveur ou token invalide" }), { status: 500, headers });
    }
  }





  // --- ROUTE PAR DÉFAUT ---
  return new Response(JSON.stringify({ message: "API Foot fonctionnelle !" }), { status: 200, headers });
});