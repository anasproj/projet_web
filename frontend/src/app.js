const API = 'https://localhost:3000';
const WS_URL = 'wss://localhost:3000/ws';

const app = document.getElementById('app');

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

let teamsCache = {};
let ws = null;
let liveMatchId = null;
let chronoInterval = null;
let matchTimer = 0;
let lobbyJoined = false; // Guard pour n'appeler /join qu'une seule fois par session
let currentMatchData = null;

// --- MOCK PLAYERS POUR LE LOBBY ---
let mockLobbyPlayers = [];

// --- MOCK TIMELINE POUR LE LIVE ---
let mockTimeline = [];

function navigate(path) {
  lobbyJoined = false; // Réinitialise le guard quand on change de page
  window.location.hash = path;
}

function updateNavLinks(path) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${path}`);
  });
}

function handleLogout() {
  localStorage.removeItem('username');
  localStorage.removeItem('role');
  navigate('/login');
}

function updateNavbar() {
  const username = localStorage.getItem('username');
  const navLinks = document.querySelector('.nav-links');
  if (!navLinks) return;

  if (username) {
    navLinks.innerHTML = `
      <a href="#/home" class="nav-link">Lobbys</a>
      <a href="#/ranking" class="nav-link">Classement</a>
      <a href="#/profile" class="nav-link">Mon Profil</a>
      <button id="nav-logout" class="btn btn-outline btn-sm">Déconnexion</button>
    `;
    document.getElementById('nav-logout').addEventListener('click', handleLogout);
  } else {
    navLinks.innerHTML = `
      <a href="#/home" class="nav-link">Lobbys</a>
      <a href="#/login" class="nav-link">Connexion</a>
    `;
  }
}

async function router() {
  // Nettoyer les minuteurs et connexions websockets actifs avant de changer de route
  cleanupLiveSession();

  const username = localStorage.getItem('username');
  let hash = window.location.hash.replace('#', '') || '/home';

  // SÉCURITÉ : Si l'utilisateur n'est pas connecté, il est forcé de rester sur /login
  if (!username && hash !== '/login') {
    window.location.hash = '/login';
    return;
  }

  // Transition en fondu : on réinitialise la classe d'animation
  app.classList.remove('fade-in');
  void app.offsetWidth; // Force la refonte pour relancer l'animation
  app.classList.add('fade-in');

  updateNavbar();
  updateNavLinks(hash.startsWith('/match/') ? '/home' : hash);

  if (hash === '/login') {
    renderLogin();
  } else if (hash.startsWith('/match/')) {
    const matchId = hash.split('/')[2];
    await renderMatchDetails(matchId);
  } else if (hash === '/ranking') {
    await renderRanking();
  } else if (hash.startsWith('/profile')) {
    const parts = hash.split('/');
    const userId = parts[2];
    await renderProfile(userId);
  } else {
    await renderHome();
  }
}

async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API}${endpoint}`, { credentials: 'include', ...options });
  if (!res.ok) throw new Error(`Erreur API : ${res.status}`);
  return res.json();
}

async function loadTeams() {
  if (Object.keys(teamsCache).length === 0) {
    try {
      const teams = await apiFetch('/teams');
      teams.forEach(t => teamsCache[t.id] = t);
    } catch (e) {
      console.error("Impossible de charger les équipes");
    }
  }
}

