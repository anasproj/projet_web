# Plan de soutenance — LiveFootStats

## Informations générales

- **Durée prévue** : 20 à 25 minutes + questions
- **Sujet** : LiveFootStats — application web de gestion de lobbys, matchs en temps réel, statistiques joueurs et classement
- **Équipe** :
  - **Imade** : Frontend / UI / intégration temps réel côté navigateur
  - **Anas** : Backend / API REST / WebSocket / sécurité
  - **Lahcen** : Docker / base de données / CI / déploiement

---

# Charte graphique commune des diapositives

À rappeler dans chaque prompt de génération :

- **Style** : académique, sobre, propre, professionnel, adapté à une soutenance technique.
- **Inspiration couleurs** : Polytech Montpellier.
- **Palette recommandée** :
  - Bleu Polytech sobre : `#005AAA` ou bleu proche
  - Vert Polytech : `#95C11F` ou vert proche
  - Blanc : `#FFFFFF`
  - Gris très clair : `#F3F4F6`
  - Gris texte : `#374151`
- **Fond conseillé** : blanc ou gris très clair, pas de fond sombre.
- **Formes** : blocs arrondis, lignes fines, icônes simples, schémas lisibles.
- **Typographie** : sans-serif moderne, titres en gras, texte court.
- **Règle** : éviter les effets trop chargés, les visuels trop “gaming” et toute information temporaire ou susceptible de devenir obsolète.
- **Objectif** : produire des diapositives harmonisées, sobres et crédibles pour un oral académique.

---

# Découpage global de l'oral

| Partie | Durée | Responsable principal |
|---|---:|---|
| 1. Présentation du projet | ~1 min | Imade |
| 2. Gestion de projet / séparation des tâches | ~3 min | Imade + Anas + Lahcen |
| 3. Fonctionnalités | ~2 min | Imade |
| 4. Architecture logicielle | ~5 min | Anas + Lahcen |
| 5. CI / Docker / déploiement | ~2 min | Lahcen |
| 6. Live démo | ~3 min | Imade, avec appui Anas |
| 7. Module technique : algorithme de mise à jour des cartes FUT | ~5 min | Anas + Imade |
| Questions | variable | Toute l'équipe |

---

# Plan des diapositives avec prompts de génération

## Diapo 1 — Titre du projet

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive de titre en format 16:9, au style académique sobre inspiré des couleurs Polytech Montpellier : fond blanc ou gris très clair, accents bleu Polytech `#005AAA`, vert Polytech `#95C11F`, texte gris foncé. Affiche au centre le titre **LiveFootStats** et le sous-titre **Lobbys, matchs en direct et statistiques joueurs**. Ajoute un visuel discret combinant football et technologie : terrain stylisé minimal, icône ballon, lignes de connexion fines. Ne pas ajouter d'information temporaire ou susceptible de devenir obsolète. Design propre, institutionnel, lisible.

**Contenu à afficher :**

- LiveFootStats
- Lobbys, matchs en direct et statistiques joueurs
- Projet web : frontend, backend, base de données, Docker et CI

**Présenté par : Imade**

**À dire :**

> Notre projet s'appelle LiveFootStats. C'est une application web qui permet de créer des lobbys de match, de faire rejoindre des joueurs, de composer les équipes, de lancer un match en direct, d'enregistrer les buts et de mettre à jour les statistiques des joueurs à la fin du match.

---

## Diapo 2 — Objectif et scénario utilisateur

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 académique et sobre, avec la charte Polytech Montpellier : fond blanc/gris clair, bleu Polytech, vert Polytech, texte gris foncé. Titre : **Objectif et scénario utilisateur**. Représente un parcours en timeline claire avec 8 étapes : créer un lobby, rejoindre, composer les équipes, lancer le match, enregistrer les buts, terminer le match, recalculer les statistiques, mettre à jour profil et classement. Utilise des icônes simples et homogènes. Ne pas ajouter d'information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

1. Création d'un lobby
2. Joueurs qui rejoignent
3. Composition des équipes
4. Démarrage du match à 0-0
5. Enregistrement des buts
6. Sauvegarde du match
7. Recalcul des statistiques
8. Mise à jour du profil et du classement

