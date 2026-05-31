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

function statusLabel(status) {
  return {
    scheduled: 'EN ATTENTE',
    waiting: 'EN ATTENTE',
    live: 'EN DIRECT',
    paused: 'EN PAUSE',
    finished: 'TERMINÉ'
  }[status] || String(status || '').toUpperCase();
}

function statusBadgeClass(status) {
  if (status === 'live') return 'live';
  if (status === 'paused') return 'paused';
  if (status === 'finished') return 'finished';
  return 'waiting';
}

function formatChrono(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const mins = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
  const secs = (safeSeconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function getMatchElapsedSeconds(match) {
  if (!match) return 0;
  const savedElapsed = Number(match.elapsed_seconds || 0);
  const startedAtMs = Number(match.started_at_ms || 0);
  if (match.status === 'live' && startedAtMs > 0) {
    return savedElapsed + Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  }
  return savedElapsed;
}

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('toast-visible'), 20);
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function render404() {
  app.innerHTML = `
    <div class="page not-found-page">
      <div class="card" style="padding: 42px; text-align:center;">
        <div style="font-size:4rem; margin-bottom:12px;">🚧</div>
        <h1>Page introuvable</h1>
        <p class="text-muted" style="margin:12px 0 24px;">La page demandée n'existe pas ou a été déplacée.</p>
        <button class="btn btn-success" onclick="window.location.hash='/home'">Retour aux lobbys</button>
      </div>
    </div>`;
}

function parseMatchFields(match) {
  if (!match) return match;
  if (typeof match.players === 'string') {
    try { match.players = JSON.parse(match.players); } catch(e) { match.players = []; }
  }
  if (typeof match.goals === 'string') {
    try { match.goals = JSON.parse(match.goals); } catch(e) { match.goals = []; }
  }
  if (!match.players || !Array.isArray(match.players)) {
    match.players = [];
  }
  if (!match.goals || !Array.isArray(match.goals)) {
    match.goals = [];
  }
  return match;
}

let teamsCache = {};
let ws = null;
let liveMatchId = null;
let chronoInterval = null;
let matchTimer = 0;
let lobbyJoined = false; // Guard pour n'appeler /join qu'une seule fois par session
let currentMatchData = null;
let homeRealtimeEnabled = false;
let realtimePollInterval = null;
let realtimePollBusy = false;
let lastHomeSnapshot = '';
let lastMatchSnapshot = '';
const REALTIME_POLL_MS = 1200;

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

function clearLocalSession() {
  localStorage.removeItem('userId');
  localStorage.removeItem('username');
  localStorage.removeItem('role');
}

async function handleLogout() {
  try {
    await apiFetch('/logout', { method: 'POST', skipAuthRefresh: true });
  } catch (error) {
    console.warn('Déconnexion côté serveur impossible:', error);
  } finally {
    clearLocalSession();
    navigate('/login');
  }
}

function updateNavbar() {
  const username = localStorage.getItem('username');
  const navLinks = document.querySelector('.nav-links');
  const navToggle = document.getElementById('nav-toggle');
  if (!navLinks) return;

  if (username) {
    const isAdmin = localStorage.getItem('role') === 'admin';
    navLinks.innerHTML = `
      <a href="#/home" class="nav-link">Lobbys</a>
      <a href="#/ranking" class="nav-link">Classement</a>
      <a href="#/profile" class="nav-link">Mon Profil</a>
      ${isAdmin ? `<a href="#/admin" class="nav-link">Admin</a>` : ''}
      <button id="nav-logout" class="btn btn-outline btn-sm">Déconnexion</button>
    `;
    document.getElementById('nav-logout').addEventListener('click', handleLogout);
  } else {
    navLinks.innerHTML = `
      <a href="#/home" class="nav-link">Lobbys</a>
      <a href="#/login" class="nav-link">Connexion</a>
    `;
  }

  navLinks.classList.remove('nav-open');
  if (navToggle) {
    navToggle.onclick = () => navLinks.classList.toggle('nav-open');
  }
  navLinks.querySelectorAll('a, button').forEach(el => {
    el.addEventListener('click', () => navLinks.classList.remove('nav-open'));
  });
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
  } else if (hash === '/home' || hash === '/') {
    await renderHome();
    initHomeRealtimeConnection();
  } else if (/^\/match\/\d+\/summary$/.test(hash)) {
    const matchId = hash.split('/')[2];
    await renderMatchSummary(matchId);
  } else if (/^\/match\/\d+$/.test(hash)) {
    const matchId = hash.split('/')[2];
    await renderMatchDetails(matchId);
  } else if (hash === '/ranking') {
    await renderRanking();
  } else if (hash === '/admin') {
    await renderAdmin();
  } else if (/^\/profile\/\d+\/history$/.test(hash)) {
    const parts = hash.split('/');
    await renderProfileHistory(parts[2]);
  } else if (hash === '/profile' || /^\/profile\/\d+$/.test(hash)) {
    const parts = hash.split('/');
    const userId = parts[2];
    await renderProfile(userId);
  } else {
    render404();
  }
}

let refreshSessionPromise = null;

