import { Client } from "minio";
import { config } from "./config.js";

const minio = new Client({
  endPoint: config.minioEndpoint,
  port: config.minioPort,
  useSSL: false,
  accessKey: config.minioAccessKey,
  secretKey: config.minioSecretKey
});

// Lit un fichier dans MinIO et le renvoie en memoire
export async function lireScan(bucket: string, cle: string): Promise<Buffer> {
  const flux = await minio.getObject(bucket, cle);
  const morceaux: Buffer[] = [];
  for await (const morceau of flux) {
    morceaux.push(morceau as Buffer);
  }
  return Buffer.concat(morceaux);
}

// Depose un fichier local dans MinIO (utilise seulement pour les tests)
export async function deposerScanTest(bucket: string, cle: string, cheminLocal: string, typeMime: string) {
  await minio.fPutObject(bucket, cle, cheminLocal, { "Content-Type": typeMime });
}