**Présenté par : Imade**

**À dire :**

> L'objectif était de reproduire un vrai flux de match. On part d'un lobby, les joueurs rejoignent, le créateur répartit les équipes, puis le match démarre. Pendant le match, le score, le chrono, le chat et les buts évoluent en temps réel. À la fin, l'application calcule automatiquement les nouvelles statistiques des joueurs.

---

## Diapo 3 — Répartition des tâches dans l'équipe

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 sobre et académique aux couleurs Polytech Montpellier : blanc/gris clair, bleu Polytech, vert Polytech. Titre : **Répartition des tâches**. Crée trois cartes alignées : **Imade — Frontend**, **Anas — Backend**, **Lahcen — Infrastructure**. Dans chaque carte, affiche 3 à 4 responsabilités avec icônes simples : écran pour frontend, serveur pour backend, conteneur/BD pour infrastructure. Garder beaucoup d'espace blanc. Ne pas ajouter d'information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

| Membre | Responsabilités |
|---|---|
| Imade | Frontend, interface, pages dynamiques, intégration temps réel côté navigateur |
| Anas | Backend, routes REST, sécurité, WebSocket, logique métier |
| Lahcen | Docker, PostgreSQL, CI GitLab, registry, déploiement |

**Présenté par : Imade puis chaque membre complète rapidement**

**À dire :**

> Nous avons séparé le travail par responsabilités. Imade s'est occupé principalement du frontend, Anas du backend et Lahcen de l'infrastructure, de la base de données et de la CI. Certaines fonctionnalités ont nécessité une intégration commune, notamment le temps réel et la sauvegarde de fin de match.

---

## Diapo 4 — Fonctionnalités principales

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 académique, sobre, aux couleurs Polytech Montpellier : fond blanc ou gris très clair, bleu Polytech pour les titres, vert Polytech pour les validations. Titre : **Fonctionnalités principales**. Présente les fonctionnalités dans une grille claire avec icônes : authentification et rôles, lobbys, composition équipes, match live, chat, profil joueur, classement, page admin. Design institutionnel, peu de texte, pas d'information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

- Authentification avec rôles `fan` et `admin`
- Création / suppression de lobbys
- Rejoindre un lobby
- Composition des équipes par le créateur
- Match live : score, chrono, pause/reprise, buts
- Chat avec messages système lors des buts
- Profil joueur avec carte FUT
- Classement dynamique
- Page admin pour gérer les utilisateurs et les rôles

**Présenté par : Imade**

**À dire :**

> Les fonctionnalités principales couvrent tout le cycle d'un match. L'application gère aussi deux rôles avec des accès différents : un utilisateur classique et un administrateur. L'admin peut accéder à une page dédiée pour gérer les utilisateurs et les rôles.

---

## Diapo 5 — Respect des contraintes web

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 sobre et académique avec le thème Polytech Montpellier : fond clair, bleu Polytech, vert Polytech, texte gris foncé. Titre : **Respect des contraintes web**. Crée un tableau à deux colonnes : **Contrainte** et **Implémentation**. Ajoute des badges verts avec coche pour chaque ligne. Inclure : HTML/JS/CSS sans framework, REST, WebSocket, CORS, HTTPS, Access/Refresh Token, cookies sécurisés, hash sel + poivre. Ne pas ajouter d'information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

| Contrainte | Implémentation |
|---|---|
| HTML / JS / CSS sans framework structurant | Frontend en JavaScript pur |
| REST | API backend Deno |
| WebSocket | Temps réel lobby, match, chat |
| CORS | Front et back séparés |
| HTTPS | Backend sécurisé |
| Access / Refresh Token | JWT + refresh token |
| Cookies sécurisés | `HttpOnly`, `Secure`, `SameSite=None` |
| Hash avec sel et poivre | Mots de passe sécurisés |

**Présenté par : Anas**

**À dire :**

> Le frontend est volontairement simple : HTML, CSS et JavaScript pur, sans React, Vue ou Angular. Le backend expose une API REST et une route WebSocket. L'authentification utilise un access token court et un refresh token stockés dans des cookies sécurisés. Les mots de passe sont hashés avec un sel et un poivre.

