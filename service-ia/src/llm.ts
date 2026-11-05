import { GoogleGenAI } from "@google/genai";
import { config } from "./config.js";
import type { EntreeAnalyse, ResultatAnalyse } from "./contrat-analyse.js";
import { consignesSysteme, construirePrompt } from "./prompts.js";
import { validerReponse } from "./validation.js";

// Choix par defaut : 15 secondes par appel, 2 tentatives (voir README)
const DELAI_MS = Number(process.env.IA_DELAI_MS ?? 15000);
const NB_TENTATIVES = Number(process.env.IA_TENTATIVES ?? 2);
const ATTENTE_MS = 2000;

const BASE_GROQ = (process.env.IA_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/+$/, "");

function nomModele(fournisseur: string): string {
  if (process.env.IA_MODELE) {
    return process.env.IA_MODELE;
  }
  return fournisseur === "groq" ? "openai/gpt-oss-120b" : "gemini-flash-latest";
}

function attendre(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageErreur(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }
  return String(e);
}

// Certains modeles entourent le JSON de texte ou de balises : on isole l'objet
function extraireJson(texte: string): unknown {
  const propre = texte.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(propre);
  } catch {
    const debut = propre.indexOf("{");
    const fin = propre.lastIndexOf("}");
    if (debut >= 0 && fin > debut) {
      return JSON.parse(propre.slice(debut, fin + 1));
    }
    throw new Error("la reponse du modele n'est pas du JSON");
  }
}

async function appelerGroq(systeme: string, utilisateur: string): Promise<unknown> {
  const modele = nomModele("groq");
  const reponse = await fetch(BASE_GROQ + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.iaApiKey
    },
    body: JSON.stringify({
      model: modele,
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systeme },
        { role: "user", content: utilisateur }
      ]
    }),
    signal: AbortSignal.timeout(DELAI_MS)
  });

  if (!reponse.ok) {
    const corps = await reponse.text().catch(() => "");
    throw new Error("Groq HTTP " + reponse.status + " : " + corps.slice(0, 300));
  }

  const donnees = (await reponse.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const contenu = donnees.choices?.[0]?.message?.content;
  if (typeof contenu !== "string" || contenu.trim() === "") {
    throw new Error("reponse vide du modele");
  }
  return extraireJson(contenu);
}

// Le SDK Gemini ne prend pas de delai sur l'appel : on borne nous-memes l'attente
async function avecDelai<T>(promesse: Promise<T>, ms: number): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_resolve, rejeter) => {
    minuteur = setTimeout(() => rejeter(new Error("delai depasse (" + ms + " ms)")), ms);
  });
  try {
    return await Promise.race([promesse, delai]);
  } finally {
    if (minuteur !== undefined) {
      clearTimeout(minuteur);
    }
  }
}

async function appelerGemini(systeme: string, utilisateur: string): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey: config.iaApiKey });
  const reponse = await avecDelai(
    ai.models.generateContent({
      model: nomModele("gemini"),
      contents: systeme + "\n\n" + utilisateur,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    }),
    DELAI_MS
  );

  const texte = reponse.text;
  if (typeof texte !== "string" || texte.trim() === "") {
    throw new Error("reponse vide du modele");
  }
  return extraireJson(texte);
}

async function appelerModele(systeme: string, utilisateur: string): Promise<unknown> {
  if (!config.iaApiKey) {
    throw new Error("IA_API_KEY manquante dans .env");
  }
  const fournisseur = (config.iaFournisseur || "groq").trim().toLowerCase();
  if (fournisseur === "groq") {
    return appelerGroq(systeme, utilisateur);
  }
  if (fournisseur === "gemini") {
    return appelerGemini(systeme, utilisateur);
  }
  throw new Error("IA_FOURNISSEUR inconnu : " + fournisseur + " (groq ou gemini)");
}

// Appelle le modele, valide le resultat, et reessaie en cas d'echec.
// Lance une erreur apres la derniere tentative : c'est le service qui publie "echec".
export async function appelerEtValider<T>(
  contexte: string,
  consignes: string,
  question: string,
  valider: (brut: unknown) => T
): Promise<T> {
  let derniereErreur: unknown = null;

  for (let essai = 1; essai <= NB_TENTATIVES; essai++) {
    try {
      const brut = await appelerModele(consignes, question);
      return valider(brut);
    } catch (erreur) {
      derniereErreur = erreur;
      console.error(
        "[service-ia] " + contexte + " analyse IA, tentative " + essai + "/" + NB_TENTATIVES + " : " + messageErreur(erreur)
      );
      if (essai < NB_TENTATIVES) {
        await attendre(ATTENTE_MS);
      }
    }
  }

  throw derniereErreur instanceof Error ? derniereErreur : new Error("analyse impossible");
}

// La vraie analyse d'un courrier (contrat avec la partie A)
export async function analyserTexte(entree: EntreeAnalyse): Promise<ResultatAnalyse> {
  return appelerEtValider(entree.numero, consignesSysteme(), construirePrompt(entree), (brut) =>
    validerReponse(brut, entree)
  );
}
