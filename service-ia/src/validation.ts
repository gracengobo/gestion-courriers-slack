import type { EntreeAnalyse, ResultatAnalyse } from "./contrat-analyse.js";

// Valeurs autorisees par CONTRATS.md (majuscules, sans accent)
export const CATEGORIES = ["ADMINISTRATIF", "FINANCIER", "JURIDIQUE", "PEDAGOGIQUE", "RH", "AUTRE"] as const;
export const URGENCES = ["BASSE", "NORMALE", "HAUTE"] as const;
export const LANGUES = ["fr", "en"] as const;
export const STATUTS = ["ENREGISTRE", "AFFECTE", "RECU", "EN_COURS", "TRAITE", "ARCHIVE", "REJETE"] as const;

export type Categorie = (typeof CATEGORIES)[number];
export type Urgence = (typeof URGENCES)[number];
export type Langue = (typeof LANGUES)[number];
export type Statut = (typeof STATUTS)[number];

// Le modele renvoie parfois "Administratif" ou "ADMINISTRATIF " : on normalise avant de comparer
export function normaliserCode(valeur: unknown): string | null {
  if (typeof valeur !== "string") {
    return null;
  }
  const propre = valeur
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return propre === "" ? null : propre;
}

export function normaliserParmi<T extends string>(valeur: unknown, liste: readonly T[]): T | null {
  const propre = normaliserCode(valeur);
  if (propre === null) {
    return null;
  }
  const trouve = liste.find((v) => v === propre);
  return trouve ?? null;
}

function deuxChiffres(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

// Verifie qu'une date AAAA-MM-JJ existe vraiment (refuse 2026-02-31)
export function verifierDate(valeur: string): string | null {
  const m = valeur.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    return null;
  }
  const annee = Number(m[1]);
  const mois = Number(m[2]);
  const jour = Number(m[3]);
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  if (
    date.getUTCFullYear() !== annee ||
    date.getUTCMonth() !== mois - 1 ||
    date.getUTCDate() !== jour
  ) {
    return null;
  }
  return valeur;
}

// Accepte AAAA-MM-JJ, AAAA-MM-JJTHH:MM:SSZ et JJ/MM/AAAA, renvoie AAAA-MM-JJ
export function normaliserDate(valeur: unknown): string | null {
  if (typeof valeur !== "string") {
    return null;
  }
  const texte = valeur.trim();

  const iso = texte.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return verifierDate(iso[0]);
  }

  const fr = texte.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (fr) {
    return verifierDate(fr[3] + "-" + deuxChiffres(Number(fr[2])) + "-" + deuxChiffres(Number(fr[1])));
  }

  return null;
}

function lireConfiance(valeur: unknown): number | null {
  const nombre = typeof valeur === "number" ? valeur : typeof valeur === "string" ? Number(valeur) : NaN;
  if (!Number.isFinite(nombre) || nombre < 0 || nombre > 1) {
    return null;
  }
  return nombre;
}

// Verifie la reponse du modele. Lance une erreur si elle est invalide.
export function validerReponse(brut: unknown, entree: EntreeAnalyse): ResultatAnalyse {
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) {
    throw new Error("la reponse n'est pas un objet JSON");
  }
  const r = brut as Record<string, unknown>;

  const categorie = normaliserParmi(r.categorie, CATEGORIES);
  if (categorie === null) {
    throw new Error("categorie invalide : " + String(r.categorie));
  }

  const confiance = lireConfiance(r.confiance);
  if (confiance === null) {
    throw new Error("confiance invalide : " + String(r.confiance));
  }

  const urgence = normaliserParmi(r.urgence, URGENCES);
  if (urgence === null) {
    throw new Error("urgence invalide : " + String(r.urgence));
  }

  if (typeof r.resume !== "string" || r.resume.trim() === "") {
    throw new Error("resume manquant");
  }

  if (typeof r.justification !== "string" || r.justification.trim() === "") {
    throw new Error("justification manquante");
  }

  const langue = normaliserParmi(r.langueDetectee, LANGUES);
  if (langue === null) {
    throw new Error("langue invalide : " + String(r.langueDetectee));
  }

  // dates : on garde celles au bon format, sans doublon et dans l'ordre
  const datesBrutes = Array.isArray(r.datesDetectees) ? r.datesDetectees : [];
  const dates = datesBrutes
    .map(normaliserDate)
    .filter((d): d is string => d !== null)
    .filter((d, i, toutes) => toutes.indexOf(d) === i)
    .sort();

  // service : s'il n'est pas dans la liste fournie, le modele l'a invente
  const servicePropose = normaliserCode(r.serviceSuggere);
  const service =
    servicePropose === null
      ? null
      : entree.servicesConnus.find((s) => normaliserCode(s) === servicePropose) ?? null;

  const brouillon =
    typeof r.brouillonReponse === "string" && r.brouillonReponse.trim() !== ""
      ? r.brouillonReponse.trim()
      : null;

  return {
    categorie,
    confiance,
    urgence,
    datesDetectees: dates,
    resume: r.resume.trim(),
    serviceSuggere: service,
    justification: r.justification.trim(),
    langueDetectee: langue,
    brouillonReponse: brouillon
  };
}