---

## Diapo 6 — Architecture logicielle

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 académique et sobre aux couleurs Polytech Montpellier : fond clair, bleu Polytech, vert Polytech. Titre : **Architecture logicielle**. Représente un schéma en couches avec quatre blocs reliés par des flèches : Navigateur, Frontend Nginx, Backend Deno HTTPS, PostgreSQL. Sur les flèches, afficher : HTML/CSS/JS, REST + WebSocket + CORS, SQL. Utilise des blocs arrondis, icônes simples et beaucoup d'espace. Ne pas ajouter de ports ni d'information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

```txt
Navigateur
  |
  | HTML / CSS / JS
  v
Frontend Nginx
  |
  | REST + WebSocket + CORS
  v
Backend Deno HTTPS
  |
  | SQL
  v
PostgreSQL
```

**Présenté par : Anas + Lahcen**

**À dire :**

> L'architecture est séparée en trois parties. Le frontend est servi par Nginx. Il communique avec le backend Deno via REST pour les actions classiques et WebSocket pour le temps réel. Le backend communique ensuite avec PostgreSQL. Le frontend et le backend sont séparés, donc nous utilisons CORS et pas de reverse proxy.

---

## Diapo 7 — Backend et API REST

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 sobre et technique aux couleurs Polytech Montpellier : fond blanc/gris clair, bleu Polytech, vert Polytech. Titre : **Backend et API REST**. Affiche un serveur central nommé **API Deno** et des badges de routes autour : `POST /login`, `POST /refresh`, `GET /matchs`, `POST /matchs`, `DELETE /matchs/:id`, `POST /matchs/:id/goals`, `GET /leaderboard`, `GET /profile/:id`, `GET /admin/users`. Utilise des couleurs discrètes pour différencier les méthodes HTTP. Ne pas ajouter d'information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

Exemples de routes :

- `POST /login`
- `POST /refresh`
- `POST /logout`
- `GET /matchs`
- `POST /matchs`
- `DELETE /matchs/:id`
- `POST /matchs/:id/join`
- `POST /matchs/:id/start`
- `POST /matchs/:id/goals`
- `GET /leaderboard`
- `GET /profile/:id`
- `GET /admin/users`
- `PATCH /admin/users/:id/role`

**Présenté par : Anas**

**À dire :**

> Le backend suit une logique REST. Chaque action importante est exposée par une route claire. Les routes sensibles vérifient l'authentification, et certaines vérifient aussi le rôle de l'utilisateur, par exemple les routes d'administration ou la suppression de lobby.

---

## Diapo 8 — Sécurité et rôles

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 académique, sobre, avec la charte Polytech Montpellier : fond clair, bleu Polytech pour les titres, vert Polytech pour les éléments validés. Titre : **Sécurité et rôles**. Divise la slide en deux zones : à gauche les rôles `fan` et `admin`, à droite la sécurité : access token, refresh token, cookies sécurisés, hash avec sel et poivre. Utilise des icônes simples : cadenas, clé, bouclier, utilisateur. Ne pas ajouter d'information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

- Deux rôles : `fan` et `admin`
- Accès admin réservé à la page `/admin`
- Suppression lobby : créateur ou admin seulement
- Access token JWT court
- Refresh token long stocké en base
- Cookies sécurisés
- Mots de passe hashés avec sel + poivre

**Présenté par : Anas**

**À dire :**

> Nous avons deux niveaux d'accès. Un utilisateur classique peut jouer, créer ou rejoindre des matchs. Un administrateur a accès à des routes supplémentaires, notamment la gestion des rôles. Les tokens sont transférés uniquement par cookies sécurisés, et les refresh tokens sont stockés hashés en base.

---

## Diapo 9 — Base de données

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 sobre et académique aux couleurs Polytech Montpellier : blanc/gris clair, bleu Polytech, vert Polytech. Titre : **Base de données PostgreSQL**. Représente un modèle relationnel simplifié avec des blocs de tables : `users`, `matches`, `teams`, `match_players`, `goals`, `player_stats`, `match_stat_changes`, `refresh_tokens`, `live_messages`. Ajoute une phrase courte : **Une responsabilité par table**. Garder le schéma clair, sans détails de colonnes, sans information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