async function renderHome() {
  app.innerHTML = `
    <div class="football-container">
      <div class="football-ball">⚽</div>
      <div class="football-shadow"></div>
      <p class="loader-text">Chargement des matchs en direct...</p>
    </div>`;
  try {
    await loadTeams();
    const data = await apiFetch('/matchs');
    const matchs = Array.isArray(data) ? data : [];
    const username = localStorage.getItem('username');

    const cards = matchs.map(m => {
      const homeTeam = teamsCache[m.home_team_id]?.name || "Équipe Domicile";
      const awayTeam = teamsCache[m.away_team_id]?.name || "Équipe Extérieur";
      return `
      <div class="card" style="cursor:pointer; padding: 24px; display: flex; flex-direction: column; gap: 12px;" onclick="window.location.hash='/match/${m.id}'">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="lobby-badge badge-${m.status === 'live' ? 'live' : m.status === 'finished' ? 'finished' : 'waiting'}" style="font-size: 0.75rem; font-weight: 900; letter-spacing: 0.05em;">${m.status.toUpperCase()}</span>
          <span class="text-muted" style="font-size:0.8rem; font-weight:600; color:var(--gold) !important; display:flex; align-items:center; gap:4px;">🏆 ${escapeHtml(m.rules)}</span>
        </div>
        <div>
          <h3 style="font-size: 1.35rem; font-weight: 800; color: white; margin: 0; line-height: 1.2;">${escapeHtml(m.name)}</h3>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 4px; padding-top: 12px; border-top: 1px solid var(--border);">
          <div style="font-weight:700; font-size:1rem; color:var(--text-muted);">${homeTeam} <span style="font-weight:400; font-size:0.85rem;">vs</span> ${awayTeam}</div>
          <div style="font-size:1.15rem; font-weight:900; color:white; background: var(--surface-light); padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border);">
            <span style="color:var(--gold);">${m.home_score}</span> - <span style="color:var(--gold);">${m.away_score}</span>
          </div>
        </div>
      </div>
    `}).join('');

    app.innerHTML = `
      <div class="page">
        <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div>
            <h1>Lobbys</h1>
            <p class="text-muted">Rejoignez un match en cours ou créez le vôtre.</p>
          </div>
          ${username ? `<button class="btn btn-success" id="btn-create-lobby" style="display:flex; align-items:center; gap:8px;">🏆 Créer un lobby</button>` : ''}
        </div>
        ${matchs.length === 0 ? `
          <p class="text-muted" style="text-align:center; padding:40px 0;">Aucun match disponible pour le moment.</p>
        ` : `
          <div class="lobbies-grid">${cards}</div>
        `}
      </div>`;

    if (username) {
      const btn = document.getElementById('btn-create-lobby');
      if (btn) {
        btn.addEventListener('click', openCreateLobbyModal);
      }
    }
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="page"><p class="text-muted">Impossible de charger les matchs. Vérifiez que le backend est démarré.</p></div>`;
  }
}

async function renderMatchDetails(id) {
  app.innerHTML = `
    <div class="football-container">
      <div class="football-ball">⚽</div>
      <div class="football-shadow"></div>
      <p class="loader-text">Chargement des détails du match...</p>
    </div>`;
  try {
    await loadTeams();
    const data = await apiFetch('/matchs');
    const matchs = Array.isArray(data) ? data : [];
    const match = matchs.find(m => m.id == id);

    if (!match) {
      app.innerHTML = `<div class="page"><p>Match introuvable.</p><button class="btn btn-outline" onclick="window.location.hash='/home'">Retour</button></div>`;
      return;
    }

    liveMatchId = match.id;
    currentMatchData = match;
    const homeTeam = teamsCache[match.home_team_id]?.name || "Équipe Domicile";
    const awayTeam = teamsCache[match.away_team_id]?.name || "Équipe Extérieur";

    const currentUserId = localStorage.getItem('userId');
    const isCreator = currentUserId && (parseInt(match.creator_id) === parseInt(currentUserId));

    if (match.status === 'scheduled' || match.status === 'waiting') {
      const currentUsername = localStorage.getItem('username');
      if (currentUsername && !mockLobbyPlayers.find(p => p.username === currentUsername)) {
        mockLobbyPlayers.push({ id: parseInt(currentUserId || 999), username: currentUsername, team: null });
      }
      
      app.innerHTML = getLobbyHTML(match, homeTeam, awayTeam, isCreator);
      // Guard anti-boucle : ne pas recréer un WS déjà ouvert
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        if (!lobbyJoined) {
          lobbyJoined = true;
          joinLobby(match.id);
        }
        initRealtimeConnection();
      } else {
        // WS déjà ouvert : mettre à jour l'indicateur visuel directement
        const dot = document.getElementById('live-status-dot');
        const txt = document.getElementById('live-status-text');
        if (dot && txt) {
          dot.style.background = "#27ae60";
          dot.style.boxShadow = "0 0 8px #27ae60";
          txt.textContent = "En direct";
          txt.style.color = "#27ae60";
        }
      }
      return;
    }

    app.innerHTML = `
      <div class="page">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <button class="btn btn-outline" onclick="window.location.hash='/home'">⬅ Lobbys</button>
          
          <div class="status-indicator">
            <span id="live-status-dot" class="status-dot"></span>
            <span id="live-status-text" class="text-muted">Connexion...</span>
          </div>
        </div>
        
        <div class="card" style="text-align:center; padding: 40px 20px; position:relative;">
          ${isCreator ? `
            <span class="creator-badge" style="position:absolute; top:20px; right:20px; background:var(--gold); color:var(--bg-dark); padding:6px 12px; border-radius:20px; font-weight:bold; font-size:0.8rem; display:flex; align-items:center; gap:4px; box-shadow: 0 0 10px rgba(212, 175, 55, 0.3);">
              🏆 Créateur
            </span>
          ` : ''}
          <span class="lobby-badge badge-${match.status === 'live' ? 'live' : match.status === 'finished' ? 'finished' : 'waiting'}" style="margin-bottom:12px; display:inline-block;">${match.status.toUpperCase()}</span>
          
          <h2 style="font-size: 2.2rem; font-weight: 900; background: linear-gradient(45deg, #ffffff, #c7c7c7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 5px;">${escapeHtml(match.name)}</h2>
          <p class="text-muted" style="margin-bottom: 20px; font-weight: 600; font-size: 1.1rem; color: var(--gold) !important;">🏆 ${escapeHtml(match.rules)}</p>

          <div>
            <div id="live-match-chrono" class="match-chrono">⏱️ 00:00</div>
          </div>

          <div style="display:flex; justify-content:center; align-items:center; gap:30px; margin-top:20px;">
            <div style="flex:1; text-align:right;">
              <h2 style="font-size:1.8rem;">${homeTeam}</h2>
            </div>
            <div id="live-score" style="font-size:3rem; font-weight:900; background:-webkit-linear-gradient(45deg, var(--gold), #ffdf70); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">
              ${match.home_score} - ${match.away_score}
            </div>
            <div style="flex:1; text-align:left;">
              <h2 style="font-size:1.8rem;">${awayTeam}</h2>
            </div>
          </div>
          ${isCreator ? `
            <div style="margin-top: 30px;">
               <button class="btn btn-success" onclick="openGoalModal(${match.id}, ${match.home_team_id}, ${match.away_team_id})">⚽ Enregistrer un but</button>
            </div>
          ` : ''}
        </div>

        <!-- COMPOSITIONS DES ÉQUIPES -->
        <div style="display: flex; gap: 20px; margin-top: 25px; margin-bottom: 25px; flex-wrap: wrap;">
          <div class="card" style="flex: 1; min-width: 250px; padding: 20px; text-align: left; background: var(--surface-light);">
            <h3 style="color: var(--primary); font-size: 1.1rem; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 6px; display: flex; align-items: center; gap: 8px;">
              🏠 ${homeTeam}
            </h3>
            <div id="live-home-players" style="display: flex; flex-direction: column; gap: 8px;">
              ${match.players && match.players.filter(p => p.team_id == match.home_team_id).length > 0 
                ? match.players.filter(p => p.team_id == match.home_team_id).map(p => `
                    <div style="display: flex; align-items: center; gap: 8px; color: white;">
                      <div class="player-avatar" style="width: 28px; height: 28px; font-size: 0.8rem; line-height: 28px; background: var(--primary); border-radius: 50%; text-align: center; font-weight: bold; color: white;">${p.username.charAt(0).toUpperCase()}</div>
                      <span style="font-weight: 600;">${escapeHtml(p.username)}</span>
                    </div>
                  `).join('')
                : '<p class="text-muted" style="font-size: 0.9rem; font-style: italic;">Aucun joueur assigné</p>'
              }
            </div>
          </div>
          <div class="card" style="flex: 1; min-width: 250px; padding: 20px; text-align: left; background: var(--surface-light);">
            <h3 style="color: var(--danger); font-size: 1.1rem; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 6px; display: flex; align-items: center; gap: 8px;">
              ✈️ ${awayTeam}
            </h3>
            <div id="live-away-players" style="display: flex; flex-direction: column; gap: 8px;">
              ${match.players && match.players.filter(p => p.team_id == match.away_team_id).length > 0 
                ? match.players.filter(p => p.team_id == match.away_team_id).map(p => `
                    <div style="display: flex; align-items: center; gap: 8px; color: white;">
                      <div class="player-avatar" style="width: 28px; height: 28px; font-size: 0.8rem; line-height: 28px; background: var(--danger); border-radius: 50%; text-align: center; font-weight: bold; color: white;">${p.username.charAt(0).toUpperCase()}</div>
                      <span style="font-weight: 600;">${escapeHtml(p.username)}</span>
                    </div>
                  `).join('')
                : '<p class="text-muted" style="font-size: 0.9rem; font-style: italic;">Aucun joueur assigné</p>'
              }
            </div>
          </div>
        </div>
        
        <!-- TIMELINE PANNEAU DE RESUME -->
        <div id="live-timeline-container">
          ${getTimelineHTML(match)}
        </div>

        <!-- Live Chat Container -->
        <div class="chat-container">
          <div class="chat-header">
            <h3>💬 Chat en direct</h3>
            <span id="chat-users-count" class="text-muted" style="font-size:0.8rem;">Déconnecté</span>
          </div>
          <div id="chat-messages" class="chat-messages">
            <div class="chat-message incoming">
              <span class="username">Système</span>
              Bienvenue dans le salon de discussion du match ! Restez courtois.
              <span class="time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
          <form id="chat-form" class="chat-input-area">
            <input id="chat-input-msg" type="text" class="chat-input" placeholder="Écrivez votre message..." autocomplete="off" required />
            <button type="submit" class="btn btn-success btn-sm" style="padding:0 20px;">Envoyer</button>
          </form>
        </div>
      </div>
    `;

    // Lier le formulaire de chat
    document.getElementById('chat-form').addEventListener('submit', handleSendChatMessage);

    // Initialiser le chronomètre du match à une valeur logique pour la démo
    matchTimer = match.status === 'live' ? 15 * 60 : 0; // Commence à 15:00 pour la démo
    startChrono();

    // Initialiser la connexion WebSocket (seulement si pas déjà ouverte)
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      initRealtimeConnection();
    }

  } catch (e) {
    app.innerHTML = `<div class="page"><p>Erreur lors du chargement des détails du match.</p></div>`;
  }
}

// Logique du chronomètre
function startChrono() {
  const chronoEl = document.getElementById('live-match-chrono');
  if (!chronoEl) return;

  clearInterval(chronoInterval);
  chronoInterval = setInterval(() => {
    matchTimer++;
    const mins = Math.floor(matchTimer / 60).toString().padStart(2, '0');
    const secs = (matchTimer % 60).toString().padStart(2, '0');
    chronoEl.textContent = `⏱️ ${mins}:${secs}`;
  }, 1000);
}

// Connexion WebSocket — fonctionne dans le lobby ET dans la vue live
function initRealtimeConnection() {
  console.log("Tentative de connexion WebSocket à :", WS_URL);

  function setStatus(online) {
    const dot = document.getElementById('live-status-dot');
    const txt = document.getElementById('live-status-text');
    const usersCount = document.getElementById('chat-users-count');
    if (dot && txt) {
      if (online) {
        dot.style.background = "#27ae60";
        dot.style.boxShadow = "0 0 8px #27ae60";
        txt.textContent = "En direct";
        txt.style.color = "#27ae60";
      } else {
        dot.style.background = "#e74c3c";
        dot.style.boxShadow = "none";
        txt.textContent = "Hors-ligne";
        txt.style.color = "var(--text-muted)";
      }
    }
    if (usersCount) usersCount.textContent = online ? "Connecté au live" : "Déconnecté";
  }

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log("✅ WebSocket connecté");
      setStatus(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleIncomingRealtimeEvent(data);
      } catch (err) {
        console.error("Erreur de parsing WebSocket message:", err);
      }
    };

    ws.onerror = () => { setStatus(false); };
    ws.onclose = () => { setStatus(false); };

  } catch (e) {
    setStatus(false);
  }
}

function handleOfflineState() {
  const dot = document.getElementById('live-status-dot');
  const txt = document.getElementById('live-status-text');
  const usersCount = document.getElementById('chat-users-count');
  if (dot && txt) {
    dot.style.background = "#e74c3c";
    dot.style.boxShadow = "none";
    txt.textContent = "Hors-ligne";
    txt.style.color = "var(--text-muted)";
  }
  if (usersCount) usersCount.textContent = "Déconnecté";
}

async function refreshLiveMatchUI(matchId) {
  if (!matchId) return;
  try {
    const data = await apiFetch('/matchs');
    const matchs = Array.isArray(data) ? data : [];
    const match = matchs.find(m => m.id == matchId);
    if (!match) return;

    currentMatchData = match;

    // 1. Mettre à jour le score dans le DOM
    const scoreEl = document.getElementById('live-score');
    if (scoreEl) {
      scoreEl.innerHTML = `${match.home_score} - ${match.away_score}`;
    }

    // 2. Mettre à jour la timeline dans le DOM
    const timelineContainer = document.getElementById('live-timeline-container');
    if (timelineContainer) {
      timelineContainer.innerHTML = getTimelineHTML(match);
    }
  } catch (err) {
    console.error("Erreur refreshLiveMatchUI:", err);
  }
}

function handleIncomingRealtimeEvent(data) {
  if (data.type === "score_update") {
    refreshLiveMatchUI(liveMatchId);
  } else if (data.type === "new_message") {
    appendChatMessage(data.username, data.text, false, data.time);
  } else if (data.type === "player_joined" || data.type === "team_assigned") {
    // Mise à jour légère : pas de reconnexion WS
    refreshLobbyUI(liveMatchId);
  } else if (data.type === "match_started") {
    // Rechargement complet vers la vue du match
    renderMatchDetails(liveMatchId);
  }
}

// ==========================================
// FONCTIONS DU SALON D'ATTENTE (LOBBY)
// ==========================================

function getLobbyHTML(match, homeTeam, awayTeam, isCreator) {
  const homePlayers = mockLobbyPlayers.filter(p => p.team === match.home_team_id);
  const awayPlayers = mockLobbyPlayers.filter(p => p.team === match.away_team_id);
  const unassignedPlayers = mockLobbyPlayers.filter(p => !p.team);

  const renderPlayerCard = (p) => `
    <div class="player-card">
      <div class="player-info">
        <div class="player-avatar">${p.username.charAt(0).toUpperCase()}</div>
        <span style="color:white; font-weight:600;">${escapeHtml(p.username)}</span>
      </div>
      ${!p.team && isCreator ? `
        <div class="assign-actions">
          <button class="btn-assign home" onclick="assignPlayer(${p.id}, ${match.home_team_id})">🏠 Domicile</button>
          <button class="btn-assign away" onclick="assignPlayer(${p.id}, ${match.away_team_id})">✈️ Extérieur</button>
        </div>
      ` : ''}
      ${p.team && isCreator ? `
        <div class="assign-actions" style="margin-top: 8px;">
          <button class="btn-assign" style="background:var(--danger); width:100%; border-radius:4px;" onclick="assignPlayer(${p.id}, null)">❌ Retirer de l'équipe</button>
        </div>
      ` : ''}
    </div>
  `;

  return `
    <div class="page">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <button class="btn btn-outline" onclick="window.location.hash='/home'">⬅ Lobbys</button>
        <div class="status-indicator">
          <span id="live-status-dot" class="status-dot"></span>
          <span id="live-status-text" class="text-muted">Connexion...</span>
        </div>
      </div>
      
      <div class="lobby-container">
        <div class="lobby-header">
          <span class="lobby-badge badge-waiting" style="margin-bottom:15px; display:inline-block;">EN ATTENTE</span>
          <h2 style="font-size: 2.2rem; font-weight: 900; background: linear-gradient(45deg, #ffffff, #c7c7c7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 5px;">${escapeHtml(match.name)}</h2>
          <p class="text-muted" style="margin-top: 8px; font-weight: 600; font-size: 1.1rem; color: var(--gold) !important;">🏆 ${escapeHtml(match.rules)}</p>
        </div>

        <div class="lobby-columns">
          <div class="team-column home-team">
            <h3 class="team-title">🏠 ${homeTeam}</h3>
            ${homePlayers.length === 0 ? '<p class="text-muted" style="text-align:center; font-size:0.9rem;">Vide</p>' : homePlayers.map(renderPlayerCard).join('')}
          </div>

          <div class="team-column unassigned">
            <h3 class="team-title">⏳ En attente</h3>
            ${unassignedPlayers.length === 0 ? '<p class="text-muted" style="text-align:center; font-size:0.9rem;">Vide</p>' : unassignedPlayers.map(renderPlayerCard).join('')}
          </div>

          <div class="team-column away-team">
            <h3 class="team-title">✈️ ${awayTeam}</h3>
            ${awayPlayers.length === 0 ? '<p class="text-muted" style="text-align:center; font-size:0.9rem;">Vide</p>' : awayPlayers.map(renderPlayerCard).join('')}
          </div>
        </div>

        <div class="lobby-footer">
          ${isCreator ? `
            <button class="btn btn-success" style="font-size:1.2rem; padding:15px 40px; box-shadow:0 0 15px rgba(39,174,96,0.4);" onclick="startMatch(${match.id})">🚀 Lancer le match</button>
          ` : `
            <p class="waiting-text">En attente du créateur pour lancer le match...</p>
          `}
        </div>
      </div>
    </div>
  `;
}

function getTimelineHTML(match) {
  const goals = match.goals || [];
  if (goals.length === 0) return '';
  
  const eventsHtml = goals.map(ev => {
    const isHome = ev.team_id == match.home_team_id;
    const align = isHome ? 'left' : 'right';
    const teamColor = isHome ? 'var(--primary)' : 'var(--danger)';
    
    return `
      <div class="timeline-event" style="align-self: ${isHome ? 'flex-start' : 'flex-end'}; text-align: ${align}; border-${align}: 4px solid ${teamColor};">
        <div class="timeline-minute">${ev.minute}' <span class="timeline-icon">⚽</span></div>
        <div class="timeline-details">
          <strong>${escapeHtml(ev.scorer_name || 'Joueur')}</strong>
          ${ev.assist_name ? `<div class="timeline-assist">(Passe : ${escapeHtml(ev.assist_name)})</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="match-summary-panel">
      <h3 style="text-align:center; font-size:1.3rem; margin-bottom:15px; color:var(--gold);">Résumé du match</h3>
      <div class="timeline-container">
        ${eventsHtml}
      </div>
    </div>
  `;
}

// Rafraîchit les colonnes du salon sans recréer la connexion WebSocket
async function refreshLobbyUI(matchId) {
  if (!matchId) return;
  try {
    const data = await apiFetch('/matchs');
    const matchs = Array.isArray(data) ? data : [];
    const match = matchs.find(m => m.id == matchId);
    if (!match) return;

    // Si le match est passé en live, charger la vue live complète
    if (match.status === 'live') {
      await renderMatchDetails(matchId);
      return;
    }

    await loadTeams();
    const homeTeam = teamsCache[match.home_team_id]?.name || "Équipe Domicile";
    const awayTeam = teamsCache[match.away_team_id]?.name || "Équipe Extérieur";
    const currentUserId = localStorage.getItem('userId');
    const isCreator = currentUserId && (parseInt(match.creator_id) === parseInt(currentUserId));

    // Mettre à jour mockLobbyPlayers depuis la vraie BDD
    if (match.players && Array.isArray(match.players)) {
      mockLobbyPlayers = match.players.map(p => ({
        id: p.user_id,
        username: p.username,
        team: p.team_id || null
      }));
    }

    app.innerHTML = getLobbyHTML(match, homeTeam, awayTeam, isCreator);
    // Restaurer l'indicateur WS vert si la connexion est déjà active
    if (ws && ws.readyState === WebSocket.OPEN) {
      const dot = document.getElementById('live-status-dot');
      const txt = document.getElementById('live-status-text');
      if (dot && txt) { dot.style.background="#27ae60"; dot.style.boxShadow="0 0 8px #27ae60"; txt.textContent="En direct"; txt.style.color="#27ae60"; }
    }
    // Le WS est toujours actif (on ne l'a pas recréé), pas besoin de le réinitialiser
  } catch(e) {
    console.error("Erreur refreshLobbyUI:", e);
  }
}

async function joinLobby(matchId) {
  try {
    await apiFetch(`/matches/${matchId}/join`, { method: 'POST' });
  } catch(e) { console.log("L'API /join n'est pas encore prête !"); }
}

window.assignPlayer = async function(playerId, teamId) {
  // Mise à jour locale immédiate (optimistic UI)
  const p = mockLobbyPlayers.find(pl => pl.id === playerId);
  if (p) p.team = teamId;

  // Re-render le lobby sans toucher au WS
  try {
    await loadTeams();
    const data = await apiFetch('/matchs');
    const matchs = Array.isArray(data) ? data : [];
    const match = matchs.find(m => m.id == liveMatchId);
    if (match) {
      const homeTeam = teamsCache[match.home_team_id]?.name || "Équipe Domicile";
      const awayTeam = teamsCache[match.away_team_id]?.name || "Équipe Extérieur";
      const currentUserId = localStorage.getItem('userId');
      const isCreator = currentUserId && (parseInt(match.creator_id) === parseInt(currentUserId));
      app.innerHTML = getLobbyHTML(match, homeTeam, awayTeam, isCreator);
      // Restaurer l'indicateur WS vert si la connexion est déjà active
      if (ws && ws.readyState === WebSocket.OPEN) {
        const dot = document.getElementById('live-status-dot');
        const txt = document.getElementById('live-status-text');
        if (dot && txt) { dot.style.background="#27ae60"; dot.style.boxShadow="0 0 8px #27ae60"; txt.textContent="En direct"; txt.style.color="#27ae60"; }
      }
    }
  } catch(e) { console.error("Erreur refresh après assign:", e); }

  // Appel API pour persister + broadcaster via WS
  try {
    await apiFetch(`/matches/${liveMatchId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: playerId, teamId: teamId })
    });
  } catch(e) { console.log("Erreur API /assign:", e); }
};

window.startMatch = async function(matchId) {
  try {
    await apiFetch(`/matches/${matchId}/start`, { method: 'POST' });
    // L'event WS match_started va déclencher renderMatchDetails pour tout le monde
    // Si on est le créateur, on redirige directement
    await renderMatchDetails(matchId);
  } catch(e) { 
    console.error("Erreur lancement match:", e);
    alert("Impossible de lancer le match : " + e.message);
  }
};

function appendChatMessage(username, text, isOutgoing = false, time = null) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const timeStr = time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msgHtml = `
    <div class="chat-message ${isOutgoing ? 'outgoing' : 'incoming'}">
      <span class="username">${username}</span>
      ${text}
      <span class="time">${timeStr}</span>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', msgHtml);
  container.scrollTop = container.scrollHeight;
}

function handleSendChatMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input-msg');
  if (!input) return;

  const msg = input.value.trim();
  if (!msg) return;

  // Afficher le message envoyé localement
  appendChatMessage("Moi", msg, true);

  // Si la connexion WebSocket est active, envoyer le message
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "chat_message",
      matchId: liveMatchId,
      text: msg
    }));
  }

  input.value = "";
}

