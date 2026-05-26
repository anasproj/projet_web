# Live Foot Stats ⚽

## 🚀 Lancer l'application

Pour démarrer toute l'application (base de données, backend Deno et frontend Nginx) :

```bash
docker compose up --build -d
```

---

## 🛑 Arrêter l'application

Pour éteindre et supprimer les conteneurs :

```bash
docker compose down
```

---

## 🔗 Adresses de l'application

* **Interface Utilisateur (Frontend)** : [http://localhost:8080](http://localhost:8080)
* **Serveur API (Backend)** : [https://localhost:3000](https://localhost:3000)

---

## 🧪 Comptes de test

Pour vous connecter :
* **Username** : `imade` / **Password** : `imade`
* **Username** : `imade_test` / **Password** : `imade_test`
* **Username** : `supporter99` / **Password** : `supporter99`

---

## 🔒 Tester la sécurité / redirection

* Essayer d'aller sur [http://localhost:8080/#/home](http://localhost:8080/#/home) sans être connecté.
* L'application vous renvoie automatiquement vers [http://localhost:8080/#/login](http://localhost:8080/#/login).
