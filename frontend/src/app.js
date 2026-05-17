const API = 'https://localhost:3000';

const app = document.getElementById('app');
const navLogout = document.getElementById('nav-logout');

let teamsCache = {};

function navigate(path) {
  window.location.hash = path;
}

function updateNavLinks(path) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${path}`);
  });
}

async function router() {
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

    const homeTeam = teamsCache[match.home_team_id]?.name || "Équipe Domicile";
    const awayTeam = teamsCache[match.away_team_id]?.name || "Équipe Extérieur";
    
    app.innerHTML = `
      <div class="page">
        <button class="btn btn-outline" onclick="window.location.hash='/home'" style="margin-bottom:20px;">⬅ Retour aux lobbys</button>
        
        <div class="card" style="text-align:center; padding: 40px 20px;">
          <span class="lobby-badge badge-${match.status === 'live' ? 'live' : match.status === 'finished' ? 'finished' : 'waiting'}" style="margin-bottom:20px; display:inline-block;">${match.status.toUpperCase()}</span>
          <div style="display:flex; justify-content:center; align-items:center; gap:30px;">
            <div style="flex:1; text-align:right;">
              <h2 style="font-size:1.8rem;">${homeTeam}</h2>
            </div>
            <div style="font-size:3rem; font-weight:900; background:-webkit-linear-gradient(45deg, var(--gold), #ffdf70); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">
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
        
        <div style="margin-top:40px; background:rgba(255,255,255,0.03); border-radius:16px; padding:20px; border:1px solid rgba(255,255,255,0.1);">
          <h3>💬 Chat en direct (Bientôt)</h3>
          <p class="text-muted" style="margin-top:10px;">Le chat avec WebSockets sera implémenté lors du prochain push d'Anas (Issue #10).</p>
        </div>
      </div>
    `;
  } catch (e) {
    app.innerHTML = `<div class="page"><p>Erreur lors du chargement des détails du match.</p></div>`;
  }
}

// Modal Logic
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