async function refreshSession() {
  if (!refreshSessionPromise) {
    refreshSessionPromise = fetch(`${API}/refresh`, {
      method: 'POST',
      credentials: 'include'
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || 'Session expirée');
        }
        if (data?.user) {
          localStorage.setItem('userId', data.user.id);
          localStorage.setItem('username', data.user.username);
          localStorage.setItem('role', data.user.role || 'fan');
        }
        return data;
      })
      .finally(() => {
        refreshSessionPromise = null;
      });
  }

  return refreshSessionPromise;
}

async function apiFetch(endpoint, options = {}) {
  const { skipAuthRefresh = false, ...fetchOptions } = options;
  let res = await fetch(`${API}${endpoint}`, { credentials: 'include', ...fetchOptions });
  let data = await res.json().catch(() => null);

  if (res.status === 401 && !skipAuthRefresh && endpoint !== '/refresh' && endpoint !== '/login') {
    try {
      await refreshSession();
      res = await fetch(`${API}${endpoint}`, { credentials: 'include', ...fetchOptions });
      data = await res.json().catch(() => null);
    } catch (refreshError) {
      clearLocalSession();
      if ((window.location.hash.replace('#', '') || '/home') !== '/login') {
        showToast('Session expirée, reconnectez-vous.', 'error');
        navigate('/login');
      }
      throw refreshError;
    }
  }

  if (!res.ok) {
    throw new Error(data?.error || `Erreur API : ${res.status}`);
  }
  return data;
}


function buildHomeSnapshot(matchs) {
  return JSON.stringify((matchs || []).map(m => ({
    id: m.id,
    status: m.status,
    home_score: m.home_score,
    away_score: m.away_score,
    players: (m.players || []).map(p => `${p.user_id}:${p.team_id || ''}`).sort(),
    goals: (m.goals || []).length
  })));
}

function getLobbyPlayers(match) {
  return (match?.players || []).map(p => ({
    id: Number(p.user_id ?? p.id),
    user_id: Number(p.user_id ?? p.id),
    username: p.username || 'Joueur',
    team: p.team_id ? Number(p.team_id) : null,
    team_id: p.team_id ? Number(p.team_id) : null
  }));
}

function syncLobbyPlayers(match) {
  mockLobbyPlayers = getLobbyPlayers(match);
  return mockLobbyPlayers;
}

function buildMatchSnapshot(match) {
  if (!match) return '';
  return JSON.stringify({
    id: match.id,
    status: match.status,
    home_score: match.home_score,
    away_score: match.away_score,
    elapsed_seconds: match.elapsed_seconds,
    started_at_ms: match.started_at_ms,
    players: getLobbyPlayers(match).map(p => `${p.user_id}:${p.username}:${p.team_id || ''}`).sort(),
    goals: (match.goals || []).map(g => `${g.id || ''}:${g.team_id}:${g.scorer_id || ''}:${g.assist_id || ''}:${g.minute}`).sort()
  });
}

function stopRealtimePolling() {
  if (realtimePollInterval) {
    clearInterval(realtimePollInterval);
    realtimePollInterval = null;
  }
  realtimePollBusy = false;
}

