// Types des messages RabbitMQ (voir CONTRATS.md partie 3)

export type PieceJointe = {
  bucket: string;
  cle: string;
  nomOriginal: string;
  typeMime: string;
  tailleOctets: number;
  empreinteSha256: string;
};

export type DonneesCourrierCree = {
  type: "ENTRANT" | "SORTANT" | "INTERNE";
  objet: string;
  expediteur: string;
  dateCourrier: string;
  priorite: "BASSE" | "NORMALE" | "HAUTE";
  confidentiel: boolean;
  serviceCode: string | null;
  destinataireSlackId: string | null;
  agentSlackId: string;
  pieceJointe: PieceJointe | null;
};

export type Enveloppe = {
  eventId: string;
  type: string;
  version: number;
  emisLe: string;
  emisPar: string;
  numero: string;
  donnees: DonneesCourrierCree;
};

// Contenu du message courrier.analyse
export type DonneesAnalyse = {
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
};