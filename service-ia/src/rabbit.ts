import amqp from "amqplib";
import { config } from "./config.js";

export const FILE_ENTREE = "ia.courrier.cree";
export const FILE_ERREURS = "ia.courrier.cree.erreurs";

// Se connecte a RabbitMQ et prepare l'exchange et les files
export async function connecterRabbit() {
  const connexion = await amqp.connect(config.rabbitmqUrl);
  const canal = await connexion.createChannel();

  await canal.assertExchange(config.rabbitmqExchange, "topic", { durable: true });
  await canal.assertQueue(FILE_ERREURS, { durable: true });
  await canal.assertQueue(FILE_ENTREE, { durable: true });
  await canal.bindQueue(FILE_ENTREE, config.rabbitmqExchange, "courrier.cree");

  return { connexion, canal };
}