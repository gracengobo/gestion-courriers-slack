import amqp from "amqplib";
import { config } from "./config.js";

const connexion = await amqp.connect(config.rabbitmqUrl);
const canal = await connexion.createChannel();

await canal.assertExchange(config.rabbitmqExchange, "topic", { durable: true });
const file = await canal.assertQueue("", { exclusive: true });
await canal.bindQueue(file.queue, config.rabbitmqExchange, "courrier.analyse");

console.log("[service-ia] ecoute de courrier.analyse (Ctrl + C pour arreter)");

await canal.consume(file.queue, (brut) => {
  if (!brut) return;
  const message = JSON.parse(brut.content.toString("utf-8"));
  console.log(JSON.stringify(message, null, 2));
  canal.ack(brut);
});