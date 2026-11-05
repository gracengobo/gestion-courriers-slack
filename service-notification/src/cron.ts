import cron from "node-cron";
import { config } from "./config";
import { executerRappels } from "./services/notification.service";

export function demarrerCron(): void {
  cron.schedule(
    config.cronRappels,
    async () => {
      try {
        await executerRappels();
      } catch (error) {
        console.error(
          `[service-notification] échec des rappels : ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    { timezone: config.fuseauRappels },
  );

  console.log(
    `[service-notification] rappels planifiés « ${config.cronRappels} » (${config.fuseauRappels})`,
  );
}
