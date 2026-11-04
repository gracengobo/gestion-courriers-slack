import amqp from "amqplib";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

// Utilisation : npx tsx src/envoyer-test.ts [numero] [confidentiel]
const numero = process.argv[2] ?? "CE-2026-0042";
const confidentiel = process.argv[3] === "confidentiel";

const message = {
  eventId: randomUUID(),
  type: "courrier.cree",
  version: 1,
  emisLe: new Date().toISOString(),
  emisPar: "service-courrier",
  numero: numero,
  donnees: {
    type: "ENTRANT",
    objet: "Demande de bourse",
    expediteur: "Mme Ngo",
    dateCourrier: "2026-11-05",
    priorite: "NORMALE",
    confidentiel: confidentiel,
    serviceCode: null,
    destinataireSlackId: null,
    agentSlackId: "U02DEF45",
    pieceJointe: null
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

console.log("[service-ia] message de test envoye : " + numero + (confidentiel ? " (confidentiel)" : ""));

await canal.close();
await connexion.close();