function startRealtimePolling(scope, matchId = null) {
  stopRealtimePolling();
  if (!localStorage.getItem('username')) return;

  realtimePollInterval = setInterval(async () => {
    if (realtimePollBusy) return;
    realtimePollBusy = true;
    try {
      const hash = window.location.hash.replace('#', '') || '/home';
      const data = await apiFetch('/matchs');
      const matchs = Array.isArray(data) ? data.map(parseMatchFields) : [];

      if (scope === 'home' && hash === '/home') {
        const snapshot = buildHomeSnapshot(matchs);
        if (lastHomeSnapshot && snapshot !== lastHomeSnapshot) {
          lastHomeSnapshot = snapshot;
          await renderHome();
          initHomeRealtimeConnection();
        } else {
          lastHomeSnapshot = snapshot;
        }
        return;
      }

      if (scope === 'match' && /^\/match\/\d+$/.test(hash)) {
        const currentMatchId = matchId || hash.split('/')[2];
        const match = matchs.find(m => String(m.id) === String(currentMatchId));
        if (!match) {
          showToast('Ce lobby n’existe plus.', 'info');
          window.location.hash = '/home';
          return;
        }

        const snapshot = buildMatchSnapshot(match);
        if (lastMatchSnapshot && snapshot !== lastMatchSnapshot) {
          lastMatchSnapshot = snapshot;
          if (match.status === 'scheduled' || match.status === 'waiting') {
            await refreshLobbyUI(currentMatchId);
          } else if (match.status === 'finished') {
            window.location.hash = `/match/${currentMatchId}/summary`;
          } else {
            await renderMatchDetails(currentMatchId);
          }
        } else {
          lastMatchSnapshot = snapshot;
        }
      }
    } catch (error) {
      console.warn('Polling temps réel indisponible:', error.message);
    } finally {
      realtimePollBusy = false;
    }
  }, REALTIME_POLL_MS);
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
    const matchs = Array.isArray(data) ? data.map(parseMatchFields) : [];
    const username = localStorage.getItem('username');

    const cards = matchs.map(m => {
      const homeTeam = teamsCache[m.home_team_id]?.name || "Équipe Domicile";
      const awayTeam = teamsCache[m.away_team_id]?.name || "Équipe Extérieur";
      const canDelete = localStorage.getItem('role') === 'admin' || (localStorage.getItem('userId') && m.creator_id == localStorage.getItem('userId'));
      return `
      <div class="card" data-open-match-id="${m.id}" style="cursor:pointer; padding: 24px; display: flex; flex-direction: column; gap: 12px; position:relative;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap: 10px;">
            <span class="lobby-badge badge-${statusBadgeClass(m.status)}" style="font-size: 0.75rem; font-weight: 900; letter-spacing: 0.05em;">${statusLabel(m.status)}</span>
            ${canDelete ? `<button type="button" onclick="return window.confirmDeleteLobby(event, ${m.id})" data-delete-match-id="${m.id}" style="background:transparent; border:none; color:var(--danger); font-size:1.2rem; cursor:pointer; padding:8px; line-height:1; position:relative; z-index:20;" title="Supprimer le lobby" aria-label="Supprimer le lobby ${m.id}">❌</button>` : ''}
          </div>
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

    // Les clics sont gérés par le listener global en bas du fichier

    if (username) {
      const btn = document.getElementById('btn-create-lobby');
      if (btn) {
        btn.addEventListener('click', openCreateLobbyModal);
      }
    }
    lastHomeSnapshot = buildHomeSnapshot(matchs);
    startRealtimePolling('home');
  } catch (err) {
    console.error(err);
    showToast('Impossible de charger les lobbys.', 'error');
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
    const matchs = Array.isArray(data) ? data.map(parseMatchFields) : [];
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
      syncLobbyPlayers(match);
      
      app.innerHTML = getLobbyHTML(match, homeTeam, awayTeam, isCreator);
      if (!lobbyJoined) {
        lobbyJoined = true;
        joinLobby(match.id);
      }
      // Guard anti-boucle : ne pas recréer un WS déjà ouvert
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
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
      lastMatchSnapshot = buildMatchSnapshot(match);
      startRealtimePolling('match', match.id);
      return;
    }

    const canControl = localStorage.getItem('role') === 'admin' || isCreator;
    const currentUserInMatch = match.players?.find(p => String(p.user_id) === String(currentUserId));
    const isCurrentUserAssigned = Boolean(currentUserInMatch?.team_id);
    const isLive = match.status === 'live';
    const isPaused = match.status === 'paused';
    const isFinished = match.status === 'finished';
    const controlButtons = canControl && !isFinished ? `
      <div class="match-control-actions">
        ${isLive ? `<button class="btn btn-outline" onclick="pauseMatch(${match.id})">⏸️ Pause</button>` : ''}
        ${isPaused ? `<button class="btn btn-success" onclick="resumeMatch(${match.id})">▶️ Reprendre</button>` : ''}
        ${isLive ? `<button class="btn btn-success" onclick="openGoalModal(${match.id}, ${match.home_team_id}, ${match.away_team_id})">⚽ Enregistrer un but</button>` : `<button class="btn btn-outline" disabled title="Le match doit être en direct">⚽ Enregistrer un but</button>`}
        <button class="btn btn-danger" onclick="finishMatch(${match.id})">🏁 Terminer</button>
      </div>` : '';

    app.innerHTML = `
      <div class="page">
        <div class="match-topbar">
          <div>
            <button class="btn btn-outline" onclick="window.location.hash='/home'">⬅ Lobbys</button>
            ${canControl ? `<button type="button" class="btn btn-danger" onclick="return window.confirmDeleteLobby(event, ${match.id})" data-delete-match-id="${match.id}" style="margin-left: 10px;">🗑️ Supprimer le lobby</button>` : ''}
          </div>
          
          <div class="status-indicator">
            <span id="live-status-dot" class="status-dot"></span>
            <span id="live-status-text" class="text-muted">Connexion...</span>
          </div>
        </div>
        
        <div class="card live-hero">
          ${isCreator ? `
            <span class="creator-badge">
              🏆 Créateur
            </span>
          ` : ''}
          <span id="match-status-badge" class="lobby-badge badge-${statusBadgeClass(match.status)}" style="margin-bottom:12px; display:inline-block;">${statusLabel(match.status)}</span>
          
          <h2 style="font-size: 2.2rem; font-weight: 900; background: linear-gradient(45deg, #ffffff, #c7c7c7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 5px;">${escapeHtml(match.name)}</h2>
          <p class="text-muted" style="margin-bottom: 20px; font-weight: 600; font-size: 1.1rem; color: var(--gold) !important;">🏆 ${escapeHtml(match.rules)}</p>

          <div>
            <div id="live-match-chrono" class="match-chrono">⏱️ ${formatChrono(getMatchElapsedSeconds(match))}</div>
          </div>

          <div class="live-score-row">
            <div class="live-team-name live-team-home">
              <h2>${homeTeam}</h2>
            </div>
            <div id="live-score" class="live-score-value">
              ${match.home_score} - ${match.away_score}
            </div>
            <div class="live-team-name live-team-away">
              <h2>${awayTeam}</h2>
            </div>
          </div>
          ${controlButtons}
          ${!canControl && isLive && isCurrentUserAssigned ? `<div style="margin-top:24px;"><button class="btn btn-success" onclick="openGoalModal(${match.id}, ${match.home_team_id}, ${match.away_team_id})">⚽ Signaler un but</button></div>` : ''}
          ${isFinished ? `<div style="margin-top:24px;"><button class="btn btn-success" onclick="window.location.hash='/match/${match.id}/summary'">📊 Voir le résumé du match</button></div>` : ''}
        </div>

        <!-- TIMELINE PANNEAU DE RESUME -->
        <div id="live-timeline-container" style="margin-top: 25px;">
          ${getTimelineHTML(match)}
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

    matchTimer = getMatchElapsedSeconds(match);
    startChrono(match);

    // Initialiser la connexion WebSocket (seulement si pas déjà ouverte)
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      initRealtimeConnection();
    }

    lastMatchSnapshot = buildMatchSnapshot(match);
    startRealtimePolling('match', match.id);

  } catch (e) {
    app.innerHTML = `<div class="page"><p>Erreur lors du chargement des détails du match.</p></div>`;
  }
}

