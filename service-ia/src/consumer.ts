import type { Channel, ConsumeMessage } from "amqplib";
import { FILE_ENTREE, FILE_ERREURS } from "./rabbit.js";
import type { Enveloppe } from "./types.js";

const NB_TENTATIVES = 3;
const ATTENTE_MS = 5000;

function attendre(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Ecoute la file et appelle "traiter" pour chaque message
export async function demarrerConsommateur(
  canal: Channel,
  traiter: (message: Enveloppe) => Promise<void>
) {
  // un message a la fois
  await canal.prefetch(1);

  await canal.consume(FILE_ENTREE, async (brut: ConsumeMessage | null) => {
    if (!brut) return;

    // 1. lire le JSON
    let message: Enveloppe;
    try {
      message = JSON.parse(brut.content.toString("utf-8"));
    } catch {
      console.error("[service-ia] message illisible, envoye dans la file erreurs");
      canal.sendToQueue(FILE_ERREURS, brut.content, { persistent: true });
      canal.ack(brut);
      return;
    }

    // 2. traiter, avec 3 tentatives
    for (let essai = 1; essai <= NB_TENTATIVES; essai++) {
      try {
        await traiter(message);
        canal.ack(brut);
        return;
      } catch (erreur) {
        console.error("[service-ia] " + message.numero + " echec tentative " + essai + "/" + NB_TENTATIVES, erreur);
        if (essai < NB_TENTATIVES) {
          await attendre(ATTENTE_MS);
        }
      }
    }

    // 3. toujours en echec : file erreurs
    canal.sendToQueue(FILE_ERREURS, brut.content, { persistent: true });
    canal.ack(brut);
    console.error("[service-ia] " + message.numero + " envoye dans la file erreurs");
  });
}