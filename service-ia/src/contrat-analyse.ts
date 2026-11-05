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