Tables principales :

- `users`
- `matches`
- `teams`
- `match_players`
- `goals`
- `player_stats`
- `match_stat_changes`
- `refresh_tokens`
- `live_messages`

**Présenté par : Lahcen**

**À dire :**

> La consigne demandait environ cinq tables. Nous avons un peu plus de tables car nous avons préféré séparer les responsabilités. Les utilisateurs, les matchs, les buts, les joueurs dans un match, les statistiques et les tokens de sécurité ont chacun leur propre table. Cela rend la base plus propre et plus maintenable.

**Réponse prête si question du professeur :**

> Nous aurions pu fusionner certaines tables, mais cela aurait rendu le modèle moins propre. Par exemple, les buts, les statistiques et les refresh tokens n'ont pas la même responsabilité. On a donc choisi une base relationnelle plus normalisée.

---

## Diapo 10 — Docker et déploiement

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 académique et sobre aux couleurs Polytech Montpellier : fond clair, bleu Polytech, vert Polytech, texte gris foncé. Titre : **Docker et déploiement**. Crée un schéma avec un grand cadre **docker-compose.yml unique** contenant trois services : frontend Nginx, backend Deno, base PostgreSQL. Utilise des icônes Docker, serveur web et base de données. Ne pas ajouter d'information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

- Un seul fichier `docker-compose.yml`
- 3 services :
  - `frontend`
  - `backend`
  - `database`
- Frontend servi par Nginx
- Backend Deno en HTTPS
- Base PostgreSQL

**Présenté par : Lahcen**

**À dire :**

> Le projet se lance avec un seul fichier compose. Il démarre le frontend, le backend et la base de données. Le frontend et le backend sont séparés, ce qui permet de respecter la contrainte CORS sans utiliser de reverse proxy.

---

## Diapo 11 — CI GitLab

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 sobre, académique et DevOps aux couleurs Polytech Montpellier : fond blanc/gris clair, bleu Polytech, vert Polytech. Titre : **Pipeline CI GitLab**. Représente une pipeline horizontale en 4 étapes : tests unitaires, lint, build images Docker, push container registry. Utilise des icônes simples et des coches vertes. Ne pas ajouter d'information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

Pipeline :

1. Tests unitaires
2. Lint
3. Build images Docker
4. Push automatique vers le container registry

**Présenté par : Lahcen**

**À dire :**

> La CI GitLab vérifie automatiquement le projet. Elle lance les tests unitaires sur un module critique, exécute le lint, construit les images Docker frontend et backend, puis les pousse automatiquement dans le container registry.

**À montrer rapidement :**

- Page GitLab de la pipeline
- Jobs `tests_unitaires`, `lint_code`, `build_images`

---

## Diapo 12 — Live démo

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 académique et sobre aux couleurs Polytech Montpellier : fond clair, bleu Polytech, vert Polytech. Titre : **Live démo**. Présente un scénario de démonstration sous forme de checklist claire : connexion de deux utilisateurs, création lobby, apparition temps réel, rejoindre lobby, composition équipes, lancement match, but, chat, fin match, profil/classement, page admin. Ajoute deux fenêtres navigateur stylisées côte à côte pour illustrer le temps réel. Ne pas ajouter d'information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

Scénario de démonstration :

1. Connexion Imade
2. Connexion Anas dans une autre fenêtre
3. Création d'un lobby
4. Apparition du lobby en temps réel
5. Anas rejoint le lobby
6. Imade compose les équipes
7. Lancement du match
8. Enregistrement d'un but
9. Message système dans le chat
10. Fin du match
11. Mise à jour profil + classement
12. Page admin

**Présenté par : Imade, avec Anas en support**

**À dire :**

> Pour la démonstration, nous allons utiliser deux comptes dans deux fenêtres différentes afin de montrer le temps réel. Lorsqu'un lobby est créé ou lorsqu'un joueur rejoint, l'autre navigateur se met à jour sans refresh.

