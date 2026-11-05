import "dotenv/config";
import { resolve } from "node:path";

export const config = {
  rabbitmqUrl: process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672",
  exchange: process.env.RABBITMQ_EXCHANGE ?? "courrier.events",
  slackToken: process.env.SLACK_BOT_TOKEN ?? "",
  cronRappels: process.env.RAPPELS_CRON ?? "0 8 * * *",
  fuseauRappels: process.env.RAPPELS_FUSEAU ?? "UTC",
  i18nDir: process.env.I18N_DIR ?? resolve(__dirname, "../../commun/i18n"),
  langueParDefaut: "fr",
};
