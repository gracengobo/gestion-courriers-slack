import amqp, { type Channel, type ConsumeMessage } from "amqplib";
import { config } from "../config";
import { traiterEvenement, type Enveloppe } from "../evenements";

const FILE_COURRIER = "workflow.courrier.cree";
const FILE_RETARD = "workflow.courrier.en_retard";
const FILE_ERREURS = "workflow.courrier.erreurs";
const NB_TENTATIVES = 3;
const ATTENTE_MS = 5000;

function attendre(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connecterRabbit(): Promise<{ connexion: amqp.ChannelModel; canal: Channel }> {
  const connexion = await amqp.connect(config.rabbitmqUrl);
  const canal = await connexion.createChannel();

  await canal.assertExchange(config.exchange, "topic", { durable: true });
  await canal.assertQueue(FILE_COURRIER, { durable: true });
  await canal.bindQueue(FILE_COURRIER, config.exchange, "courrier.cree");
  await canal.assertQueue(FILE_RETARD, { durable: true });
  await canal.bindQueue(FILE_RETARD, config.exchange, "courrier.en_retard");
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
      console.error(`[service-workflow] message illisible dans ${file}, envoyé dans ${FILE_ERREURS}`);
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
          `[service-workflow] ${message.numero} tentative ${essai}/${NB_TENTATIVES} échouée: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        if (essai < NB_TENTATIVES) await attendre(ATTENTE_MS);
      }
    }

    canal.sendToQueue(FILE_ERREURS, brut.content, { persistent: true });
    canal.ack(brut);
    console.error(`[service-workflow] ${message.numero} envoyé dans ${FILE_ERREURS}`);
  });
}

export async function demarrerConsommateur(canal: Channel): Promise<void> {
  await canal.prefetch(1);
  await consommer(canal, FILE_COURRIER);
  await consommer(canal, FILE_RETARD);
  console.log(
    `[service-workflow] écoute ${FILE_COURRIER} et ${FILE_RETARD}`,
  );
}
