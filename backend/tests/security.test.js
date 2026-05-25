import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";
import { assertEquals } from "https://deno.land/std@0.200.0/assert/mod.ts";

Deno.test("Test unitaire : Module de Sécurité et validation des Tokens JWT", async () => {
    // 1. Clé de chiffrement secrète factice pour le test
    const testSecret = "une_super_cle_secrete_de_test_extremement_longue_et_securisee_123456";
    const encoder = new TextEncoder();
    const keyData = encoder.encode(testSecret);
    const jwtKey = await crypto.subtle.importKey(
        "raw", keyData, { name: "HMAC", hash: "SHA-512" }, false, ["sign", "verify"]
    );

    // 2. Payload utilisateur simulant la connexion
    const payload = {
        userId: 99,
        username: "supporter_test",
        role: "fan",
        exp: getNumericDate(60 * 5) // Expire dans 5 minutes
    };

    // 3. Génération du JWT (Étape de chiffrement / Signature)
    const token = await create({ alg: "HS512", typ: "JWT" }, payload, jwtKey);

    // Vérification que le token a bien été généré et ressemble à un JWT (3 parties séparées par des points)
    const parts = token.split(".");
    assertEquals(parts.length, 3);

    // 4. Décodage et vérification du JWT (Étape de vérification de signature)
    const verifiedPayload = await verify(token, jwtKey);

    // Validation des données décodées
    assertEquals(verifiedPayload.userId, 99);
    assertEquals(verifiedPayload.username, "supporter_test");
    assertEquals(verifiedPayload.role, "fan");
});
