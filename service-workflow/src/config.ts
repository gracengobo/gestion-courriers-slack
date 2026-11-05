import dotenv from "dotenv";

dotenv.config();

function entier(valeur: string | undefined, defaut: number): number {
  const converti = Number(valeur);
  return Number.isFinite(converti) && converti > 0 ? Math.trunc(converti) : defaut;
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  rabbitmqUrl: process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672",
  exchange: process.env.RABBITMQ_EXCHANGE ?? "courrier.events",
  grpcPort: process.env.GRPC_PORT ?? "50052",
  delaiOuvrableJours: entier(process.env.DELAI_OUVRABLE_JOURS, 5),
  roleParDefaut: process.env.WORKFLOW_ROLE_PAR_DEFAUT ?? "SECRETARIAT",
};
