import { config } from "./config.js";

console.log("[service-ia] demarrage");
console.log("[service-ia] base :", config.databaseUrl.split("@")[1]);
console.log("[service-ia] bucket :", config.minioBucket);