function cleanupLiveSession() {
  clearInterval(chronoInterval);
  // On ferme le WS seulement si on quitte une page de match
  // (le router appelle cleanupLiveSession avant chaque navigation)
  if (ws) {
    ws.close();
    ws = null;
  }
  liveMatchId = null;
  lobbyJoined = false;
}

// Logique de la modale
// Logique de la modale par étapes dynamiques
let goalState = {
  matchId: null,
  homeTeamId: null,
  awayTeamId: null,
  scorerId: null,
  scorerUsername: '',
  scorerTeamId: null,
  assistId: null,
  assistUsername: '',
  minute: 1
};

window.openGoalModal = function (matchId, homeTeamId, awayTeamId) {
  goalState = {
    matchId,
    homeTeamId,
    awayTeamId,
    scorerId: null,
    scorerUsername: '',
    scorerTeamId: null,
    assistId: null,
    assistUsername: '',
    minute: Math.max(1, Math.floor(matchTimer / 60) + 1)
  };
  document.getElementById('goal-modal').classList.remove('hidden');
  renderGoalStep1();
};

function renderGoalStep1() {
  const content = document.getElementById('goal-modal-content');
  const homeTeamName = teamsCache[goalState.homeTeamId]?.name || "Équipe Domicile";
  const awayTeamName = teamsCache[goalState.awayTeamId]?.name || "Équipe Extérieur";

  const players = currentMatchData?.players || [];
  const homePlayers = players.filter(p => p.team_id == goalState.homeTeamId);
  const awayPlayers = players.filter(p => p.team_id == goalState.awayTeamId);

  let playersHtml = '';
  if (players.length === 0) {
    playersHtml = `
      <p class="text-muted" style="width: 100%; text-align: center; font-style: italic;">
        Aucun joueur assigné dans les équipes. Veuillez sélectionner parmi les membres :
      </p>
      <div style="width: 100%; display: flex; flex-direction: column; gap: 8px;">
        <select id="fallback-scorer-select" class="form-input" style="width:100%;">
          <option value="">-- Sélectionner le buteur --</option>
        </select>
        <div style="margin-top: 10px;">
          <label class="modal-label" style="display:block; margin-bottom:6px;">Équipe du buteur :</label>
          <select id="fallback-team-select" class="form-input" style="width:100%;">
            <option value="${goalState.homeTeamId}">${homeTeamName}</option>
            <option value="${goalState.awayTeamId}">${awayTeamName}</option>
          </select>
        </div>
      </div>
    `;
    apiFetch('/leaderboard').then(users => {
      const select = document.getElementById('fallback-scorer-select');
      if (select) {
        users.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.id;
          opt.textContent = u.username;
          select.appendChild(opt);
        });
        select.addEventListener('change', (e) => {
          const opt = select.options[select.selectedIndex];
          const teamSel = document.getElementById('fallback-team-select');
          if (opt && opt.value) {
            goalState.scorerId = parseInt(opt.value);
            goalState.scorerUsername = opt.textContent;
            goalState.scorerTeamId = parseInt(teamSel.value);
            renderGoalStep2();
          }
        });
      }
    });
  } else {
    playersHtml = `
      <div style="flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 10px;">
        <h4 style="color: var(--primary); margin: 0 0 4px 0; font-size: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 6px;">🏠 ${homeTeamName}</h4>
        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 250px; overflow-y: auto;">
          ${homePlayers.map(p => `
            <button class="btn btn-outline" style="text-align: left; padding: 10px; display: flex; align-items: center; gap: 8px; width: 100%;" onclick="selectScorer(${p.user_id}, '${escapeHtml(p.username)}', ${goalState.homeTeamId})">
              <div class="player-avatar" style="width: 24px; height: 24px; font-size: 0.75rem; line-height: 24px; background: var(--primary); color: white; border-radius: 50%; font-weight: bold; text-align: center;">${p.username.charAt(0).toUpperCase()}</div>
              <span style="font-weight: 600;">${escapeHtml(p.username)}</span>
            </button>
          `).join('')}
          ${homePlayers.length === 0 ? '<p class="text-muted" style="font-size:0.85rem; font-style:italic;">Vide</p>' : ''}
        </div>
      </div>
      <div style="flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 10px;">
        <h4 style="color: var(--danger); margin: 0 0 4px 0; font-size: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 6px;">✈️ ${awayTeamName}</h4>
        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 250px; overflow-y: auto;">
          ${awayPlayers.map(p => `
            <button class="btn btn-outline" style="text-align: left; padding: 10px; display: flex; align-items: center; gap: 8px; width: 100%;" onclick="selectScorer(${p.user_id}, '${escapeHtml(p.username)}', ${goalState.awayTeamId})">
              <div class="player-avatar" style="width: 24px; height: 24px; font-size: 0.75rem; line-height: 24px; background: var(--danger); color: white; border-radius: 50%; font-weight: bold; text-align: center;">${p.username.charAt(0).toUpperCase()}</div>
              <span style="font-weight: 600;">${escapeHtml(p.username)}</span>
            </button>
          `).join('')}
          ${awayPlayers.length === 0 ? '<p class="text-muted" style="font-size:0.85rem; font-style:italic;">Vide</p>' : ''}
        </div>
      </div>
    `;
  }

  content.innerHTML = `
    <h3 class="modal-title">⚽ Choisir le buteur</h3>
    <p class="modal-subtitle">Sélectionnez le joueur qui a marqué le but.</p>
    
    <div class="modal-section" style="display: flex; gap: 16px; flex-wrap: wrap; margin-top: 15px; margin-bottom: 20px;">
      ${playersHtml}
    </div>

    <div class="modal-actions" style="margin-top: 20px;">
      <button class="btn btn-outline" onclick="closeGoalModal()">Annuler</button>
    </div>
  `;
}

