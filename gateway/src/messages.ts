import * as grpc from "@grpc/grpc-js";

const translations = {
  fr: {
    CHAMP_MANQUANT: "Certains champs obligatoires sont manquants.",
    COMMENTAIRE_OBLIGATOIRE: "Un commentaire est obligatoire pour clôturer ce courrier.",
    MOTIF_OBLIGATOIRE: "Un motif est obligatoire pour cette action.",
    DROIT_INSUFFISANT: "Vous n’avez pas les droits nécessaires pour cette action.",
    COURRIER_INTROUVABLE: "Ce courrier est introuvable.",
    ANALYSE_INTROUVABLE: "Aucune analyse n’est disponible pour ce courrier.",
    ALREADY_EXISTS: "Une décision a déjà été enregistrée pour cette analyse.",
    TRANSITION_INTERDITE: "Cette transition de statut n’est pas autorisée.",
    COURRIER_ARCHIVE: "Ce courrier est archivé et ne peut plus être modifié.",
    CONFLIT_VERSION: "Ce courrier vient d’être modifié. Actualisez-le avant de réessayer.",
    SERVICE_INDISPONIBLE: "Un service est temporairement indisponible. Réessayez plus tard.",
  },
  en: {
    CHAMP_MANQUANT: "Some required fields are missing.",
    COMMENTAIRE_OBLIGATOIRE: "A comment is required to close this letter.",
    MOTIF_OBLIGATOIRE: "A reason is required for this action.",
    DROIT_INSUFFISANT: "You are not allowed to perform this action.",
    COURRIER_INTROUVABLE: "This letter could not be found.",
    ANALYSE_INTROUVABLE: "No analysis is available for this letter.",
    ALREADY_EXISTS: "A decision has already been recorded for this analysis.",
    TRANSITION_INTERDITE: "This status transition is not allowed.",
    COURRIER_ARCHIVE: "This letter is archived and cannot be changed.",
    CONFLIT_VERSION: "This letter has changed. Refresh it before trying again.",
    SERVICE_INDISPONIBLE: "A service is temporarily unavailable. Please try again.",
  },
} as const;

export function errorMessage(error: unknown, language: "fr" | "en" = "fr"): string {
  if (isGrpcServiceError(error)) {
    const businessCode = error.metadata.get("code-metier")[0];
    if (typeof businessCode === "string") {
      const message = (translations[language] as Readonly<Record<string, string>>)[businessCode];
      if (message) return message;
    }
    if (error.code === grpc.status.DEADLINE_EXCEEDED || error.code === grpc.status.UNAVAILABLE) {
      return translations[language].SERVICE_INDISPONIBLE;
    }
    return error.details || translations[language].SERVICE_INDISPONIBLE;
  }
  if (error instanceof Error) return error.message;
  return translations[language].SERVICE_INDISPONIBLE;
}

function isGrpcServiceError(error: unknown): error is grpc.ServiceError {
  return (
    error instanceof Error &&
    "code" in error &&
    "metadata" in error &&
    error.metadata instanceof grpc.Metadata
  );
}
