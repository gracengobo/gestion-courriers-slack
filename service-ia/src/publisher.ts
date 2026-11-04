import type { Channel } from "amqplib";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import type { DonneesAnalyse } from "./types.js";

// Publie courrier.analyse (voir CONTRATS.md partie 3)
export function publierAnalyse(canal: Channel, numero: string, donnees: DonneesAnalyse) {
  const message = {
    eventId: randomUUID(),
    type: "courrier.analyse",
    version: 1,
    emisLe: new Date().toISOString(),
    emisPar: "service-ia",
    numero: numero,
    donnees: donnees
  };

  canal.publish(
    config.rabbitmqExchange,
    "courrier.analyse",
    Buffer.from(JSON.stringify(message)),
    { persistent: true, contentType: "application/json" }
  );
  console.log("[service-ia] " + numero + " courrier.analyse publie (" + donnees.statutAnalyse + ")");
}