// Logique du chronomètre
function startChrono(match = currentMatchData) {
  const chronoEl = document.getElementById('live-match-chrono');
  if (!chronoEl) return;

  clearInterval(chronoInterval);
  matchTimer = getMatchElapsedSeconds(match);
  chronoEl.textContent = `⏱️ ${formatChrono(matchTimer)}`;

  if (match?.status !== 'live') return;

  chronoInterval = setInterval(() => {
    matchTimer = getMatchElapsedSeconds(currentMatchData || match);
    chronoEl.textContent = `⏱️ ${formatChrono(matchTimer)}`;
  }, 1000);
}

function initHomeRealtimeConnection() {
  const username = localStorage.getItem('username');
  if (!username) return;

  homeRealtimeEnabled = true;
  liveMatchId = null;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  initRealtimeConnection();
}

// Connexion WebSocket — fonctionne sur l'accueil, dans le lobby ET dans la vue live
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
    ws.onclose = () => {
      setStatus(false);
      ws = null;
    };

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
    const matchs = Array.isArray(data) ? data.map(parseMatchFields) : [];
    const match = matchs.find(m => m.id == matchId);
    if (!match) return;

    currentMatchData = match;

    const scoreEl = document.getElementById('live-score');
    if (scoreEl) {
      scoreEl.innerHTML = `${match.home_score} - ${match.away_score}`;
    }

    const badgeEl = document.getElementById('match-status-badge');
    if (badgeEl) {
      badgeEl.className = `lobby-badge badge-${statusBadgeClass(match.status)}`;
      badgeEl.textContent = statusLabel(match.status);
    }

    startChrono(match);

    const timelineContainer = document.getElementById('live-timeline-container');
    if (timelineContainer) {
      timelineContainer.innerHTML = getTimelineHTML(match);
    }
  } catch (err) {
    console.error("Erreur refreshLiveMatchUI:", err);
  }
}

function handleIncomingRealtimeEvent(data) {
  const currentHash = window.location.hash.replace('#', '') || '/home';
  const isHome = currentHash === '/home';
  const isCurrentMatch = !data.matchId || (liveMatchId && data.matchId == liveMatchId);

  if (data.type === "score_update") {
    refreshLiveMatchUI(liveMatchId);
  } else if (data.type === "new_message") {
    if (isCurrentMatch) appendChatMessage(data.username, data.text, false, data.time);
  } else if (["match_created", "match_deleted", "lobby_updated", "player_joined", "team_assigned", "match_started", "match_paused", "match_resumed", "match_finished"].includes(data.type)) {
    if (isHome) {
      lastHomeSnapshot = '';
      renderHome();
      return;
    }

    if ((data.type === "player_joined" || data.type === "team_assigned") && isCurrentMatch) {
      refreshLobbyUI(liveMatchId);
    } else if (["match_started", "match_paused", "match_resumed"].includes(data.type) && isCurrentMatch) {
      renderMatchDetails(liveMatchId);
    } else if (data.type === "match_finished" && isCurrentMatch) {
      showToast('Match terminé : résumé disponible.', 'success');
      window.location.hash = `/match/${data.matchId}/summary`;
    } else if (data.type === "match_deleted" && isCurrentMatch) {
      showToast('Lobby supprimé.', 'info');
      window.location.hash = '/home';
    }
  }
}

// ==========================================
// FONCTIONS DU SALON D'ATTENTE (LOBBY)
// ==========================================

function getLobbyHTML(match, homeTeam, awayTeam, isCreator) {
  const lobbyPlayers = getLobbyPlayers(match);
  const homePlayers = lobbyPlayers.filter(p => p.team === Number(match.home_team_id));
  const awayPlayers = lobbyPlayers.filter(p => p.team === Number(match.away_team_id));
  const unassignedPlayers = lobbyPlayers.filter(p => !p.team);

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
        <div>
          <button class="btn btn-outline" onclick="window.location.hash='/home'">⬅ Lobbys</button>
          ${localStorage.getItem('role') === 'admin' || isCreator ? `<button type="button" class="btn" onclick="return window.confirmDeleteLobby(event, ${match.id})" data-delete-match-id="${match.id}" style="background: var(--danger); color: white; margin-left: 10px;">🗑️ Supprimer le lobby</button>` : ''}
        </div>
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
    const matchs = Array.isArray(data) ? data.map(parseMatchFields) : [];
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

    syncLobbyPlayers(match);

    app.innerHTML = getLobbyHTML(match, homeTeam, awayTeam, isCreator);
    lastMatchSnapshot = buildMatchSnapshot(match);
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
    lastMatchSnapshot = '';
    await refreshLobbyUI(matchId);
    broadcastLocalLobbyChange('player_joined', matchId);
  } catch(e) { console.log("L'API /join n'est pas encore prête !"); }
}

