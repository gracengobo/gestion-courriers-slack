import amqp, { type Channel, type ConsumeMessage } from "amqplib";
import { config } from "../config";
import { traiterEvenement } from "../evenements";
import type { Enveloppe } from "../types";

const FILES = [
  { nom: "notification.courrier.cree", cle: "courrier.cree" },
  { nom: "notification.courrier.analyse", cle: "courrier.analyse" },
  { nom: "notification.courrier.affecte", cle: "courrier.affecte" },
  { nom: "notification.courrier.statut_change", cle: "courrier.statut_change" },
];
const FILE_ERREURS = "notification.courrier.erreurs";
const NB_TENTATIVES = 3;
const ATTENTE_MS = 5000;

function attendre(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connecterRabbit(): Promise<{ connexion: amqp.ChannelModel; canal: Channel }> {
  const connexion = await amqp.connect(config.rabbitmqUrl);
  const canal = await connexion.createChannel();

  await canal.assertExchange(config.exchange, "topic", { durable: true });
  for (const file of FILES) {
    await canal.assertQueue(file.nom, { durable: true });
    await canal.bindQueue(file.nom, config.exchange, file.cle);
  }
  await canal.assertQueue(FILE_ERREURS, { durable: true });

  return { connexion, canal };
}

async function consommer(canal: Channel, file: string): Promise<void> {
  await canal.consume(file, async (brut: ConsumeMessage | null) => {
    if (!brut) return;

    let message: Enveloppe<unknown>;
    try {
      message = JSON.parse(brut.content.toString("utf-8")) as Enveloppe<unknown>;
    } catch {
      console.error(
        `[service-notification] message illisible dans ${file}, envoyé dans ${FILE_ERREURS}`,
      );
      canal.sendToQueue(FILE_ERREURS, brut.content, { persistent: true });
      canal.ack(brut);
      return;
    }

    for (let essai = 1; essai <= NB_TENTATIVES; essai += 1) {
      try {
        await traiterEvenement(message);
        canal.ack(brut);
        return;
      } catch (error) {
        console.error(
          `[service-notification] ${message.numero} tentative ${essai}/${NB_TENTATIVES} échouée: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        if (essai < NB_TENTATIVES) await attendre(ATTENTE_MS);
      }
    }

    canal.sendToQueue(FILE_ERREURS, brut.content, { persistent: true });
    canal.ack(brut);
    console.error(`[service-notification] ${message.numero} envoyé dans ${FILE_ERREURS}`);
  });
}

export async function demarrerConsommateur(canal: Channel): Promise<void> {
  await canal.prefetch(1);
  for (const file of FILES) {
    await consommer(canal, file.nom);
  }
  console.log(`[service-notification] écoute ${FILES.map((file) => file.nom).join(", ")}`);
}
