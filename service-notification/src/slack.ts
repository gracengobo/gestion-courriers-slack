import { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import { config } from "./config";

export interface MessageEnvoye {
  canal: string;
  ts: string;
}

const client = config.slackToken ? new WebClient(config.slackToken) : null;

export function slackActif(): boolean {
  return client !== null;
}

function exigerClient(): WebClient {
  if (!client) {
    throw new Error("SLACK_BOT_TOKEN est absent : impossible d'envoyer un message Slack.");
  }
  return client;
}

export async function envoyerDm(
  userId: string,
  texte: string,
  blocs?: KnownBlock[],
): Promise<MessageEnvoye | null> {
  if (!client) {
    console.warn(`[service-notification] Slack désactivé, message non envoyé à ${userId} : ${texte}`);
    return null;
  }

  const conversation = await exigerClient().conversations.open({ users: userId });
  const canal = conversation.channel?.id;
  if (!canal) {
    throw new Error(`Impossible d'ouvrir la conversation privée avec ${userId}.`);
  }

  const resultat = await exigerClient().chat.postMessage({
    channel: canal,
    text: texte,
    blocks: blocs,
  });
  if (!resultat.ts) {
    throw new Error(`Slack n'a pas retourné d'identifiant de message pour ${userId}.`);
  }

  return { canal, ts: resultat.ts };
}

export async function mettreAJourMessage(
  canal: string,
  ts: string,
  texte: string,
  blocs?: KnownBlock[],
): Promise<void> {
  if (!client) {
    console.warn(`[service-notification] Slack désactivé, message ${ts} non mis à jour.`);
    return;
  }

  await exigerClient().chat.update({
    channel: canal,
    ts,
    text: texte,
    blocks: blocs,
  });
}
