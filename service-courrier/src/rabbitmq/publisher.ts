import amqp from 'amqplib';

let channel: amqp.Channel | null = null;

export async function getChannel(): Promise<amqp.Channel> {
  if (channel) return channel;

  const connection = await amqp.connect(process.env.RABBITMQ_URL!);
  channel = await connection.createChannel();
  await channel.assertExchange('courrier.events', 'topic', { durable: true });
  return channel;
}

export async function publishCourrierCree(payload: {
  id: string;
  numero: string;
  objet: string;
  destinataire: string;
}) {
  const ch = await getChannel();
  const message = JSON.stringify({
    ...payload,
    event: 'courrier.cree',
    timestamp: new Date().toISOString(),
  });

  ch.publish('courrier.events', 'courrier.cree', Buffer.from(message), {
    persistent: true,
  });

  console.log(`[RabbitMQ] Publié courrier.cree -> ${payload.numero}`);
}
