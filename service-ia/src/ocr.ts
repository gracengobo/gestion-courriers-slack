import { createWorker } from "tesseract.js";
import { extractText, getDocumentProxy } from "unpdf";

// Lit le texte d'une image avec Tesseract (francais et anglais)
async function lireImage(contenu: Buffer): Promise<string> {
  const worker = await createWorker("fra+eng");
  try {
    const resultat = await worker.recognize(contenu);
    return resultat.data.text;
  } finally {
    await worker.terminate();
  }
}

// Lit le texte integre d'un PDF
async function lirePdf(contenu: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(contenu));
  const resultat = await extractText(pdf, { mergePages: true });
  return resultat.text;
}

// Choisit la bonne methode selon le type de fichier
export async function extraireTexte(contenu: Buffer, typeMime: string): Promise<string> {
  let texte = "";

  if (typeMime === "application/pdf") {
    texte = await lirePdf(contenu);
  } else if (typeMime === "image/jpeg" || typeMime === "image/png") {
    texte = await lireImage(contenu);
  } else {
    throw new Error("type de fichier non pris en charge : " + typeMime);
  }

  texte = texte.trim();
  if (texte.length === 0) {
    throw new Error("aucun texte lu dans le fichier");
  }
  return texte;
}