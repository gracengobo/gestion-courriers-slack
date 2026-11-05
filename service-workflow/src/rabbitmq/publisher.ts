import amqp from "amqplib";
import { randomUUID } from "node:crypto";
import { config } from "../config";

let channel: amqp.Channel | null = null;

export async function getChannel(): Promise<amqp.Channel> {
  if (channel) return channel;

  const connexion = await amqp.connect(config.rabbitmqUrl);
  channel = await connexion.createChannel();
  await channel.assertExchange(config.exchange, "topic", { durable: true });
  connexion.on("close", () => {
    channel = null;
  });
  return channel;
}

async function publier(type: string, numero: string, donnees: object): Promise<void> {
  const canal = await getChannel();
  const message = {
    eventId: randomUUID(),
    type,
    version: 1,
    emisLe: new Date().toISOString(),
    emisPar: "service-workflow",
    numero,
    donnees,
  };

  canal.publish(config.exchange, type, Buffer.from(JSON.stringify(message)), {
    persistent: true,
    contentType: "application/json",
  });
  console.log(`[service-workflow] ${type} publié pour ${numero}`);
}

export interface AffectationDonnees {
  destinataireSlackId: string;
  ancienDestinataireSlackId: string | null;
  serviceCode: string | null;
  responsableSlackId: string;
  motif: string | null;
  echeance: string | null;
  objet: string;
  priorite: string;
  confidentiel: boolean;
  agentSlackId: string | null;
  langueDestinataire: string;
}

export function publierAffecte(numero: string, donnees: AffectationDonnees): Promise<void> {
  return publier("courrier.affecte", numero, donnees);
}

export interface StatutChangeDonnees {
  ancienStatut: string;
  nouveauStatut: string;
  acteurSlackId: string;
  destinataireSlackId: string | null;
  agentSlackId: string | null;
  commentaire: string | null;
  motif: string | null;
}

export function publierStatutChange(
  numero: string,
  donnees: StatutChangeDonnees,
): Promise<void> {
  return publier("courrier.statut_change", numero, donnees);
}
