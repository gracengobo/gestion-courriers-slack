import "dotenv/config";

// Lit une variable du fichier .env, et s'arrete avec un message clair si elle manque
function lire(nom: string): string {
  const valeur = process.env[nom];
  if (!valeur) {
    throw new Error("Variable manquante dans .env : " + nom);
  }
  return valeur;
}

export const config = {
  databaseUrl: lire("DATABASE_URL"),
  rabbitmqUrl: lire("RABBITMQ_URL"),
  rabbitmqExchange: lire("RABBITMQ_EXCHANGE"),
  minioEndpoint: lire("MINIO_ENDPOINT"),
  minioPort: Number(lire("MINIO_PORT")),
  minioAccessKey: lire("MINIO_ACCESS_KEY"),
  minioSecretKey: lire("MINIO_SECRET_KEY"),
  minioBucket: lire("MINIO_BUCKET"),
  grpcIaUrl: lire("GRPC_IA_URL"),
  iaFournisseur: process.env.IA_FOURNISSEUR ?? "gemini",
  iaApiKey: process.env.IA_API_KEY ?? ""
};