window.selectScorer = function(id, username, teamId) {
  goalState.scorerId = id;
  goalState.scorerUsername = username;
  goalState.scorerTeamId = teamId;
  renderGoalStep2();
};

function renderGoalStep2() {
  const content = document.getElementById('goal-modal-content');
  const scorerTeamName = teamsCache[goalState.scorerTeamId]?.name || "l'équipe";
  
  const players = currentMatchData?.players || [];
  const teamPlayers = players.filter(p => p.team_id == goalState.scorerTeamId && p.user_id != goalState.scorerId);

  let playersHtml = '';
  if (players.length === 0) {
    playersHtml = `
      <p class="text-muted" style="width: 100%; text-align: center; font-style: italic; margin-bottom: 12px;">
        Sélectionner le passeur décisif de <strong>${escapeHtml(scorerTeamName)}</strong> :
      </p>
      <div style="width: 100%; display: flex; flex-direction: column; gap: 8px;">
        <select id="fallback-assist-select" class="form-input" style="width:100%;">
          <option value="">-- Aucun passeur --</option>
        </select>
      </div>
    `;
    apiFetch('/leaderboard').then(users => {
      const select = document.getElementById('fallback-assist-select');
      if (select) {
        users.forEach(u => {
          if (u.id != goalState.scorerId) {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.username;
            select.appendChild(opt);
          }
        });
        select.addEventListener('change', (e) => {
          const opt = select.options[select.selectedIndex];
          if (opt && opt.value) {
            goalState.assistId = parseInt(opt.value);
            goalState.assistUsername = opt.textContent;
          } else {
            goalState.assistId = null;
            goalState.assistUsername = '';
          }
          renderGoalStep3();
        });
      }
    });
  } else {
    playersHtml = `
      <div style="display: flex; flex-direction: column; gap: 8px; width: 100%; max-height: 250px; overflow-y: auto;">
        ${teamPlayers.map(p => `
          <button class="btn btn-outline" style="text-align: left; padding: 10px; display: flex; align-items: center; gap: 8px; width: 100%;" onclick="selectAssist(${p.user_id}, '${escapeHtml(p.username)}')">
            <div class="player-avatar" style="width: 24px; height: 24px; font-size: 0.75rem; line-height: 24px; background: ${goalState.scorerTeamId == goalState.homeTeamId ? 'var(--primary)' : 'var(--danger)'}; color: white; border-radius: 50%; font-weight: bold; text-align: center;">${p.username.charAt(0).toUpperCase()}</div>
            <span style="font-weight: 600;">${escapeHtml(p.username)}</span>
          </button>
        `).join('')}
        ${teamPlayers.length === 0 ? '<p class="text-muted" style="text-align: center; font-style: italic;">Aucun autre joueur dans cette équipe pour une passe.</p>' : ''}
      </div>
    `;
  }

  content.innerHTML = `
    <h3 class="modal-title">👟 Choisir le passeur</h3>
    <p class="modal-subtitle">Sélectionnez le joueur de <strong>${escapeHtml(scorerTeamName)}</strong> auteur de la passe.</p>
    
    <div class="modal-section" style="margin-top: 15px; margin-bottom: 20px;">
      ${playersHtml}
    </div>

    <div class="modal-actions" style="margin-top: 20px; display: flex; gap: 10px;">
      <button class="btn btn-success" style="flex: 1;" onclick="selectAssist(null, '')">Pas de passeur</button>
      <button class="btn btn-outline" onclick="renderGoalStep1()">Retour</button>
    </div>
  `;
}

