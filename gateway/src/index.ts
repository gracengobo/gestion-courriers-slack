import { App } from "@slack/bolt";
import { Client } from "minio";
import { config } from "./config";
import { createApp } from "./app";
import { closeGrpcServices, createGrpcServices } from "./grpc";
import { AttachmentStorage } from "./storage";

const services = createGrpcServices({
  courrier: config.grpcCourrierUrl,
  workflow: config.grpcWorkflowUrl,
  ia: config.grpcIaUrl,
});
const minio = new Client({
  endPoint: config.minioEndpoint,
  port: config.minioPort,
  useSSL: config.minioUseSsl,
  accessKey: config.minioAccessKey,
  secretKey: config.minioSecretKey,
});
const app: App = createApp(services, new AttachmentStorage(minio, config.minioBucket));

async function shutdown(signal: string): Promise<void> {
  console.info(`[gateway] arrêt demandé (${signal})`);
  try {
    await app.stop();
  } catch (error) {
    console.error(`[gateway] arrêt Slack Bolt échoué: ${error instanceof Error ? error.message : String(error)}`);
  }
  closeGrpcServices(services);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

app
  .start()
  .then(() => console.info("[gateway] passerelle Slack démarrée en Socket Mode"))
  .catch((error: unknown) => {
    console.error(`[gateway] démarrage échoué: ${error instanceof Error ? error.message : String(error)}`);
    closeGrpcServices(services);
    process.exitCode = 1;
  });
