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

// --- MOCK PLAYERS POUR LE LOBBY ---
let mockLobbyPlayers = [];

// --- MOCK TIMELINE POUR LE LIVE ---
let mockTimeline = [];

function navigate(path) {
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
    const homeTeam = teamsCache[match.home_team_id]?.name || "Équipe Domicile";
    const awayTeam = teamsCache[match.away_team_id]?.name || "Équipe Extérieur";

    const currentUserId = localStorage.getItem('userId');
    const isCreator = currentUserId && (parseInt(match.creator_id) === parseInt(currentUserId));

    if (match.status === 'waiting') {
      const currentUsername = localStorage.getItem('username');
      if (currentUsername && !mockLobbyPlayers.find(p => p.username === currentUsername)) {
        mockLobbyPlayers.push({ id: parseInt(currentUserId || 999), username: currentUsername, team: null });
      }
      
      app.innerHTML = getLobbyHTML(match, homeTeam, awayTeam, isCreator);
      joinLobby(match.id);
      initRealtimeConnection();
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
        
        <!-- TIMELINE PANNEAU DE RESUME -->
        ${getTimelineHTML(match)}

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
  } else if (data.type === "player_joined" || data.type === "team_assigned" || data.type === "match_started") {
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

  const renderPlayerCard = (p, showAssignButtons) => `
    <div class="player-card">
      <div class="player-info">
        <div class="player-avatar">${p.username.charAt(0).toUpperCase()}</div>
        <span style="color:white; font-weight:600;">${escapeHtml(p.username)}</span>
      </div>
      ${showAssignButtons && isCreator ? `
        <div class="assign-actions">
          <button class="btn-assign home" onclick="assignPlayer(${p.id}, ${match.home_team_id})">🏠 Domicile</button>
          <button class="btn-assign away" onclick="assignPlayer(${p.id}, ${match.away_team_id})">✈️ Extérieur</button>
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
          <h2>Salon d'attente</h2>
          <p class="text-muted">Les équipes se mettent en place...</p>
        </div>

        <div class="lobby-columns">
          <div class="team-column home-team">
            <h3 class="team-title">🏠 ${homeTeam}</h3>
            ${homePlayers.length === 0 ? '<p class="text-muted" style="text-align:center; font-size:0.9rem;">Vide</p>' : homePlayers.map(p => renderPlayerCard(p, false)).join('')}
          </div>

          <div class="team-column unassigned">
            <h3 class="team-title">⏳ En attente</h3>
            ${unassignedPlayers.length === 0 ? '<p class="text-muted" style="text-align:center; font-size:0.9rem;">Vide</p>' : unassignedPlayers.map(p => renderPlayerCard(p, true)).join('')}
          </div>

          <div class="team-column away-team">
            <h3 class="team-title">✈️ ${awayTeam}</h3>
            ${awayPlayers.length === 0 ? '<p class="text-muted" style="text-align:center; font-size:0.9rem;">Vide</p>' : awayPlayers.map(p => renderPlayerCard(p, false)).join('')}
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
  if (mockTimeline.length === 0) return '';
  
  const eventsHtml = mockTimeline.map(ev => {
    // Si ev.team = 1 ou home_team_id -> Domicile, sinon Extérieur
    const isHome = ev.team === match.home_team_id || ev.team === 1;
    const align = isHome ? 'left' : 'right';
    const teamColor = isHome ? 'var(--primary)' : 'var(--danger)';
    
    return `
      <div class="timeline-event" style="align-self: ${isHome ? 'flex-start' : 'flex-end'}; text-align: ${align}; border-${align}: 4px solid ${teamColor};">
        <div class="timeline-minute">${ev.minute}' <span class="timeline-icon">⚽</span></div>
        <div class="timeline-details">
          <strong>${escapeHtml(ev.player)}</strong>
          ${ev.assist ? `<div class="timeline-assist">(Passe : ${escapeHtml(ev.assist)})</div>` : ''}
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

async function joinLobby(matchId) {
  try {
    await apiFetch(`/matches/${matchId}/join`, { method: 'POST' });
  } catch(e) { console.log("L'API /join n'est pas encore prête !"); }
}

window.assignPlayer = async function(playerId, teamId) {
  const p = mockLobbyPlayers.find(pl => pl.id === playerId);
  if (p) p.team = teamId;
  renderMatchDetails(liveMatchId);

  try {
    await apiFetch(`/matches/${liveMatchId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ userId: playerId, teamId: teamId })
    });
  } catch(e) { console.log("L'API /assign n'est pas encore prête !"); }
};

