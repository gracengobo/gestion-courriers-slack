import amqp from "amqplib";
import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { extname } from "node:path";
import { config } from "./config.js";
import { deposerScanTest } from "./storage.js";

const chemin = process.argv[2];
const numero = process.argv[3] ?? "CE-2026-0043";

if (!chemin) {
  console.error("Utilisation : npx tsx src/envoyer-scan.ts <chemin du fichier> [numero]");
  process.exit(1);
}

const extension = extname(chemin).toLowerCase();
const types: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png"
};
const typeMime = types[extension];
if (!typeMime) {
  console.error("Type non admis (PDF, JPG ou PNG seulement)");
  process.exit(1);
}

const cle = "2026/" + randomUUID() + extension;
await deposerScanTest(config.minioBucket, cle, chemin, typeMime);
console.log("[service-ia] scan depose dans MinIO : " + cle);

const message = {
  eventId: randomUUID(),
  type: "courrier.cree",
  version: 1,
  emisLe: new Date().toISOString(),
  emisPar: "service-courrier",
  numero: numero,
  donnees: {
    type: "ENTRANT",
    objet: "Courrier de test avec scan",
    expediteur: "Test",
    dateCourrier: "2026-11-05",
    priorite: "NORMALE",
    confidentiel: false,
    serviceCode: null,
    destinataireSlackId: null,
    agentSlackId: "U02DEF45",
    pieceJointe: {
      bucket: config.minioBucket,
      cle: cle,
      nomOriginal: "test" + extension,
      typeMime: typeMime,
      tailleOctets: statSync(chemin).size,
      empreinteSha256: "test"
    }
  }
};

const connexion = await amqp.connect(config.rabbitmqUrl);
const canal = await connexion.createChannel();
canal.publish(
  config.rabbitmqExchange,
  "courrier.cree",
  Buffer.from(JSON.stringify(message)),
  { persistent: true, contentType: "application/json" }
);
console.log("[service-ia] message envoye : " + numero);

await canal.close();
await connexion.close();