window.assignPlayer = async function(playerId, teamId) {
  try {
    await apiFetch(`/matches/${liveMatchId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: playerId, teamId: teamId })
    });
    lastMatchSnapshot = '';
    await refreshLobbyUI(liveMatchId);
    broadcastLocalLobbyChange('team_assigned', liveMatchId);
  } catch(e) { console.log("Erreur API /assign:", e); }
};

window.startMatch = async function(matchId) {
  try {
    await apiFetch(`/matches/${matchId}/start`, { method: 'POST' });
    showToast('Le match a commencé.', 'success');
    broadcastLocalLobbyChange('match_started', matchId);
    await renderMatchDetails(matchId);
  } catch(e) { 
    console.error("Erreur lancement match:", e);
    showToast("Impossible de lancer le match : " + e.message, 'error');
  }
};

window.pauseMatch = async function(matchId) {
  try {
    await apiFetch(`/matches/${matchId}/pause`, { method: 'POST' });
    showToast('Match mis en pause.', 'info');
    await renderMatchDetails(matchId);
  } catch (e) {
    console.error('Erreur pause match:', e);
    showToast('Impossible de mettre en pause : ' + e.message, 'error');
  }
};

window.resumeMatch = async function(matchId) {
  try {
    await apiFetch(`/matches/${matchId}/resume`, { method: 'POST' });
    showToast('Match repris.', 'success');
    await renderMatchDetails(matchId);
  } catch (e) {
    console.error('Erreur reprise match:', e);
    showToast('Impossible de reprendre : ' + e.message, 'error');
  }
};

window.finishMatch = async function(matchId) {
  try {
    await apiFetch(`/matches/${matchId}/finish`, { method: 'POST' });
    showToast('Match enregistré. Résumé généré.', 'success');
    window.location.hash = `/match/${matchId}/summary`;
  } catch (e) {
    console.error('Erreur fin match:', e);
    showToast('Impossible de terminer le match : ' + e.message, 'error');
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
  stopRealtimePolling();

  const nextHash = window.location.hash.replace('#', '') || '/home';
  const shouldKeepHomeRealtime = nextHash === '/home' && localStorage.getItem('username');

  if (shouldKeepHomeRealtime) {
    liveMatchId = null;
    lobbyJoined = false;
    homeRealtimeEnabled = true;
    return;
  }

  homeRealtimeEnabled = false;
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
  const automaticMinute = Math.max(1, Math.floor(getMatchElapsedSeconds(currentMatchData) / 60) + 1);
  goalState = {
    matchId,
    homeTeamId,
    awayTeamId,
    scorerId: null,
    scorerUsername: '',
    scorerTeamId: null,
    assistId: null,
    assistUsername: '',
    minute: automaticMinute
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

      <div style="margin-top: 10px; color: var(--text-muted); font-weight: 700;">
        ⏱️ Minute automatique : <span style="color: var(--gold);">${goalState.minute}'</span>
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
  const minute = goalState.minute;

  errorDiv.classList.add('hidden');
  errorDiv.textContent = '';

  try {
    await apiFetch(`/matchs/${goalState.matchId}/goal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team_id: goalState.scorerTeamId,
        scorer_id: goalState.scorerId,
        assist_id: goalState.assistId,
        minute: parseInt(minute)
      })
    });

    const scorerTeamName = teamsCache[goalState.scorerTeamId]?.name || (goalState.scorerTeamId == goalState.homeTeamId ? "l'équipe Domicile" : "l'équipe Extérieur");
    const assistText = goalState.assistUsername ? ` (passe décisive de ${goalState.assistUsername})` : '';
    appendChatMessage('Système', `⚽ BUUUUT pour ${scorerTeamName} ! Buteur : ${goalState.scorerUsername}${assistText} (${minute}')`, false);
    closeGoalModal();
    showToast('But enregistré.', 'success');
    await refreshLiveMatchUI(goalState.matchId);
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
    showToast('Lobby créé avec succès.', 'success');
    broadcastLocalLobbyChange('match_created', data.id);
    await renderHome();
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.classList.remove('hidden');
  }
});



function statDelta(before, after, key) {
  return Number(after?.[key] ?? 0) - Number(before?.[key] ?? 0);
}

function renderStatDelta(label, before, after, key) {
  const delta = statDelta(before, after, key);
  const sign = delta > 0 ? '+' : '';
  const className = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
  return `
    <div class="summary-stat-row">
      <span>${label}</span>
      <strong>${before?.[key] ?? '-'} → ${after?.[key] ?? '-'}</strong>
      <em class="delta-${className}">${sign}${delta}</em>
    </div>`;
}

