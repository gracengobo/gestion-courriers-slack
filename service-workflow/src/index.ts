import { config } from "./config";
import { prisma } from "./prisma";
import { demarrerGrpc } from "./server";
import { connecterRabbit, demarrerConsommateur } from "./rabbitmq/consumer";

async function connecterRabbitAvecReprise(): Promise<void> {
  for (;;) {
    try {
      const { canal } = await connecterRabbit();
      await demarrerConsommateur(canal);
      return;
    } catch (error) {
      console.error(
        `[service-workflow] RabbitMQ indisponible, nouvelle tentative dans 5 s: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function main(): Promise<void> {
  console.log("[service-workflow] démarrage");
  console.log(`[service-workflow] base : ${config.databaseUrl.split("@")[1] ?? "non configurée"}`);

  demarrerGrpc();
  await connecterRabbitAvecReprise();
}

process.on("SIGINT", () => {
  void prisma.$disconnect().finally(() => process.exit(0));
});

void main();
