-- 1. Table des utilisateurs
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL, -- Obligatoire pour la sécurité vue en cours
    role VARCHAR(20) DEFAULT 'fan' -- Soit 'fan' ou 'admin'
);

-- 2. Table des équipes
CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    logo_url VARCHAR(255)
);

-- 3. Table des matchs (pour gérer le live score dynamique et les Salons)
CREATE TABLE matches (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL DEFAULT 'Match Amical', -- Nom du salon
    rules TEXT, -- Règles du salon
    home_team_id INT REFERENCES teams(id) ON DELETE CASCADE,
    away_team_id INT REFERENCES teams(id) ON DELETE CASCADE,
    match_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    home_score INT DEFAULT 0,
    away_score INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'scheduled', -- scheduled (en salon), live (en cours), paused, finished
    creator_id INT REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    paused_at TIMESTAMP,
    elapsed_seconds INT DEFAULT 0
);

-- 4. Table des messages (Chat en direct lié aux WebSockets)
CREATE TABLE live_messages (
    id SERIAL PRIMARY KEY,
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Table des Refresh Tokens (Pour le système d'authentification exigé)
CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table 6 : Les joueurs du match
CREATE TABLE match_players (
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    team_id INT REFERENCES teams(id) ON DELETE CASCADE,
    PRIMARY KEY (match_id, user_id)
);

-- Table 7 : Les buts
CREATE TABLE goals (
    id SERIAL PRIMARY KEY,
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    team_id INT REFERENCES teams(id) ON DELETE CASCADE,
    scorer_id INT REFERENCES users(id) ON DELETE SET NULL,
    assist_id INT REFERENCES users(id) ON DELETE SET NULL,
    minute INT NOT NULL
);

-- Table 8 : Statistiques persistantes des joueurs (cartes FUT)
CREATE TABLE player_stats (
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
);

-- Table 9 : Historique des évolutions de stats après un match
CREATE TABLE match_stat_changes (
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    result VARCHAR(10) NOT NULL,
    goals INT DEFAULT 0,
    assists INT DEFAULT 0,
    stats_before JSONB NOT NULL,
    stats_after JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (match_id, user_id)
);

-- --- DONNÉES DE TEST ---
-- Tous les comptes de test utilisent le mot de passe : password123
-- Les hashes correspondent au poivre par défaut : secret_poivre
INSERT INTO users (id, username, password_hash, salt, role) VALUES
(1, 'imade', 'fe74253a4d1224fb993f21c79fd8833889594c293814e9f94a414ff93dba7d12', 'seed_salt_imade', 'admin'),
(2, 'anas', 'f647afa07e59fc08fa74319b885e1ebb8dc3c5bd6f83b327df3179c8da3588c2', 'seed_salt_anas', 'fan'),
(3, 'lahcen', '66bc50aed66680707aea387e0e3ff5e4cb01b4af9a1edb8c20639b7cdd77f5a7', 'seed_salt_lahcen', 'fan'),
(4, 'nour', '353f133fcd2db319670f98cb8a227c06b04effdf6c6e0be2f1e83e9ca196a631', 'seed_salt_nour', 'fan'),
(5, 'yassine', 'e91292986b20c3188f5de3e3e743564111c9d60964885896307aa62f8fd92b3f', 'seed_salt_yassine', 'fan'),
(6, 'sara', 'b3502bf15c2ba54e5476400b519ab98ee6fde6f49919924c4997393df2396dcb', 'seed_salt_sara', 'fan');
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

INSERT INTO teams (id, name, logo_url) VALUES
(1, 'FC Barcelone', '/assets/barca.png'),
(2, 'Real Madrid', '/assets/real.png'),
(3, 'Paris SG', '/assets/psg.png'),
(4, 'Olympique Marseille', '/assets/om.png');
SELECT setval('teams_id_seq', (SELECT MAX(id) FROM teams));

INSERT INTO matches (id, name, rules, home_team_id, away_team_id, match_date, home_score, away_score, status, creator_id, started_at, ended_at, paused_at, elapsed_seconds) VALUES
(1, 'Lobby Imade vs Anas', 'Format : 5 vs 5 (20 min)', 1, 2, CURRENT_TIMESTAMP - INTERVAL '15 minutes', 0, 0, 'scheduled', 1, NULL, NULL, NULL, 0),
(2, 'Derby en direct', 'Format : 4 vs 4 (10 min)', 3, 4, CURRENT_TIMESTAMP - INTERVAL '8 minutes', 1, 1, 'live', 2, CURRENT_TIMESTAMP - INTERVAL '6 minutes', NULL, NULL, 0),
(3, 'Match en pause', 'Format : 5 vs 5 (20 min)', 1, 3, CURRENT_TIMESTAMP - INTERVAL '35 minutes', 2, 1, 'paused', 3, CURRENT_TIMESTAMP - INTERVAL '20 minutes', NULL, CURRENT_TIMESTAMP - INTERVAL '3 minutes', 900),
(4, 'Finale test statistiques', 'Format : 5 vs 5 (20 min)', 2, 4, CURRENT_TIMESTAMP - INTERVAL '2 days', 3, 1, 'finished', 1, CURRENT_TIMESTAMP - INTERVAL '2 days 1 hour', CURRENT_TIMESTAMP - INTERVAL '2 days', NULL, 1200);
SELECT setval('matches_id_seq', (SELECT MAX(id) FROM matches));

INSERT INTO match_players (match_id, user_id, team_id) VALUES
(1, 1, NULL), (1, 2, NULL), (1, 3, NULL),
(2, 2, 3), (2, 4, 3), (2, 1, 4), (2, 5, 4),
(3, 3, 1), (3, 6, 1), (3, 2, 3), (3, 5, 3),
(4, 1, 2), (4, 4, 2), (4, 2, 4), (4, 3, 4);

INSERT INTO goals (match_id, team_id, scorer_id, assist_id, minute) VALUES
(2, 3, 2, 4, 3),
(2, 4, 1, 5, 5),
(3, 1, 3, 6, 4),
(3, 1, 6, 3, 8),
(3, 3, 2, 5, 11),
(4, 2, 1, 4, 3),
(4, 2, 1, NULL, 9),
(4, 4, 2, 3, 12),
(4, 2, 4, 1, 18);

INSERT INTO live_messages (match_id, user_id, content, created_at) VALUES
(2, 2, 'Bon match à tous !', CURRENT_TIMESTAMP - INTERVAL '5 minutes'),
(2, 1, 'On joue sérieux.', CURRENT_TIMESTAMP - INTERVAL '4 minutes'),
(3, 3, 'Pause tactique.', CURRENT_TIMESTAMP - INTERVAL '3 minutes');

INSERT INTO player_stats (user_id, overall, rating_shot, rating_pass, rating_victory, rating_form, rating_defense, matches_played, wins, losses, draws, goals, assists, motm_count, current_streak, best_streak) VALUES
(1, 54, 56, 52, 52, 52, 51, 1, 1, 0, 0, 2, 1, 0, 1, 1),
(2, 50, 52, 52, 49, 49, 49, 1, 0, 1, 0, 1, 1, 0, -1, 0),
(3, 49, 50, 52, 49, 49, 49, 1, 0, 1, 0, 0, 1, 0, -1, 0),
(4, 53, 52, 52, 52, 52, 51, 1, 1, 0, 0, 1, 1, 0, 1, 1),
(5, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0),
(6, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0);

INSERT INTO match_stat_changes (match_id, user_id, result, goals, assists, stats_before, stats_after) VALUES
(4, 1, 'win', 2, 1, '{"user_id":1,"overall":50,"rating_shot":50,"rating_pass":50,"rating_victory":50,"rating_form":50,"rating_defense":50,"matches_played":0,"wins":0,"losses":0,"draws":0,"goals":0,"assists":0,"motm_count":0,"current_streak":0,"best_streak":0}', '{"user_id":1,"overall":54,"rating_shot":56,"rating_pass":52,"rating_victory":52,"rating_form":52,"rating_defense":51,"matches_played":1,"wins":1,"losses":0,"draws":0,"goals":2,"assists":1,"motm_count":0,"current_streak":1,"best_streak":1}'),
(4, 4, 'win', 1, 1, '{"user_id":4,"overall":50,"rating_shot":50,"rating_pass":50,"rating_victory":50,"rating_form":50,"rating_defense":50,"matches_played":0,"wins":0,"losses":0,"draws":0,"goals":0,"assists":0,"motm_count":0,"current_streak":0,"best_streak":0}', '{"user_id":4,"overall":53,"rating_shot":52,"rating_pass":52,"rating_victory":52,"rating_form":52,"rating_defense":51,"matches_played":1,"wins":1,"losses":0,"draws":0,"goals":1,"assists":1,"motm_count":0,"current_streak":1,"best_streak":1}'),
(4, 2, 'loss', 1, 1, '{"user_id":2,"overall":50,"rating_shot":50,"rating_pass":50,"rating_victory":50,"rating_form":50,"rating_defense":50,"matches_played":0,"wins":0,"losses":0,"draws":0,"goals":0,"assists":0,"motm_count":0,"current_streak":0,"best_streak":0}', '{"user_id":2,"overall":50,"rating_shot":52,"rating_pass":52,"rating_victory":49,"rating_form":49,"rating_defense":49,"matches_played":1,"wins":0,"losses":1,"draws":0,"goals":1,"assists":1,"motm_count":0,"current_streak":-1,"best_streak":0}'),
(4, 3, 'loss', 0, 1, '{"user_id":3,"overall":50,"rating_shot":50,"rating_pass":50,"rating_victory":50,"rating_form":50,"rating_defense":50,"matches_played":0,"wins":0,"losses":0,"draws":0,"goals":0,"assists":0,"motm_count":0,"current_streak":0,"best_streak":0}', '{"user_id":3,"overall":49,"rating_shot":50,"rating_pass":52,"rating_victory":49,"rating_form":49,"rating_defense":49,"matches_played":1,"wins":0,"losses":1,"draws":0,"goals":0,"assists":1,"motm_count":0,"current_streak":-1,"best_streak":0}');

-- --- OPTIMISATIONS DE PERFORMANCES ---
CREATE INDEX idx_goals_scorer ON goals(scorer_id);
CREATE INDEX idx_match_players_match ON match_players(match_id);
CREATE INDEX idx_player_stats_overall ON player_stats(overall DESC);
CREATE INDEX idx_match_stat_changes_match ON match_stat_changes(match_id);
