import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { extraireTexte } from "./ocr.js";
import { analyserTexte } from "./llm.js";

// Test du chemin complet fichier -> OCR -> analyse : npx tsx src/test-ocr.ts <fichier> [numero]
const chemin = process.argv[2];
const numero = process.argv[3] ?? "CE-2026-0100";

if (!chemin) {
  console.error("Utilisation : npx tsx src/test-ocr.ts <fichier.pdf|jpg|png> [numero]");
  process.exit(1);
}

const types: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png"
};
const typeMime = types[extname(chemin).toLowerCase()];
if (!typeMime) {
  console.error("Type non admis (PDF, JPG ou PNG seulement)");
  process.exit(1);
}

const contenu = readFileSync(chemin);
console.log("[service-ia] " + numero + " lecture de " + chemin + " (" + contenu.length + " octets, " + typeMime + ")");

const texte = await extraireTexte(contenu, typeMime);
console.log("--- texte extrait (" + texte.length + " caracteres) ---");
console.log(texte.slice(0, 600));

const resultat = await analyserTexte({
  numero,
  texte,
  langue: "fr",
  servicesConnus: ["SCOLARITE", "FINANCES", "RH"]
});
console.log("--- analyse ---");
console.log(resultat);