---

# Module technique mis en avant

## Diapo 13 — Module choisi : algorithme de mise à jour des cartes FUT

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 sobre et académique aux couleurs Polytech Montpellier : fond clair, bleu Polytech, vert Polytech, accents discrets. Titre : **Module technique : mise à jour des cartes FUT**. Affiche à droite une carte joueur stylisée mais sobre, pas trop gaming. À gauche, liste les objectifs : recalculer les statistiques, récompenser les vainqueurs, valoriser buteurs et passeurs, pénaliser légèrement les perdants, mettre à jour profil et classement. Ne pas ajouter d'information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

Objectif :

- Recalculer les statistiques des joueurs à la fin d'un match
- Récompenser les vainqueurs
- Valoriser les buteurs et passeurs
- Pénaliser légèrement les perdants
- Mettre à jour le profil et le classement

**Présenté par : Anas**

**À dire :**

> Le module dont nous sommes particulièrement fiers est l'algorithme de mise à jour des cartes FUT. À la fin d'un match, le backend analyse le résultat, les équipes, les buts et les passes décisives, puis met à jour les statistiques persistantes de chaque joueur.

---

## Diapo 14 — Entrées et sorties de l'algorithme

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 académique et sobre avec le thème Polytech Montpellier : fond clair, bleu Polytech, vert Polytech. Titre : **Entrées et sorties de l'algorithme**. Au centre, place un bloc **Algorithme de calcul**. À gauche, flèche entrante avec les entrées : score final, joueurs, équipes, buts, passes décisives, anciennes statistiques. À droite, flèche sortante avec les sorties : nouvelles statistiques, historique, profil mis à jour, classement recalculé. Ne pas ajouter d'information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

**Entrées :**

- Score final
- Joueurs du match
- Équipe de chaque joueur
- Nombre de buts
- Nombre de passes décisives
- Anciennes statistiques

**Sorties :**

- Nouvelles statistiques
- Historique des changements
- Profil joueur mis à jour
- Classement recalculé

**Présenté par : Anas**

**À dire :**

> L'algorithme prend en entrée toutes les informations du match et les anciennes statistiques du joueur. Il produit une nouvelle carte statistique, puis sauvegarde aussi l'évolution dans une table d'historique pour pouvoir l'afficher dans le profil.

---

## Diapo 15 — L'algorithme : Fiabilité et sécurité du calcul

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9. Génère une diapositive 16:9 académique. Titre : **Fiabilité et sécurité du calcul**. Divise la diapo en deux colonnes. Colonne gauche : Extrait de code JavaScript montrant le clonage `const after = { ...before };` et la fonction `clampStat`. Colonne droite : Trois points clés avec des icônes : 1. Clonage des données (sécurité), 2. Gestion stricte des séries (victoires/défaites), 3. Bornage des notes (limite 1 à 99). Ne pas ajouter d'information temporaire.

**Contenu à afficher sur la slide (Extrait de code et puces) :**

```javascript
// Extrait de l'algorithme
function calculateUpdatedStats(before, result, goals, assists) {
  // 1. On clone les données pour éviter toute perte
  const after = { ...before };
  
  if (result === "win") {
    // 2. Gestion stricte des séries (streaks)
    after.current_streak = Math.max(1, after.current_streak + 1);
    
    // 3. Bornage obligatoire des nouvelles notes
    after.rating_victory = clampStat(after.rating_victory + 2);
  }
  // ...
  return after;
}
```

- **Clonage des données** : Protège le profil d'origine en cas d'erreur.
- **Séries sécurisées** : Passage mathématique précis d'une série positive à négative.
- **Bornage obligatoire** : `clampStat()` empêche les notes irréalistes (ex: 105 ou -5).

**Présenté par : Anas**

**À dire :**

> L'enjeu principal de cet algorithme était d'éviter les bugs qui pourraient casser le profil d'un joueur. 
> Premièrement, on clone toujours les statistiques avant de les modifier. Ainsi, si une erreur survient pendant le calcul, le profil d'origine n'est pas corrompu. 
> Ensuite, nous avons sécurisé les mathématiques : les séries de victoires et de défaites basculent correctement, et une fonction de bornage (`clampStat`) s'assure qu'aucun joueur ne puisse dépasser la note de 99 ou descendre en dessous de 1.

