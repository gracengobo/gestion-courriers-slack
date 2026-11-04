import { config } from "./config.js";
import { connecterRabbit } from "./rabbit.js";
import { demarrerConsommateur } from "./consumer.js";
import type { Enveloppe } from "./types.js";

console.log("[service-ia] demarrage");
console.log("[service-ia] base :", config.databaseUrl.split("@")[1]);

const { canal } = await connecterRabbit();

// Pour l'instant : on affiche seulement le message (le vrai travail viendra apres)
async function traiter(message: Enveloppe) {
  // TEMPORAIRE : simule une panne pour tester les 3 tentatives
  if (message.numero === "CE-2026-9999") {
    throw new Error("panne simulee");
  }
  console.log("[service-ia] " + message.numero + " message recu : " + message.donnees.objet);
}

await demarrerConsommateur(canal, traiter);
console.log("[service-ia] en attente de courrier.cree");