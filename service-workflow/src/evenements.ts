import {
  enregistrerCourrierCree,
  enregistrerRappelRetard,
  type DonneesCourrierCree,
} from "./services/workflow.service";

export interface Enveloppe<T> {
  eventId: string;
  type: string;
  version: number;
  emisLe: string;
  emisPar: string;
  numero: string;
  donnees: T;
}

export async function traiterEvenement(message: Enveloppe<unknown>): Promise<void> {
  if (message.type === "courrier.cree") {
    await enregistrerCourrierCree(
      message.numero,
      message.donnees as DonneesCourrierCree,
      message.eventId,
    );
    return;
  }
  if (message.type === "courrier.en_retard") {
    await enregistrerRappelRetard(message.eventId, message.numero);
    return;
  }

  console.warn(`[service-workflow] événement ignoré : ${message.type}`);
}
