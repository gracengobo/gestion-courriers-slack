import grpc from "@grpc/grpc-js";
import { config } from "./config.js";
import { chargerPackage } from "./grpc.js";

const paquet = chargerPackage();
const port = config.grpcIaUrl.split(":")[1] ?? "50053";
const client = new paquet.IAService("localhost:" + port, grpc.credentials.createInsecure());

// Appelle une methode et renvoie la reponse ou l'erreur
function appeler(methode: string, requete: object): Promise<unknown> {
  return new Promise((resolve) => {
    client[methode](requete, (e: any, reponse: unknown) => {
      if (e) {
        resolve({ erreur: e.code + " / " + e.metadata.get("code-metier") + " / " + e.details });
      } else {
        resolve(reponse);
      }
    });
  });
}

async function montrer(titre: string, methode: string, requete: object) {
  console.log("--- " + titre);
  console.log(await appeler(methode, requete));
}

await montrer("analyse existante", "obtenirAnalyse", { acteurSlackId: "U02DEF45", numero: "CE-2026-0044" });
await montrer("analyse inconnue", "obtenirAnalyse", { acteurSlackId: "U02DEF45", numero: "CE-2026-0000" });
await montrer("decision VALIDEE", "enregistrerDecision", { acteurSlackId: "U03GHI67", numero: "CE-2026-0044", decision: "VALIDEE" });
await montrer("correction sans rien", "enregistrerDecision", { acteurSlackId: "U03GHI67", numero: "CE-2026-0044", decision: "CORRIGEE" });
await montrer("recherche (pas encore dispo)", "interpreterRecherche", { acteurSlackId: "U02DEF45", phrase: "courriers urgents", langue: "fr" });

client.close();