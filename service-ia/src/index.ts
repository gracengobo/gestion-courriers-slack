import { config } from "./config.js";
import { connecterRabbit } from "./rabbit.js";
import { demarrerConsommateur } from "./consumer.js";
import { traiterCourrier } from "./traitement.js";
import { demarrerGrpc } from "./grpc.js";

console.log("[service-ia] demarrage");
console.log("[service-ia] base :", config.databaseUrl.split("@")[1]);

const { canal } = await connecterRabbit();

await demarrerConsommateur(canal, (message) => traiterCourrier(canal, message));
console.log("[service-ia] en attente de courrier.cree");

demarrerGrpc();