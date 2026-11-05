import { interpreterRecherche } from "./recherche.js";

// Test de la recherche en langage courant : npx tsx src/test-recherche.ts
const essais: { nom: string; langue: "fr" | "en"; phrase: string }[] = [
  { nom: "urgents scolarite non traites", langue: "fr", phrase: "courriers urgents de la scolarite non traites" },
  { nom: "factures traitees", langue: "fr", phrase: "factures financieres traitees" },
  { nom: "conges RH recus", langue: "fr", phrase: "demandes de conge RH recues" },
  { nom: "periode", langue: "fr", phrase: "courriers recus entre le 1er et le 30 novembre 2026" },
  { nom: "english", langue: "en", phrase: "urgent unpaid invoices from finance this month" }
];

let echecs = 0;

for (const e of essais) {
  console.log("--- " + e.nom + " : " + e.phrase);
  try {
    const filtres = await interpreterRecherche(e.phrase, e.langue);
    console.log(filtres);
  } catch (erreur) {
    echecs += 1;
    console.log("ERREUR :", (erreur as Error).message);
  }
}

console.log("--- " + (essais.length - echecs) + "/" + essais.length + " recherches reussies");
process.exitCode = echecs === 0 ? 0 : 1;
