const cert = Deno.readTextFileSync("./certs/server.crt");
const key = Deno.readTextFileSync("./certs/server.key");

console.log(" Backend Deno prêt sur https://localhost:3000");

Deno.serve({ port: 3000, cert, key }, (req) => {
  return new Response(JSON.stringify({ message: "API Foot fonctionnelle !" }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "http://localhost:8080", // CORS pour le front
      "Access-Control-Allow-Credentials": "true"
    }
  });
});