---

## Diapo 16 — Code à montrer pendant l'oral (Explication métier)

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9. Génère une diapositive 16:9. Titre : **Code présenté : Impact Collectif vs Individuel**. Affiche deux blocs de code stylisés. Premier bloc : code gérant les buts individuels (`after.rating_shot = clampStat(...)`). Deuxième bloc : code gérant l'impact de l'équipe (`after.rating_defense = ...`). Ajoutez des légendes claires : "Valorisation individuelle" et "Solidité d'équipe".

**Contenu à afficher sur la slide :**

**Impact de la performance INDIVIDUELLE :**
```javascript
// Chaque but augmente la note de Frappe
after.rating_shot = clampStat(after.rating_shot + goals * 2);

// Chaque passe décisive augmente la note de Passe
after.rating_pass = clampStat(after.rating_pass + assists * 2);
```

**Impact du résultat COLLECTIF :**
```javascript
// La note de Défense dépend de la solidité globale de l'équipe
after.rating_defense = clampStat(
  after.rating_defense + (result === "win" ? 1 : result === "loss" ? -1 : 0)
);
```

**Présenté par : Anas + Imade**

**À dire :**

> Si l'on rentre dans le détail du code métier, l'algorithme croise la performance individuelle et le résultat collectif. 
> Un joueur qui perd un match verra sa note de victoire baisser. MAIS s'il a marqué deux buts pendant cette défaite, sa note individuelle de Frappe augmentera tout de même. 
> Inversement, un joueur qui ne marque pas mais dont l'équipe gagne verra sa note de Défense augmenter. Cet équilibre garantit que le système récompense à la fois le jeu d'équipe et le talent individuel, ce qui rend l'application très addictive pour les utilisateurs.

---

## Diapo 17 — Impact dans l'application

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 sobre et académique aux couleurs Polytech Montpellier : fond clair, bleu Polytech, vert Polytech. Titre : **Impact dans l'application**. Montre un enchaînement visuel après la sauvegarde d'un match : résumé du match, carte FUT mise à jour, historique profil, classement recalculé. Utilise des flèches simples et des maquettes abstraites. Ne pas ajouter d'information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

Après sauvegarde du match :

- Le résumé du match s'affiche
- Les statistiques des joueurs changent
- Le profil joueur affiche les derniers matchs
- Le classement est recalculé
- L'historique permet de voir l'évolution

**Présenté par : Imade**

**À dire :**

> Côté interface, l'utilisateur voit directement l'impact du match. Sa carte FUT est mise à jour, son historique affiche les derniers matchs et le classement reflète les nouvelles statistiques.

---

## Diapo 18 — Conclusion

**Prompt de génération :**

> Rappel de thème : style académique sobre inspiré de Polytech Montpellier, format 16:9, fond blanc ou gris très clair, accents bleu Polytech #005AAA et vert Polytech #95C11F, texte gris foncé, icônes simples, blocs arrondis, beaucoup d'espace blanc, aucune date, année, numéro de version ou information susceptible de devenir obsolète. Génère une diapositive 16:9 de conclusion, sobre et académique, avec le thème Polytech Montpellier : fond blanc/gris clair, bleu Polytech, vert Polytech. Titre : **Conclusion**. Affiche une liste de réussites avec coches : frontend/backend/BD/Docker/CI, temps réel, sécurité access/refresh tokens, rôles admin/fan, statistiques dynamiques, Docker Compose unique. En bas, ajoute une phrase courte : **LiveFootStats transforme un match en données exploitables en temps réel.** Ne pas ajouter d'information temporaire ou susceptible de devenir obsolète.

**Contenu à afficher :**

- Projet complet : frontend, backend, BD, Docker, CI
- Temps réel fonctionnel
- Sécurité avec access/refresh tokens
- Rôles utilisateur/admin
- Statistiques dynamiques après match
- Déploiement reproductible avec Docker Compose

**Présenté par : Lahcen puis conclusion par Imade**

