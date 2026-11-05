export interface Enveloppe<T> {
  eventId: string;
  type: string;
  version: number;
  emisLe: string;
  emisPar: string;
  numero: string;
  donnees: T;
}

export interface DonneesCourrierCree {
  type: string;
  objet: string;
  expediteur: string;
  dateCourrier: string;
  priorite: string;
  confidentiel: boolean;
  serviceCode: string | null;
  destinataireSlackId: string | null;
  agentSlackId: string | null;
  langueDestinataire?: string | null;
}

export interface DonneesCourrierAnalyse {
  statutAnalyse: "ok" | "echec" | "ignore_confidentiel";
  categorie: string | null;
  confiance: number | null;
  urgence: string | null;
  datesDetectees: string[] | null;
  resume: string | null;
  serviceSuggere: string | null;
  justification: string | null;
  produitParIA: boolean;
  langueDetectee: string | null;
}

export interface DonneesCourrierAffecte {
  destinataireSlackId: string;
  ancienDestinataireSlackId: string | null;
  serviceCode: string | null;
  responsableSlackId: string;
  motif: string | null;
  echeance: string | null;
  objet: string;
  priorite: string;
  confidentiel: boolean;
  agentSlackId: string | null;
  langueDestinataire: string;
}

export interface DonneesStatutChange {
  ancienStatut: string;
  nouveauStatut: string;
  acteurSlackId: string;
  destinataireSlackId: string | null;
  agentSlackId: string | null;
  commentaire: string | null;
  motif: string | null;
}

export interface DonneesRetard {
  echeance: string;
  joursDeRetard: number;
  destinataireSlackId: string;
  responsableSlackId: string | null;
}
