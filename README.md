# LiveFootStats ⚽

**Projet Académique — Polytech Montpellier**

**Équipe de développement :**
- Imade Mouri (Frontend, UI, Intégration temps réel)
- Anas Saber (Backend, API REST, WebSocket, Sécurité, Algorithmes)
- Lahcen Bouikiouch (Infrastructure Docker, PostgreSQL, Intégration Continue CI)

---

## 📖 Présentation

LiveFootStats est une application web complète permettant la gestion de matchs de football en temps réel. Elle propose un système de création de lobbys, de répartition des équipes, de suivi du score en direct et de calcul dynamique des statistiques des joueurs (façon "cartes FUT").

Le projet a été développé dans le strict respect des contraintes académiques : aucun framework structurant côté frontend, communication REST et WebSocket, sécurité renforcée (JWT, cookies sécurisés, hachage avec sel/poivre), architecture Docker unifiée et pipeline d'intégration continue (GitLab CI).

---

## 🛠 Architecture et Technologies

### 🖥 Frontend
- **Technologies :** HTML5, CSS3, JavaScript Vanilla (aucun framework).
- **Communication :** Fetch API (REST) et WebSocket (Temps réel).
- **Serveur :** Nginx (Déploiement statique).

### ⚙️ Backend
- **Technologies :** Deno (JavaScript/TypeScript runtime).
- **Architecture :** API REST + Serveur WebSocket.
- **Sécurité :** HTTPS, CORS, Access Token (15 min) + Refresh Token (7 jours), Cookies `HttpOnly`/`Secure`, Hash des mots de passe (sel + poivre).

### 🗄 Base de données
- **Technologie :** PostgreSQL 16.
- **Modèle :** Architecture normalisée répartie sur plusieurs tables isolant les responsabilités (Utilisateurs, Matchs, Équipes, Buts, Statistiques, Changements d'état, Tokens).

### 🚀 DevOps & CI/CD
- **Déploiement :** Fichier `docker-compose.yml` unique regroupant Frontend, Backend et Base de données.
- **Intégration Continue :** Pipeline GitLab exécutant le Lint, les Tests unitaires, et la construction automatique des images Docker vers le Container Registry.

---

## 🐳 Guide de déploiement Docker

Prérequis : Avoir **Docker** et **Docker Compose** installés sur votre machine.

1. **Cloner le dépôt** et se placer à la racine du projet.
2. **Configuration** : Un fichier `.env` peut être configuré à la racine pour modifier les mots de passe et secrets (un fichier `.env.example` est fourni, par défaut les valeurs de développement sont utilisées).
3. **Lancer l'application** :

```bash
docker compose up --build -d
```

4. **Arrêter l'application** :

```bash
docker compose down
```

---

## 🔗 Accès et Comptes de Test

Une fois les conteneurs démarrés, l'application est accessible aux adresses suivantes :

* **Interface Utilisateur (Nginx)** : [http://localhost:8080](http://localhost:8080)
* **Serveur API Backend (Deno HTTPS)** : [https://localhost:3000](https://localhost:3000)

### 🧪 Comptes préconfigurés

La base de données s'initialise automatiquement avec plusieurs comptes de test.

**Administrateur :**
* **Username** : `imade` / **Password** : `imade`
*(Permet d'accéder à la page de gestion des rôles `/admin` et de supprimer n'importe quel lobby).*

**Utilisateurs standards (Fans) :**
* **Username** : `imade_test` / **Password** : `imade_test`
* **Username** : `supporter99` / **Password** : `supporter99`

> **Note de sécurité :** Si vous tentez d'accéder à l'interface sans être connecté, l'application refusera l'accès et vous redirigera automatiquement vers la page de connexion, démontrant le bon fonctionnement des middlewares de protection.