async function renderMatchSummary(matchId) {
  app.innerHTML = `
    <div class="football-container">
      <div class="football-ball">⚽</div>
      <div class="football-shadow"></div>
      <p class="loader-text">Chargement du résumé...</p>
    </div>`;

  try {
    await loadTeams();
    const summary = await apiFetch(`/matches/${matchId}/summary`);
    const match = summary.match || {};
    const homeTeam = teamsCache[match.home_team_id]?.name || "Équipe Domicile";
    const awayTeam = teamsCache[match.away_team_id]?.name || "Équipe Extérieur";
    const winnerLabel = summary.winner_team_id
      ? (summary.winner_team_id == match.home_team_id ? homeTeam : awayTeam)
      : 'Match nul';

    const goalsHtml = (summary.goals || []).length ? (summary.goals || []).map(goal => `
      <div class="summary-goal-row">
        <span>${goal.minute}'</span>
        <strong>${escapeHtml(goal.scorer_name || 'Joueur')}</strong>
        <em>${goal.assist_name ? `Passe : ${escapeHtml(goal.assist_name)}` : 'Sans passe'}</em>
      </div>
    `).join('') : `<p class="text-muted">Aucun but enregistré.</p>`;

    const playersHtml = (summary.players || []).length ? (summary.players || []).map(player => {
      const resultLabel = player.result === 'win' ? 'Victoire' : player.result === 'loss' ? 'Défaite' : 'Nul';
      const resultClass = player.result === 'win' ? 'positive' : player.result === 'loss' ? 'negative' : 'neutral';
      const teamName = teamsCache[player.team_id]?.name || 'Non assigné';
      return `
        <div class="summary-player-card">
          <div class="summary-player-head">
            <div>
              <h3>${escapeHtml(player.username)}</h3>
              <p class="text-muted">${escapeHtml(teamName)} · ${player.goals} but(s) · ${player.assists} passe(s)</p>
            </div>
            <span class="result-pill result-${resultClass}">${resultLabel}</span>
          </div>
          <div class="summary-stats-grid">
            ${renderStatDelta('OVR', player.before, player.after, 'overall')}
            ${renderStatDelta('Tir', player.before, player.after, 'rating_shot')}
            ${renderStatDelta('Passe', player.before, player.after, 'rating_pass')}
            ${renderStatDelta('Victoire', player.before, player.after, 'rating_victory')}
            ${renderStatDelta('Forme', player.before, player.after, 'rating_form')}
            ${renderStatDelta('Défense', player.before, player.after, 'rating_defense')}
          </div>
        </div>`;
    }).join('') : `<p class="text-muted">Les changements de statistiques seront disponibles après l'enregistrement du match.</p>`;

    app.innerHTML = `
      <div class="page match-summary-page fade-in">
        <div class="page-header summary-header">
          <button class="btn btn-outline" onclick="window.location.hash='/home'">⬅ Lobbys</button>
          <div>
            <h1>Résumé du match</h1>
            <p class="text-muted">Stats FUT mises à jour après validation du résultat.</p>
          </div>
        </div>

        <div class="card summary-score-card">
          <span class="lobby-badge badge-finished">TERMINÉ</span>
          <h2>${escapeHtml(match.name || 'Match')}</h2>
          <div class="summary-score-line">
            <span>${escapeHtml(homeTeam)}</span>
            <strong>${match.home_score ?? 0} - ${match.away_score ?? 0}</strong>
            <span>${escapeHtml(awayTeam)}</span>
          </div>
          <p class="summary-winner">🏆 ${escapeHtml(winnerLabel)}</p>
        </div>

        <div class="summary-layout">
          <div class="card summary-section">
            <h2>⚽ Buts</h2>
            ${goalsHtml}
          </div>
          <div class="summary-section">
            <h2>📈 Évolution des joueurs</h2>
            <div class="summary-player-list">${playersHtml}</div>
          </div>
        </div>
      </div>`;
  } catch (error) {
    console.error('Erreur résumé:', error);
    showToast('Impossible de charger le résumé.', 'error');
    app.innerHTML = `
      <div class="page">
        <div class="card" style="padding:30px; text-align:center;">
          <h1>Résumé indisponible</h1>
          <p class="text-muted">${escapeHtml(error.message)}</p>
          <button class="btn btn-outline" onclick="window.location.hash='/home'">Retour</button>
        </div>
      </div>`;
  }
}

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


