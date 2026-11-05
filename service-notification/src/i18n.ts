import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config";

export type Langue = "fr" | "en";

type Dictionnaire = Record<string, unknown>;

const dictionnaires = new Map<Langue, Dictionnaire>();

function charger(langue: Langue): Dictionnaire {
  const deja = dictionnaires.get(langue);
  if (deja) return deja;

  const fichier = join(config.i18nDir, `${langue}.json`);
  const contenu = JSON.parse(readFileSync(fichier, "utf-8")) as Dictionnaire;
  dictionnaires.set(langue, contenu);
  return contenu;
}

function chercher(dictionnaire: Dictionnaire, cle: string): string | undefined {
  let courant: unknown = dictionnaire;
  for (const partie of cle.split(".")) {
    if (typeof courant !== "object" || courant === null) return undefined;
    courant = (courant as Record<string, unknown>)[partie];
  }
  return typeof courant === "string" ? courant : undefined;
}

export function normaliserLangue(langue: string | null | undefined): Langue {
  return langue === "en" ? "en" : "fr";
}

export function traduire(
  langue: string | null | undefined,
  cle: string,
  params: Record<string, string | number> = {},
): string {
  const code = normaliserLangue(langue);
  const gabarit = chercher(charger(code), cle) ?? chercher(charger("fr"), cle);
  if (gabarit === undefined) {
    console.warn(`[service-notification] clé i18n inconnue : ${cle}`);
    return cle;
  }
  return gabarit.replace(/\{(\w+)\}/g, (_, nom: string) =>
    nom in params ? String(params[nom]) : `{${nom}}`,
  );
}

export function libelleStatut(langue: string | null | undefined, statut: string): string {
  return traduire(langue, `statut.${statut}`);
}
