import amqp from 'amqplib';
import { randomUUID } from 'crypto';

let channel: amqp.Channel | null = null;

export interface PieceJointeEvenement {
  bucket: string;
  cle: string;
  nomOriginal: string;
  typeMime: string;
  tailleOctets: number;
  empreinteSha256: string;
}

export interface CourrierCreeEvenement {
  numero: string;
  type: string;
  objet: string;
  expediteur: string;
  dateCourrier: string | null;
  priorite: string;
  confidentiel: boolean;
  serviceCode: string | null;
  destinataireSlackId: string | null;
  agentSlackId: string | null;
  pieceJointe: PieceJointeEvenement | null;
}

export async function getChannel(): Promise<amqp.Channel> {
  if (channel) return channel;

  const connection = await amqp.connect(process.env.RABBITMQ_URL!);
  channel = await connection.createChannel();
  await channel.assertExchange(
    process.env.RABBITMQ_EXCHANGE || 'courrier.events',
    'topic',
    { durable: true },
  );
  return channel;
}

export async function publishCourrierCree(payload: CourrierCreeEvenement) {
  const ch = await getChannel();
  const message = JSON.stringify({
    eventId: randomUUID(),
    type: 'courrier.cree',
    version: 1,
    emisLe: new Date().toISOString(),
    emisPar: 'service-courrier',
    numero: payload.numero,
    donnees: {
      type: payload.type,
      objet: payload.objet,
      expediteur: payload.expediteur,
      dateCourrier: payload.dateCourrier,
      priorite: payload.priorite,
      confidentiel: payload.confidentiel,
      serviceCode: payload.serviceCode,
      destinataireSlackId: payload.destinataireSlackId,
      agentSlackId: payload.agentSlackId,
      pieceJointe: payload.pieceJointe,
    },
  });

  ch.publish(
    process.env.RABBITMQ_EXCHANGE || 'courrier.events',
    'courrier.cree',
    Buffer.from(message),
    { persistent: true, contentType: 'application/json' },
  );

  console.log(`[RabbitMQ] Publié courrier.cree -> ${payload.numero}`);
}