function formatMatchDate(value) {
  if (!value) return 'Date inconnue';
  return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getHistoryDelta(match, key = 'overall') {
  return Number(match.after?.[key] ?? 0) - Number(match.before?.[key] ?? 0);
}

function renderMatchHistoryCard(match) {
  const delta = getHistoryDelta(match, 'overall');
  const sign = delta > 0 ? '+' : '';
  const resultLabel = match.result === 'win' ? 'Victoire' : match.result === 'loss' ? 'Défaite' : 'Nul';
  const resultClass = match.result === 'win' ? 'positive' : match.result === 'loss' ? 'negative' : 'neutral';
  return `
    <div class="history-card">
      <div class="history-card-main">
        <div>
          <h3>${escapeHtml(match.name || 'Match')}</h3>
          <p class="text-muted">${escapeHtml(match.home_team_name || 'Domicile')} ${match.home_score ?? 0} - ${match.away_score ?? 0} ${escapeHtml(match.away_team_name || 'Extérieur')}</p>
          <p class="text-muted">${formatMatchDate(match.ended_at)} · ${match.goals || 0} but(s) · ${match.assists || 0} passe(s)</p>
        </div>
        <div class="history-card-side">
          <span class="result-pill result-${resultClass}">${resultLabel}</span>
          <strong class="history-delta ${delta >= 0 ? 'delta-positive' : 'delta-negative'}">OVR ${sign}${delta}</strong>
        </div>
      </div>
    </div>`;
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

    const recentHtml = (recentMatches || []).length
      ? recentMatches.map(renderMatchHistoryCard).join('')
      : '<p class="text-muted">Aucun match enregistré pour le moment.</p>';

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

        <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; margin: 32px 0 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
          <h2 style="font-size:1.3rem; font-weight:700; margin:0;">Historique des matchs</h2>
          <button class="btn btn-outline btn-sm" onclick="window.location.hash='/profile/${user.id}/history'">Voir plus</button>
        </div>
        <div class="history-list">
          ${recentHtml}
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


async function renderProfileHistory(userId) {
  const id = userId || localStorage.getItem('userId') || '1';
  app.innerHTML = `
    <div class="football-container">
      <div class="football-ball">⚽</div>
      <div class="football-shadow"></div>
      <p class="loader-text">Chargement de l'historique...</p>
    </div>`;

  try {
    const profile = await apiFetch(`/profile/${id}`);
    const data = await apiFetch(`/profile/${id}/history`);
    const history = data.history || [];
    app.innerHTML = `
      <div class="page fade-in">
        <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
          <div>
            <h1>Historique de ${escapeHtml(profile.user.username)}</h1>
            <p class="text-muted">Tous les matchs enregistrés et les évolutions de stats.</p>
          </div>
          <button class="btn btn-outline" onclick="window.location.hash='/profile/${id}'">← Retour profil</button>
        </div>
        <div class="history-list">
          ${history.length ? history.map(renderMatchHistoryCard).join('') : '<p class="text-muted">Aucun match enregistré.</p>'}
        </div>
      </div>`;
  } catch (error) {
    console.error('Erreur historique:', error);
    app.innerHTML = `<div class="page"><p class="text-muted">Impossible de charger l'historique.</p><button class="btn btn-outline" onclick="window.location.hash='/profile/${id}'">Retour</button></div>`;
  }
}

async function renderAdmin() {
  if (localStorage.getItem('role') !== 'admin') {
    app.innerHTML = `
      <div class="page">
        <div class="card" style="padding: 30px; text-align:center;">
          <h1>Accès refusé</h1>
          <p class="text-muted">Cette page est réservée aux administrateurs.</p>
          <button class="btn btn-outline" onclick="window.location.hash='/home'">Retour aux lobbys</button>
        </div>
      </div>`;
    return;
  }

  app.innerHTML = `
    <div class="football-container">
      <div class="football-ball">⚽</div>
      <div class="football-shadow"></div>
      <p class="loader-text">Chargement du panneau admin...</p>
    </div>`;

  try {
    const users = await apiFetch('/admin/users');
    const currentUserId = localStorage.getItem('userId');

    const rows = users.map(user => {
      const isCurrentUser = String(user.id) === String(currentUserId);
      const nextRole = user.role === 'admin' ? 'fan' : 'admin';
      const roleClass = user.role === 'admin' ? 'role-admin' : 'role-player';
      return `
        <tr>
          <td style="font-weight:800; color:white;">#${user.id}</td>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="player-avatar" style="width:32px; height:32px; line-height:32px; font-size:0.9rem;">${escapeHtml(user.username.charAt(0).toUpperCase())}</div>
              <span style="font-weight:800; color:white;">${escapeHtml(user.username)}</span>
              ${isCurrentUser ? '<span class="text-muted" style="font-size:0.8rem;">(vous)</span>' : ''}
            </div>
          </td>
          <td><span class="role-badge ${roleClass}" style="text-transform:uppercase;">${escapeHtml(user.role)}</span></td>
          <td class="ranking-stat">${Number(user.matches_played || 0)}</td>
          <td class="ranking-stat">${Number(user.lobbies_created || 0)}</td>
          <td style="text-align:right;">
            <button class="btn btn-sm ${nextRole === 'admin' ? 'btn-success' : 'btn-outline'}" data-role-user-id="${user.id}" data-next-role="${nextRole}" ${isCurrentUser ? 'disabled title="Vous ne pouvez pas modifier votre propre rôle"' : ''}>
              ${nextRole === 'admin' ? 'Passer admin' : 'Passer fan'}
            </button>
          </td>
        </tr>`;
    }).join('');

    app.innerHTML = `
      <div class="page fade-in">
        <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
          <div>
            <h1>Panneau d'administration</h1>
            <p class="text-muted">Gérez les utilisateurs et leurs rôles.</p>
          </div>
          <button class="btn btn-outline" onclick="window.location.hash='/home'">← Retour</button>
        </div>

        <div id="admin-message" class="auth-message hidden"></div>

        <div class="ranking-table-container">
          <table class="ranking-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Utilisateur</th>
                <th>Rôle</th>
                <th>Matchs</th>
                <th>Lobbys créés</th>
                <th style="text-align:right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="6" class="text-muted" style="text-align:center; padding:24px;">Aucun utilisateur.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    document.querySelectorAll('[data-role-user-id]').forEach(button => {
      button.addEventListener('click', async () => {
        await updateUserRole(button.dataset.roleUserId, button.dataset.nextRole);
      });
    });
  } catch (error) {
    console.error('Erreur admin:', error);
    app.innerHTML = `
      <div class="page">
        <div class="card" style="padding: 30px; text-align:center;">
          <h1>Impossible de charger l'administration</h1>
          <p class="text-muted">${escapeHtml(error.message)}</p>
          <button class="btn btn-outline" onclick="window.location.hash='/home'">Retour</button>
        </div>
      </div>`;
  }
}

async function updateUserRole(userId, role) {
  const message = document.getElementById('admin-message');
  if (message) {
    message.textContent = 'Modification en cours...';
    message.className = 'auth-message';
  }

  try {
    await apiFetch(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    });

    if (message) {
      message.textContent = 'Rôle modifié avec succès.';
      message.className = 'auth-message success';
    }
    await renderAdmin();
  } catch (error) {
    if (message) {
      message.textContent = error.message;
      message.className = 'auth-message error';
    }
    console.error(error);
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
          localStorage.setItem('role', data.user.role || 'fan');
        } else {
          localStorage.setItem('username', username);
          localStorage.setItem('role', 'fan');
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
function broadcastLocalLobbyChange(eventType, matchId) {
  try {
    localStorage.setItem('livefootstats:lobby-event', JSON.stringify({
      type: eventType,
      matchId,
      at: Date.now()
    }));
  } catch (err) {
    console.warn('Impossible de diffuser l’événement lobby localement:', err);
  }
}

window.addEventListener('storage', (event) => {
  if (event.key !== 'livefootstats:lobby-event' || !event.newValue) return;

  const hash = window.location.hash.replace('#', '') || '/home';
  if (hash !== '/home') return;

  try {
    const data = JSON.parse(event.newValue);
    if (["match_created", "match_deleted", "lobby_updated", "match_started", "match_paused", "match_resumed", "match_finished", "player_joined", "team_assigned"].includes(data.type)) {
      lastHomeSnapshot = '';
      renderHome();
    }
  } catch (err) {
    console.warn('Événement lobby local invalide:', err);
  }
});

// ==========================================
// SUPPRESSION DE MATCH
// ==========================================
let pendingDeleteMatchId = null;
let isDeletingLobby = false;

function openDeleteLobbyModal(matchId) {
  pendingDeleteMatchId = matchId;
  const modal = document.getElementById('delete-lobby-modal');
  const error = document.getElementById('delete-lobby-error');
  const confirmButton = document.getElementById('delete-lobby-confirm');

  if (!modal) {
    // Sécurité si le HTML n'est pas encore à jour.
    deleteMatch(matchId);
    return;
  }

  if (error) {
    error.textContent = '';
    error.classList.add('hidden');
  }
  if (confirmButton) {
    confirmButton.disabled = false;
    confirmButton.textContent = 'Oui, supprimer';
  }

  modal.classList.remove('hidden');
}

function closeDeleteLobbyModal() {
  if (isDeletingLobby) return;
  pendingDeleteMatchId = null;
  document.getElementById('delete-lobby-modal')?.classList.add('hidden');
}

async function deleteMatch(matchId) {
  try {
    await apiFetch(`/matchs/${matchId}`, { method: 'DELETE' });

    pendingDeleteMatchId = null;
    document.getElementById('delete-lobby-modal')?.classList.add('hidden');
    showToast('Lobby supprimé.', 'success');
    broadcastLocalLobbyChange('match_deleted', matchId);

    if (window.location.hash === '#/home' || window.location.hash === '') {
      await renderHome();
    } else {
      window.location.hash = '/home';
    }
  } catch (err) {
    const error = document.getElementById('delete-lobby-error');
    if (error) {
      error.textContent = `Erreur : ${err.message}`;
      error.classList.remove('hidden');
    } else {
      alert(`Erreur lors de la suppression du lobby : ${err.message}`);
    }
    console.error(err);
  }
}

window.confirmDeleteLobby = function(event, matchId) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
  }

  openDeleteLobbyModal(matchId);
  return false;
};

window.closeDeleteLobbyModal = closeDeleteLobbyModal;

const deleteLobbyCancel = document.getElementById('delete-lobby-cancel');
if (deleteLobbyCancel) {
  deleteLobbyCancel.addEventListener('click', closeDeleteLobbyModal);
}

const deleteLobbyModal = document.getElementById('delete-lobby-modal');
if (deleteLobbyModal) {
  deleteLobbyModal.addEventListener('click', (event) => {
    if (event.target === deleteLobbyModal) closeDeleteLobbyModal();
  });
}

const deleteLobbyConfirm = document.getElementById('delete-lobby-confirm');
if (deleteLobbyConfirm) {
  deleteLobbyConfirm.addEventListener('click', async () => {
    if (!pendingDeleteMatchId || isDeletingLobby) return;

    isDeletingLobby = true;
    deleteLobbyConfirm.disabled = true;
    deleteLobbyConfirm.textContent = 'Suppression...';

    await deleteMatch(pendingDeleteMatchId);

    isDeletingLobby = false;
    deleteLobbyConfirm.disabled = false;
    deleteLobbyConfirm.textContent = 'Oui, supprimer';
  });
}

// Navigation des cartes via JS, pas via onclick inline : les boutons restent prioritaires.
document.addEventListener('click', (event) => {
  const deleteButton = event.target.closest('[data-delete-match-id]');
  if (deleteButton) {
    window.confirmDeleteLobby(event, deleteButton.dataset.deleteMatchId);
    return;
  }

  const matchCard = event.target.closest('[data-open-match-id]');
  if (matchCard) {
    window.location.hash = `/match/${matchCard.dataset.openMatchId}`;
  }
});

window.deleteMatch = deleteMatch;

window.addEventListener('hashchange', router);
router();
