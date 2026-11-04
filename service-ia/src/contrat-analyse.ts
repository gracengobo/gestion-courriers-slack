// Contrat entre la partie A (messagerie) et la partie B (cerveau IA)

export type EntreeAnalyse = {
  numero: string;
  texte: string;
  langue: "fr" | "en";
  servicesConnus: string[];
};

export type ResultatAnalyse = {
  categorie: "ADMINISTRATIF" | "FINANCIER" | "JURIDIQUE" | "PEDAGOGIQUE" | "RH" | "AUTRE";
  confiance: number;
  urgence: "BASSE" | "NORMALE" | "HAUTE";
  datesDetectees: string[];
  resume: string;
  serviceSuggere: string | null;
  justification: string;
  langueDetectee: "fr" | "en";
  brouillonReponse: string | null;
};

// B ecrit cette fonction. Elle lance une erreur si l'analyse echoue.
export async function analyserTexte(entree: EntreeAnalyse): Promise<ResultatAnalyse> {
  // Version bidon pour que A puisse tester sans attendre B
  return {
    categorie: "ADMINISTRATIF",
    confiance: 0.5,
    urgence: "NORMALE",
    datesDetectees: [],
    resume: "Resume de test.",
    serviceSuggere: null,
    justification: "Reponse de test.",
    langueDetectee: entree.langue,
    brouillonReponse: null
  };
}