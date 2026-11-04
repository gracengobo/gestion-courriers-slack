import { readFileSync } from "node:fs";
import pg from "pg";
import { config } from "./config.js";

const sql = readFileSync(new URL("../sql/schema.sql", import.meta.url), "utf-8");

const client = new pg.Client({ connectionString: config.databaseUrl });

try {
  await client.connect();
  await client.query(sql);
  console.log("[service-ia] tables creees dans ia_db");
} catch (erreur) {
  console.error("[service-ia] erreur base :", erreur);
  process.exitCode = 1;
} finally {
  await client.end();
}