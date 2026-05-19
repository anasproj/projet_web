const API = 'https://localhost:3000';
const WS_URL = 'wss://localhost:3000/ws';

const app = document.getElementById('app');
const navLogout = document.getElementById('nav-logout');

let teamsCache = {};
let ws = null;
let liveMatchId = null;
let chronoInterval = null;
let matchTimer = 0;

function navigate(path) {
  window.location.hash = path;
}

function updateNavLinks(path) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${path}`);
  });
}

async function router() {
  // Nettoyer les minuteurs et connexions websockets actifs avant de changer de route
  cleanupLiveSession();
  
  const hash = window.location.hash.replace('#', '') || '/home';
  updateNavLinks(hash.startsWith('/match/') ? '/home' : hash);
  
  if (hash.startsWith('/match/')) {
    const matchId = hash.split('/')[2];
    await renderMatchDetails(matchId);
  } else if (hash === '/ranking') {
    await renderRanking();
  } else if (hash === '/profile') {
    await renderProfile();
  } else {
    await renderHome();
  }
}

async function apiFetch(endpoint) {
  const res = await fetch(`${API}${endpoint}`, { credentials: 'include' });
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
  app.innerHTML = `<div class="page-loader"><div class="loader-spinner"></div></div>`;
  try {
    await loadTeams();
    const data = await apiFetch('/matchs');
    const matchs = Array.isArray(data) ? data : [];
    
    if (matchs.length === 0) {
      app.innerHTML = `<div class="page"><div class="page-header"><h1>Lobbys</h1><p class="text-muted">Aucun match disponible pour le moment.</p></div></div>`;
      return;
    }
    
    const cards = matchs.map(m => {
      const homeTeam = teamsCache[m.home_team_id]?.name || "Équipe Domicile";
      const awayTeam = teamsCache[m.away_team_id]?.name || "Équipe Extérieur";
      return `
      <div class="card" style="cursor:pointer;" onclick="window.location.hash='/match/${m.id}'">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
          <h3 class="card-title">${homeTeam} <span style="font-weight:400; font-size:0.9rem; color:var(--text-muted)">vs</span> ${awayTeam}</h3>
          <span class="lobby-badge badge-${m.status === 'live' ? 'live' : m.status === 'finished' ? 'finished' : 'waiting'}">${m.status.toUpperCase()}</span>
        </div>
        <p class="text-muted" style="font-size:0.85rem; font-weight:700; color:white;">Score : <span style="color:var(--gold)">${m.home_score} - ${m.away_score}</span></p>
      </div>
    `}).join('');
    
    app.innerHTML = `
      <div class="page">
        <div class="page-header">
          <h1>Lobbys</h1>
          <p class="text-muted">Rejoignez un match en cours ou attendez le prochain.</p>
        </div>
        <div class="lobbies-grid">${cards}</div>
      </div>`;
  } catch {
    app.innerHTML = `<div class="page"><p class="text-muted">Impossible de charger les matchs. Vérifiez que le backend est démarré.</p></div>`;
  }
}

async function renderMatchDetails(id) {
  app.innerHTML = `<div class="page-loader"><div class="loader-spinner"></div></div>`;
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
    const homeTeam = teamsCache[match.home_team_id]?.name || "Équipe Domicile";
    const awayTeam = teamsCache[match.away_team_id]?.name || "Équipe Extérieur";
    
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
          <span class="lobby-badge badge-${match.status === 'live' ? 'live' : match.status === 'finished' ? 'finished' : 'waiting'}" style="margin-bottom:12px; display:inline-block;">${match.status.toUpperCase()}</span>
          
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
          <div style="margin-top: 30px;">
             <button class="btn btn-success" onclick="openGoalModal(${match.id}, ${match.home_team_id}, ${match.away_team_id})">⚽ Enregistrer un but</button>
          </div>
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
              <span class="time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
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

    // Initialiser la connexion WebSocket
    initRealtimeConnection();

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

// Connexion WebSocket
function initRealtimeConnection() {
  const dot = document.getElementById('live-status-dot');
  const txt = document.getElementById('live-status-text');

  if (!dot || !txt) return;

  console.log("Tentative de connexion WebSocket à :", WS_URL);
  
  try {
    ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
      dot.className = "status-dot connected";
      dot.style.background = "#27ae60";
      dot.style.boxShadow = "0 0 8px #27ae60";
      txt.textContent = "En direct";
      txt.style.color = "#27ae60";
      document.getElementById('chat-users-count').textContent = "Connecté au live";
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleIncomingRealtimeEvent(data);
      } catch (err) {
        console.error("Erreur de parsing WebSocket message:", err);
      }
    };

    ws.onerror = () => {
      handleOfflineState();
    };

    ws.onclose = () => {
      handleOfflineState();
    };

  } catch (e) {
    handleOfflineState();
  }
}

function handleOfflineState() {
  const dot = document.getElementById('live-status-dot');
  const txt = document.getElementById('live-status-text');
  const usersCount = document.getElementById('chat-users-count');

  if (dot && txt) {
    dot.className = "status-dot";
    dot.style.background = "#e74c3c";
    dot.style.boxShadow = "none";
    txt.textContent = "Hors-ligne";
    txt.style.color = "var(--text-muted)";
  }
  if (usersCount) {
    usersCount.textContent = "Déconnecté";
  }
}

function handleIncomingRealtimeEvent(data) {
  if (data.type === "score_update") {
    const scoreEl = document.getElementById('live-score');
    if (scoreEl) {
      scoreEl.textContent = `${data.home_score} - ${data.away_score}`;
    }
  } else if (data.type === "new_message") {
    appendChatMessage(data.username, data.text, false, data.time);
  }
}

function appendChatMessage(username, text, isOutgoing = false, time = null) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const timeStr = time || new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
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
  if (ws) {
    ws.close();
    ws = null;
  }
  liveMatchId = null;
}

// Logique de la modale
window.openGoalModal = function(matchId, homeTeamId, awayTeamId) {
  const modal = document.getElementById('goal-modal');
  document.getElementById('goal-scorer-name').textContent = "Sélection du buteur en cours...";
  modal.classList.remove('hidden');
};

document.getElementById('goal-cancel').addEventListener('click', () => {
  document.getElementById('goal-modal').classList.add('hidden');
});

document.getElementById('goal-confirm').addEventListener('click', () => {
  alert("Fonctionnalité d'enregistrement à lier avec l'API (Issue #6)");
  document.getElementById('goal-modal').classList.add('hidden');
});


async function renderRanking() {
  app.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Classement</h1>
        <p class="text-muted">Les meilleurs joueurs de la saison.</p>
      </div>
      <p class="text-muted">Disponible bientôt.</p>
    </div>`;
}

async function renderProfile() {
  app.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Mon Profil</h1>
        <p class="text-muted">Vos statistiques personnelles.</p>
      </div>
      <p class="text-muted">Disponible bientôt.</p>
    </div>`;
}

navLogout.addEventListener('click', () => navigate('/home'));
window.addEventListener('hashchange', router);
router();