window.selectAssist = function(id, username) {
  goalState.assistId = id;
  goalState.assistUsername = username;
  renderGoalStep3();
};

function renderGoalStep3() {
  const content = document.getElementById('goal-modal-content');
  const scorerTeamName = teamsCache[goalState.scorerTeamId]?.name || "l'équipe";
  
  content.innerHTML = `
    <h3 class="modal-title">📝 Confirmer le but</h3>
    <p class="modal-subtitle">Vérifiez les détails avant de valider.</p>
    
    <div class="modal-section" style="display:flex; flex-direction:column; gap:16px; margin-top: 15px; margin-bottom: 20px; text-align: left; background: var(--surface-light); padding: 15px; border-radius: 8px; border: 1px solid var(--border);">
      <div style="color: white; font-size: 1.05rem;">
        ⚽ But pour <strong>${escapeHtml(scorerTeamName)}</strong> marqué par : 
        <span style="color: var(--gold); font-weight: bold;">${escapeHtml(goalState.scorerUsername)}</span>
      </div>
      
      <div style="color: white; font-size: 1.05rem;">
        👟 Passe décisive : 
        <span style="color: var(--gold); font-weight: bold;">${goalState.assistUsername ? escapeHtml(goalState.assistUsername) : 'Aucune'}</span>
      </div>

      <div style="margin-top: 10px;">
        <label class="modal-label" style="display: block; margin-bottom: 6px;">Minute du but :</label>
        <input id="goal-minute" type="number" min="1" max="120" class="form-input" style="width:100%; box-sizing:border-box;" value="${goalState.minute}" required />
      </div>

      <div id="goal-error" class="auth-message error hidden" style="margin-top:0;"></div>
    </div>

    <div class="modal-actions" style="margin-top: 20px; display: flex; gap: 10px;">
      <button class="btn btn-success" style="flex: 1;" onclick="confirmGoal()">Confirmer le but</button>
      <button class="btn btn-outline" onclick="renderGoalStep2()">Retour</button>
    </div>
  `;
}

