import "dotenv/config";
import { config } from "./config";
import { prisma } from "./prisma";
import { demarrerCron } from "./cron";
import { connecterRabbit, demarrerConsommateur } from "./rabbitmq/consumer";
import { executerRappels } from "./services/notification.service";
import { slackActif } from "./slack";

let arretDemande = false;

async function connecterRabbitSansArret(): Promise<void> {
  while (!arretDemande) {
    try {
      const { canal } = await connecterRabbit();
      await demarrerConsommateur(canal);
      return;
    } catch (error) {
      console.error(
        `[service-notification] RabbitMQ indisponible, nouvelle tentative dans 5 s : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function principal(): Promise<void> {
  if (!slackActif()) {
    console.warn(
      "[service-notification] SLACK_BOT_TOKEN absent : les messages Slack seront seulement journalisés.",
    );
  }

  demarrerCron();
  await executerRappels().catch((error: unknown) => {
    console.error(
      `[service-notification] rattrapage des rappels impossible : ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
  await connecterRabbitSansArret();

  process.on("SIGINT", async () => {
    arretDemande = true;
    await prisma.$disconnect();
    process.exit(0);
  });
}

principal().catch(async (error: unknown) => {
  console.error(
    `[service-notification] démarrage impossible : ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  await prisma.$disconnect();
  process.exit(1);
});