window.startMatch = async function(matchId) {
  try {
    await apiFetch(`/matches/${matchId}/start`, { method: 'POST' });
  } catch(e) { 
    console.log("L'API /start n'est pas encore prête !"); 
  }
  // MOCK TEMPORAIRE POUR TESTER L'UI SI L'API PLANTE
  alert("Simulation: Le match est lancé !");
  window.location.hash = '/home';
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
  if (ws) {
    ws.close();
    ws = null;
  }
  liveMatchId = null;
}

// Logique de la modale
window.openGoalModal = async function (matchId, homeTeamId, awayTeamId) {
  const modal = document.getElementById('goal-modal');
  const teamSelect = document.getElementById('goal-team');
  const scorerSelect = document.getElementById('goal-scorer');
  const assistSelect = document.getElementById('goal-assist');
  const minuteInput = document.getElementById('goal-minute');
  const errorDiv = document.getElementById('goal-error');

  errorDiv.classList.add('hidden');
  errorDiv.textContent = '';

  // 1. Équipe qui a marqué
  const homeTeamName = teamsCache[homeTeamId]?.name || "Équipe Domicile";
  const awayTeamName = teamsCache[awayTeamId]?.name || "Équipe Extérieur";
  teamSelect.innerHTML = `
    <option value="${homeTeamId}">${homeTeamName}</option>
    <option value="${awayTeamId}">${awayTeamName}</option>
  `;

  // 2. Minute du but (basé sur matchTimer actuel)
  const currentMinute = Math.max(1, Math.floor(matchTimer / 60) + 1);
  minuteInput.value = currentMinute;

  // 3. Remplir les sélecteurs de buteur/passeur depuis le leaderboard (tous les utilisateurs)
  try {
    const users = await apiFetch('/leaderboard');
    let optionsHtml = `<option value="">-- Inconnu / Autre (Optionnel) --</option>`;
    users.forEach(u => {
      optionsHtml += `<option value="${u.id}">${u.username}</option>`;
    });
    scorerSelect.innerHTML = optionsHtml;
    assistSelect.innerHTML = optionsHtml;
  } catch (err) {
    console.error("Erreur chargement joueurs modale but:", err);
    scorerSelect.innerHTML = `<option value="">-- Erreur de chargement --</option>`;
    assistSelect.innerHTML = `<option value="">-- Erreur de chargement --</option>`;
  }

  // Stocker l'ID du match pour confirmation
  modal.dataset.matchId = matchId;

  modal.classList.remove('hidden');
};

document.getElementById('goal-cancel').addEventListener('click', () => {
  document.getElementById('goal-modal').classList.add('hidden');
});

document.getElementById('goal-confirm').addEventListener('click', async () => {
  const modal = document.getElementById('goal-modal');
  const matchId = modal.dataset.matchId;
  const teamId = document.getElementById('goal-team').value;
  const scorerId = document.getElementById('goal-scorer').value;
  const assistId = document.getElementById('goal-assist').value;
  const minute = document.getElementById('goal-minute').value;
  const errorDiv = document.getElementById('goal-error');

  errorDiv.classList.add('hidden');
  errorDiv.textContent = '';

  if (!teamId) {
    errorDiv.textContent = "L'équipe est requise.";
    errorDiv.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch(`${API}/matchs/${matchId}/goal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team_id: teamId,
        scorer_id: scorerId ? parseInt(scorerId) : null,
        assist_id: assistId ? parseInt(assistId) : null,
        minute: minute ? parseInt(minute) : 1
      }),
      credentials: 'include'
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Erreur lors de l'enregistrement du but.");
    }

    modal.classList.add('hidden');
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.classList.remove('hidden');
  }
});

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
  const rules = "Classique";
  const duration = document.getElementById('lobby-duration').value || 90;
  let maxPlayers = document.getElementById('lobby-max-players').value;
  if (maxPlayers === 'custom') {
    maxPlayers = document.getElementById('lobby-custom-players').value || 11;
  }
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
