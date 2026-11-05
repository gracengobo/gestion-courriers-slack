import { appelerEtValider } from "./llm.js";
import { consignesSysteme, construirePromptRecherche } from "./prompts.js";
import { CATEGORIES, STATUTS, URGENCES, normaliserCode, normaliserDate, normaliserParmi } from "./validation.js";

// BF-44 : filtres produits a partir d'une phrase en langage courant
export type FiltresRecherche = {
  motsCles: string[];
  categorie: string | null;
  serviceCode: string | null;
  urgence: string | null;
  statuts: string[];
  dateDebut: string | null;
  dateFin: string | null;
};

function normaliserService(valeur: unknown): string | null {
  const code = normaliserCode(valeur);
  if (code === null) {
    return null;
  }
  const propre = code.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[A-Z][A-Z0-9_]{1,29}$/.test(propre) ? propre : null;
}

function normaliserMotsCles(valeur: unknown): string[] {
  if (!Array.isArray(valeur)) {
    return [];
  }
  const mots = valeur
    .filter((m): m is string => typeof m === "string")
    .map((m) => m.trim().slice(0, 60))
    .filter((m) => m !== "")
    .filter((m, i, tous) => tous.findIndex((x) => x.toLowerCase() === m.toLowerCase()) === i);
  return mots.slice(0, 12);
}

function normaliserStatuts(valeur: unknown): string[] {
  if (!Array.isArray(valeur)) {
    return [];
  }
  const statuts = valeur
    .map((s) => normaliserParmi(s, STATUTS))
    .filter((s): s is (typeof STATUTS)[number] => s !== null)
    .filter((s, i, tous) => tous.indexOf(s) === i);
  return statuts;
}

// Verifie la reponse du modele. Lance une erreur si elle est inutilisable.
export function validerFiltres(brut: unknown): FiltresRecherche {
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) {
    throw new Error("la reponse n'est pas un objet JSON");
  }
  const r = brut as Record<string, unknown>;

  const statuts = normaliserStatuts(r.statuts);
  const dateDebut = normaliserDate(r.dateDebut);
  const dateFin = normaliserDate(r.dateFin);

  // si le modele a inverse les bornes, on les remet dans l'ordre
  const debut = dateDebut && dateFin && dateDebut > dateFin ? dateFin : dateDebut;
  const fin = dateDebut && dateFin && dateDebut > dateFin ? dateDebut : dateFin;

  return {
    motsCles: normaliserMotsCles(r.motsCles),
    categorie: normaliserParmi(r.categorie, CATEGORIES),
    serviceCode: normaliserService(r.serviceCode),
    urgence: normaliserParmi(r.urgence, URGENCES),
    statuts,
    dateDebut: debut,
    dateFin: fin
  };
}

export async function interpreterRecherche(phrase: string, langue: "fr" | "en"): Promise<FiltresRecherche> {
  const propre = phrase.trim();
  if (propre === "") {
    throw new Error("phrase de recherche vide");
  }

  return appelerEtValider(
    "recherche",
    consignesSysteme(),
    construirePromptRecherche(propre, langue),
    validerFiltres
  );
}
