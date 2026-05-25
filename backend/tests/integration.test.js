Deno.test("Test d'intégration : Le Backend accepte les requêtes du Frontend (CORS)", async () => {
    // Appel au port 3000 en se faisant passer pour le port 8080
    const response = await fetch("https://localhost:3000/", { 
        method: "OPTIONS",
        headers: {
            "Origin": "http://localhost:8080"
        }
    });

    const corsHeader = response.headers.get("access-control-allow-origin");
    
    if (corsHeader !== "http://localhost:8080") {
        throw new Error("Échec : Le CORS est mal configuré sur le backend.");
    }
});