window.closeGoalModal = function() {
  document.getElementById('goal-modal').classList.add('hidden');
};

window.confirmGoal = async function() {
  const errorDiv = document.getElementById('goal-error');
  const minute = document.getElementById('goal-minute').value || goalState.minute;

  errorDiv.classList.add('hidden');
  errorDiv.textContent = '';

  try {
    const res = await fetch(`${API}/matchs/${goalState.matchId}/goal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team_id: goalState.scorerTeamId,
        scorer_id: goalState.scorerId,
        assist_id: goalState.assistId,
        minute: parseInt(minute)
      }),
      credentials: 'include'
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Erreur lors de l'enregistrement du but.");
    }

    closeGoalModal();
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.classList.remove('hidden');
  }
};

// Modale de création de Lobby
window.openCreateLobbyModal = function () {
  const modal = document.getElementById('lobby-modal');
  const nameInput = document.getElementById('lobby-name');
  const errorDiv = document.getElementById('lobby-error');

  errorDiv.classList.add('hidden');
  errorDiv.textContent = '';
  
  if(nameInput) nameInput.value = '';

  modal.classList.remove('hidden');
};

document.getElementById('lobby-cancel').addEventListener('click', () => {
  document.getElementById('lobby-modal').classList.add('hidden');
});

document.getElementById('lobby-confirm').addEventListener('click', async () => {
  const name = document.getElementById('lobby-name').value || "Match Amical";
  const duration = document.getElementById('lobby-duration').value || 90;
  let maxPlayers = document.getElementById('lobby-max-players').value;
  if (maxPlayers === 'custom') {
    maxPlayers = document.getElementById('lobby-custom-players').value || 11;
  }
  const durationLabel = duration === 'unlimited' ? 'Sans limite de temps' : `${duration} min`;
  const rules = `Format : ${maxPlayers} vs ${maxPlayers} (${durationLabel})`;
  
  const errorDiv = document.getElementById('lobby-error');

  errorDiv.classList.add('hidden');
  errorDiv.textContent = '';

  // Mock temporaire pour le backend qui attend toujours des home_team_id
  const homeTeamId = 1;
  const awayTeamId = 2;

  try {
    const res = await fetch(`${API}/matchs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, rules: rules, home_team_id: homeTeamId, away_team_id: awayTeamId }),
      credentials: 'include'
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Erreur lors de la création du match.");
    }

    document.getElementById('lobby-modal').classList.add('hidden');
    await renderHome();
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.classList.remove('hidden');
  }
});


