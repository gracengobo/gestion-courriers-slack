import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variable d'environnement requise manquante: ${name}`);
  }
  return value;
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Valeur invalide pour ${name}: un port entre 1 et 65535 est attendu`);
  }
  return value;
}

export const config = {
  slackBotToken: required("SLACK_BOT_TOKEN"),
  slackAppToken: required("SLACK_APP_TOKEN"),
  slackSigningSecret: required("SLACK_SIGNING_SECRET"),
  grpcCourrierUrl: process.env.GRPC_COURRIER_URL ?? "localhost:50051",
  grpcWorkflowUrl: process.env.GRPC_WORKFLOW_URL ?? "localhost:50052",
  grpcIaUrl: process.env.GRPC_IA_URL ?? "localhost:50053",
  minioEndpoint: process.env.MINIO_ENDPOINT ?? "localhost",
  minioPort: integer("MINIO_PORT", 9000),
  minioAccessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
  minioSecretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin123",
  minioBucket: process.env.MINIO_BUCKET ?? "scans",
  minioUseSsl: process.env.MINIO_USE_SSL === "true",
};
