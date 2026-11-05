import { prisma } from "./prisma";
import {
  traiterCourrierAffecte,
  traiterCourrierAnalyse,
  traiterCourrierCree,
  traiterStatutChange,
} from "./services/notification.service";
import type {
  DonneesCourrierAffecte,
  DonneesCourrierAnalyse,
  DonneesCourrierCree,
  DonneesStatutChange,
  Enveloppe,
} from "./types";

export async function traiterEvenement(message: Enveloppe<unknown>): Promise<void> {
  if (!message?.eventId || !message.type || !message.numero) {
    throw new Error("Enveloppe invalide : eventId, type et numero sont obligatoires.");
  }

  const deja = await prisma.evenementTraite.findUnique({
    where: { eventId: message.eventId },
  });
  if (deja) {
    console.log(`[service-notification] ${message.numero} événement ${message.eventId} déjà traité.`);
    return;
  }

  switch (message.type) {
    case "courrier.cree":
      await traiterCourrierCree(message.numero, message.donnees as DonneesCourrierCree);
      break;
    case "courrier.analyse":
      await traiterCourrierAnalyse(message.numero, message.donnees as DonneesCourrierAnalyse);
      break;
    case "courrier.affecte":
      await traiterCourrierAffecte(message.numero, message.donnees as DonneesCourrierAffecte);
      break;
    case "courrier.statut_change":
      await traiterStatutChange(message.numero, message.donnees as DonneesStatutChange);
      break;
    default:
      console.warn(`[service-notification] événement ignoré : ${message.type}`);
      return;
  }

  await prisma.evenementTraite.create({
    data: { eventId: message.eventId, type: message.type },
  });
}