async function renderRanking() {
  app.innerHTML = `
    <div class="football-container">
      <div class="football-ball">⚽</div>
      <div class="football-shadow"></div>
      <p class="loader-text">Chargement du classement...</p>
    </div>`;

  try {
    const leaderboard = await apiFetch('/leaderboard');
    const players = Array.isArray(leaderboard) ? leaderboard : [];

    const rowsHtml = players.map((p, index) => {
      const rank = index + 1;
      let rankDisplay = rank;

      // Médailles graphiques pour le top 3
      if (rank === 1) {
        rankDisplay = `<span class="rank-badge rank-1">🥇</span>`;
      } else if (rank === 2) {
        rankDisplay = `<span class="rank-badge rank-2">🥈</span>`;
      } else if (rank === 3) {
        rankDisplay = `<span class="rank-badge rank-3">🥉</span>`;
      } else {
        rankDisplay = `<span class="rank-badge">${rank}</span>`;
      }

      return `
        <tr>
          <td style="width: 80px; text-align: center;">${rankDisplay}</td>
          <td>
            <a href="#/profile/${p.id}" class="ranking-username">${escapeHtml(p.username)}</a>
          </td>
          <td class="ranking-ovr">${p.overall}</td>
          <td class="ranking-stat">${p.matches_played}</td>
          <td class="ranking-stat" style="color: #27ae60;">${p.wins}</td>
          <td class="ranking-stat">${p.goals}</td>
          <td class="ranking-stat">${p.assists}</td>
        </tr>
      `;
    }).join('');

    app.innerHTML = `
      <div class="page fade-in">
        <div class="page-header">
          <h1>Classement</h1>
          <p class="text-muted">Les meilleurs joueurs de la saison d'après leur Note Globale (OVR).</p>
        </div>

        <div class="ranking-container">
          <table class="ranking-table">
            <thead>
              <tr>
                <th style="text-align: center;">Pos</th>
                <th>Joueur</th>
                <th>OVR</th>
                <th>Matchs</th>
                <th>Victoires</th>
                <th>Buts</th>
                <th>Passes D.</th>
              </tr>
            </thead>
            <tbody>
              ${players.length === 0 ? `
                <tr>
                  <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">
                    Aucun joueur classé pour le moment.
                  </td>
                </tr>
              ` : rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Erreur chargement classement :", error);
    app.innerHTML = `
      <div class="page">
        <div class="page-header">
          <h1>Classement</h1>
          <p class="text-muted">Les meilleurs joueurs de la saison.</p>
        </div>
        <p class="text-muted" style="color: #e74c3c;">
          Impossible de charger le classement pour le moment.
        </p>
      </div>`;
  }
}

function renderFutCard(stats, username) {
  const ovr = stats?.overall ?? 50;
  const tier = ovr >= 80 ? "gold" : ovr >= 60 ? "silver" : "bronze";

  return `
    <div class="fut-card-wrapper">
      <div class="fut-card ${tier}">
        <div class="fut-card-ovr">${ovr}</div>
        <div class="fut-card-name">${username}</div>
        <div class="fut-card-divider"></div>
        <div class="fut-card-stats">
          <div class="fut-stat"><span>TIR</span><span class="fut-stat-val">${stats?.rating_shot ?? 50}</span></div>
          <div class="fut-stat"><span>PAS</span><span class="fut-stat-val">${stats?.rating_pass ?? 50}</span></div>
          <div class="fut-stat"><span>VIC</span><span class="fut-stat-val">${stats?.rating_victory ?? 50}</span></div>
          <div class="fut-stat"><span>FOR</span><span class="fut-stat-val">${stats?.rating_form ?? 50}</span></div>
          <div class="fut-stat"><span>DEF</span><span class="fut-stat-val">${stats?.rating_defense ?? 50}</span></div>
        </div>
      </div>
    </div>`;
}

async function renderProfile(userId) {
  const currentUsername = localStorage.getItem('username');
  if (!currentUsername) {
    navigate('/login');
    return;
  }

  // Fallback à l'ID 1 si non connecté ou non trouvé localement
  let id = userId || localStorage.getItem('userId') || '1';

  app.innerHTML = `
    <div class="football-container">
      <div class="football-ball">⚽</div>
      <div class="football-shadow"></div>
      <p class="loader-text">Chargement du profil...</p>
    </div>`;

  try {
    const data = await apiFetch(`/profile/${id}`);
    const { user, recentMatches } = data;
    const stats = user.stats;
    const winRate = stats?.matches_played
      ? Math.round((stats.wins / stats.matches_played) * 100)
      : 0;

    function wl(label, value) {
      return `<div class="stat-box"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
    }

    app.innerHTML = `
      <div class="page fade-in">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
          <div>
            <h1 style="font-size:2rem; font-weight:900; margin:0;">Profil de ${user.username}</h1>
            <div style="margin-top:8px;">
              <span class="role-badge role-player" style="text-transform:uppercase;">${user.role}</span>
            </div>
          </div>
          <button class="btn btn-outline" onclick="window.location.hash='/home'">← Retour</button>
        </div>

        ${renderFutCard(stats, user.username)}

        <!-- Statistiques détaillées -->
        <h2 style="font-size:1.3rem; font-weight:700; margin: 32px 0 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">Statistiques Générales</h2>
        <div class="profile-grid">
          ${wl("Matchs joués", stats?.matches_played ?? 0)}
          ${wl("Victoires", stats?.wins ?? 0)}
          ${wl("Défaites", stats?.losses ?? 0)}
          ${wl("Nuls", stats?.draws ?? 0)}
          ${wl("Buts", stats?.goals ?? 0)}
          ${wl("Passes D.", stats?.assists ?? 0)}
          ${wl("MVP", stats?.motm_count ?? 0)}
          ${wl("Win Rate", `${winRate}%`)}
          ${wl("Série act.", stats?.current_streak ?? 0)}
          ${wl("Meilleure série", stats?.best_streak ?? 0)}
        </div>
      </div>`;
  } catch (error) {
    console.error("Impossible de charger le profil", error);
    app.innerHTML = `
      <div class="page">
        <p class="text-muted">Impossible de charger le profil.</p>
        <button class="btn btn-outline" onclick="window.location.hash='/home'">Retour</button>
      </div>`;
  }
}

