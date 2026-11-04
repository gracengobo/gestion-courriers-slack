import amqp from "amqplib";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

const numero = process.argv[2] ?? "CE-2026-0042";

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
    confidentiel: false,
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

console.log("[service-ia] message de test envoye : " + numero);

await canal.close();
await connexion.close();