**À dire :**

> Pour conclure, LiveFootStats respecte les contraintes techniques demandées : frontend sans framework, backend REST et WebSocket, base PostgreSQL, Docker Compose unique, CI complète et rôles différenciés. La fonctionnalité principale qui donne de la valeur à l'application est la mise à jour automatique des statistiques des joueurs après chaque match.

---

# Répartition détaillée de la parole

## Imade — Frontend / démonstration

Parties à présenter :

- Présentation générale du projet
- Scénario utilisateur
- Fonctionnalités visibles
- Interface frontend
- Live démo
- Impact visuel de l'algorithme sur les profils et le classement

Points importants à dire :

- Le frontend est en HTML/CSS/JS pur
- Les pages sont dynamiques sans framework
- Le temps réel se voit dans deux navigateurs
- Les données du profil et du classement se mettent à jour après un match

---

## Anas — Backend / sécurité / algorithme

Parties à présenter :

- API REST
- WebSocket
- Authentification access/refresh token
- Cookies sécurisés
- Hash des mots de passe avec sel et poivre
- Middlewares de protection
- Algorithme de mise à jour des statistiques

Points importants à dire :

- Les routes sensibles vérifient le token
- Les routes admin vérifient le rôle
- Le refresh token est stocké hashé en base
- L'algorithme sauvegarde l'avant/après des statistiques

---

## Lahcen — Infrastructure / BD / CI

Parties à présenter :

- Docker Compose
- Services frontend/backend/database
- PostgreSQL et modèle de données
- Pipeline GitLab CI
- Build et push des images Docker
- Tests et lint

Points importants à dire :

- Un seul fichier compose
- Front et back séparés
- La CI automatise les vérifications et la publication des images
- La base est normalisée et chaque table a une responsabilité claire

---

# Checklist de démo avant l'oral

À vérifier avant la soutenance :

- [ ] `docker compose up -d --build` fonctionne
- [ ] Frontend accessible
- [ ] Backend accessible
- [ ] Connexion compte Imade OK
- [ ] Connexion compte Anas OK
- [ ] Imade est bien admin
- [ ] Création lobby OK
- [ ] Apparition du lobby en temps réel dans l'autre fenêtre OK
- [ ] Rejoindre lobby OK
- [ ] Changement d'équipe en temps réel OK
- [ ] Lancement match OK
- [ ] Enregistrement but OK
- [ ] Message de but dans le chat OK
- [ ] Fin de match OK
- [ ] Profil joueur mis à jour OK
- [ ] Classement mis à jour OK
- [ ] Page admin accessible OK
- [ ] Pipeline GitLab visible

---

# Questions possibles du professeur et réponses

## Pourquoi plus de cinq tables ?

> La consigne disait environ cinq tables. Nous avons choisi d'en avoir un peu plus pour garder une base propre et normalisée. Par exemple, les buts, les joueurs d'un match, les statistiques, l'historique et les refresh tokens sont des concepts différents, donc ils sont séparés.

## Pourquoi utiliser WebSocket ?

> WebSocket permet de diffuser les événements en temps réel : création de lobby, joueur qui rejoint, changement d'équipe, but, score et messages de chat. Cela évite de demander à l'utilisateur de rafraîchir la page.

## Pourquoi access token + refresh token ?

> L'access token est court pour limiter le risque s'il est compromis. Le refresh token permet de renouveler la session sans redemander le mot de passe. Les deux sont transférés via cookies sécurisés.

## Pourquoi pas de framework frontend ?

> C'était une contrainte du projet. Nous avons donc utilisé HTML, CSS et JavaScript pur avec une logique de rendu dynamique côté navigateur.

## Que fait l'admin de plus qu'un utilisateur normal ?

> L'admin peut accéder à la page d'administration, voir les utilisateurs, modifier les rôles et supprimer des lobbys. Un utilisateur normal peut créer, rejoindre et jouer des matchs.

## Quel est le module le plus intéressant techniquement ?

> L'algorithme de mise à jour des statistiques après match. Il combine résultat collectif, performance individuelle, historique et bornage des notes pour mettre à jour les cartes FUT des joueurs.