function renderLogin() {
  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-header">
        <h2>⚽ LiveFootStats</h2>
        <p>Rejoignez la communauté de fans</p>
      </div>
      
      <div class="auth-tabs">
        <button id="tab-login" class="auth-tab active">Connexion</button>
        <button id="tab-register" class="auth-tab">S'inscrire</button>
      </div>
      
      <div id="auth-msg" class="auth-message"></div>
      
      <form id="auth-form" class="auth-form">
        <div class="form-group">
          <label for="auth-username">Nom d'utilisateur</label>
          <input type="text" id="auth-username" class="form-input" placeholder="Ex: footfan12" required />
        </div>
        
        <div class="form-group">
          <label for="auth-password">Mot de passe</label>
          <input type="password" id="auth-password" class="form-input" placeholder="••••••••" required />
        </div>
        
        <button type="submit" id="auth-submit-btn" class="btn btn-success" style="width: 100%; padding: 14px;">
          Se connecter
        </button>
      </form>
    </div>
  `;

  let currentTab = 'login';

  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const authForm = document.getElementById('auth-form');
  const authSubmitBtn = document.getElementById('auth-submit-btn');
  const authMsg = document.getElementById('auth-msg');

  tabLogin.addEventListener('click', () => {
    currentTab = 'login';
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    authSubmitBtn.textContent = 'Se connecter';
    authMsg.className = 'auth-message';
  });

  tabRegister.addEventListener('click', () => {
    currentTab = 'register';
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    authSubmitBtn.textContent = "S'inscrire";
    authMsg.className = 'auth-message';
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;

    authMsg.className = 'auth-message';
    authSubmitBtn.disabled = true;
    authSubmitBtn.innerHTML = '<span class="loader-spinner" style="width:20px; height:20px; border-width:2px; display:inline-block; vertical-align: middle;"></span>';

    try {
      if (currentTab === 'login') {
        const res = await fetch(`${API}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          credentials: 'include'
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Erreur lors de la connexion');
        }

        if (data.user) {
          localStorage.setItem('userId', data.user.id);
          localStorage.setItem('username', data.user.username);
          localStorage.setItem('role', data.user.role || 'Fan');
        } else {
          localStorage.setItem('username', username);
          localStorage.setItem('role', 'Fan');
        }

        authMsg.textContent = 'Connexion réussie ! Redirection...';
        authMsg.className = 'auth-message success';

        setTimeout(() => {
          navigate('/home');
        }, 1500);

      } else {
        const res = await fetch(`${API}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Erreur lors de l'inscription");
        }

        authMsg.textContent = 'Inscription réussie ! Vous pouvez maintenant vous connecter.';
        authMsg.className = 'auth-message success';

        setTimeout(() => {
          tabLogin.click();
          document.getElementById('auth-password').value = '';
        }, 2000);
      }
    } catch (err) {
      authMsg.textContent = err.message;
      authMsg.className = 'auth-message error';
    } finally {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = currentTab === 'login' ? 'Se connecter' : "S'inscrire";
    }
  });
}

window.addEventListener('hashchange', router);
router();
