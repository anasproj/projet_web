-- 1. Table des utilisateurs (avec gestion des rôles et sécurité du mot de passe)
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
    status VARCHAR(20) DEFAULT 'scheduled', -- scheduled (en salon), live (en cours), finished
    creator_id INT REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMP,
    ended_at TIMESTAMP
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
    expires_at TIMESTAMP NOT NULL
);





-- Nouvelle table 6 : Les joueurs du match
CREATE TABLE match_players (
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    team_id INT REFERENCES teams(id) ON DELETE CASCADE,
    PRIMARY KEY (match_id, user_id)
);

-- Nouvelle table 7 : Les buts
CREATE TABLE goals (
    id SERIAL PRIMARY KEY,
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    team_id INT REFERENCES teams(id) ON DELETE CASCADE,
    scorer_id INT REFERENCES users(id) ON DELETE SET NULL,
    assist_id INT REFERENCES users(id) ON DELETE SET NULL,
    minute INT NOT NULL
);


-- --- DONNÉES DE TEST ---

-- Insertion de deux équipes
INSERT INTO teams (name, logo_url) VALUES 
('FC Barcelone', '/assets/psg.png'),
('Real Vardrid', '/assets/om.png');

-- Insertion d'un match (en direct, pour préparer votre page Websocket dynamique)
INSERT INTO matches (home_team_id, away_team_id, match_date, home_score, away_score, status) 
VALUES (1, 2, CURRENT_TIMESTAMP, 2, 1, 'live');