import amqp from "amqplib";
import { randomUUID } from "node:crypto";
import { config } from "../config";

let channel: amqp.Channel | null = null;

async function getChannel(): Promise<amqp.Channel> {
  if (channel) return channel;

  const connexion = await amqp.connect(config.rabbitmqUrl);
  channel = await connexion.createChannel();
  await channel.assertExchange(config.exchange, "topic", { durable: true });
  connexion.on("close", () => {
    channel = null;
  });
  return channel;
}

export async function publierRetard(
  numero: string,
  donnees: {
    echeance: string;
    joursDeRetard: number;
    destinataireSlackId: string;
    responsableSlackId: string | null;
  },
): Promise<void> {
  const canal = await getChannel();
  const message = {
    eventId: randomUUID(),
    type: "courrier.en_retard",
    version: 1,
    emisLe: new Date().toISOString(),
    emisPar: "service-notification",
    numero,
    donnees,
  };

  canal.publish(config.exchange, "courrier.en_retard", Buffer.from(JSON.stringify(message)), {
    persistent: true,
    contentType: "application/json",
  });
  console.log(`[service-notification] courrier.en_retard publié pour ${numero}`);
}
