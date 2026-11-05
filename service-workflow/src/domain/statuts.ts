export const STATUTS = [
  "ENREGISTRE",
  "AFFECTE",
  "RECU",
  "EN_COURS",
  "TRAITE",
  "ARCHIVE",
  "REJETE",
] as const;

export type Statut = (typeof STATUTS)[number];

export interface RegleAction {
  depuis: Statut[];
  vers: Statut | null;
  destinataireSeul: boolean;
  commentaireObligatoire?: boolean;
  motifObligatoire?: boolean;
  nouveauDestinataireObligatoire?: boolean;
}

export const ACTIONS: Record<string, RegleAction> = {
  accuser_reception: {
    depuis: ["AFFECTE"],
    vers: "RECU",
    destinataireSeul: true,
  },
  prendre_en_charge: {
    depuis: ["RECU"],
    vers: "EN_COURS",
    destinataireSeul: true,
  },
  cloturer: {
    depuis: ["EN_COURS"],
    vers: "TRAITE",
    destinataireSeul: true,
    commentaireObligatoire: true,
  },
  rejeter: {
    depuis: ["ENREGISTRE", "AFFECTE"],
    vers: "REJETE",
    destinataireSeul: false,
    motifObligatoire: true,
  },
  archiver: {
    depuis: ["TRAITE"],
    vers: "ARCHIVE",
    destinataireSeul: false,
  },
  deleguer: {
    depuis: ["RECU", "EN_COURS"],
    vers: null,
    destinataireSeul: true,
    motifObligatoire: true,
    nouveauDestinataireObligatoire: true,
  },
  signaler_erreur: {
    depuis: ["AFFECTE"],
    vers: "ENREGISTRE",
    destinataireSeul: true,
    motifObligatoire: true,
  },
};

export type CodeTransition =
  | "TRANSITION_INTERDITE"
  | "MOTIF_OBLIGATOIRE"
  | "COMMENTAIRE_OBLIGATOIRE"
  | "CHAMP_MANQUANT"
  | "DROIT_INSUFFISANT"
  | "COURRIER_ARCHIVE";

export type ResultatTransition =
  | { ok: true; statutSuivant: Statut }
  | { ok: false; code: CodeTransition; message: string };

export interface ContexteTransition {
  statut: string;
  destinataireSlackId: string | null;
  acteurSlackId: string;
  commentaire: string;
  motif: string;
  nouveauDestinataireSlackId: string;
}

export function validerTransition(
  action: string,
  contexte: ContexteTransition,
): ResultatTransition {
  const regle = ACTIONS[action];
  if (!regle) {
    return {
      ok: false,
      code: "TRANSITION_INTERDITE",
      message: `Action inconnue : ${action}.`,
    };
  }
  if (contexte.statut === "ARCHIVE") {
    return {
      ok: false,
      code: "COURRIER_ARCHIVE",
      message: "Ce courrier est archivé et ne peut plus être modifié.",
    };
  }
  if (!regle.depuis.includes(contexte.statut as Statut)) {
    return {
      ok: false,
      code: "TRANSITION_INTERDITE",
      message: `L’action ${action} n’est pas permise depuis le statut ${contexte.statut}.`,
    };
  }
  if (
    regle.destinataireSeul &&
    contexte.destinataireSlackId &&
    contexte.destinataireSlackId !== contexte.acteurSlackId
  ) {
    return {
      ok: false,
      code: "DROIT_INSUFFISANT",
      message: "Seul le destinataire du courrier peut effectuer cette action.",
    };
  }
  if (regle.commentaireObligatoire && !contexte.commentaire.trim()) {
    return {
      ok: false,
      code: "COMMENTAIRE_OBLIGATOIRE",
      message: "Un commentaire est obligatoire pour clôturer ce courrier.",
    };
  }
  if (regle.motifObligatoire && !contexte.motif.trim()) {
    return {
      ok: false,
      code: "MOTIF_OBLIGATOIRE",
      message: "Un motif est obligatoire pour cette action.",
    };
  }
  if (regle.nouveauDestinataireObligatoire && !contexte.nouveauDestinataireSlackId.trim()) {
    return {
      ok: false,
      code: "CHAMP_MANQUANT",
      message: "Le nouveau destinataire est obligatoire pour une délégation.",
    };
  }

  return { ok: true, statutSuivant: (regle.vers ?? (contexte.statut as Statut)) as Statut };
}

export const ROLES_AFFECTATION = ["SECRETARIAT", "RESPONSABLE", "ADMIN"];
export const ROLES_REJET = ["SECRETARIAT", "RESPONSABLE", "ADMIN"];
export const ROLES_ARCHIVE = ["SECRETARIAT", "ADMIN"];

export function roleAutorise(role: string, rolesAutorises: string[]): boolean {
  return rolesAutorises.includes(role);
}
