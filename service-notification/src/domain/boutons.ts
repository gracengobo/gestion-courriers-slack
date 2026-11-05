import type { Button } from "@slack/types";
import { traduire, type Langue } from "../i18n";

function bouton(
  actionId: string,
  libelle: string,
  numero: string,
  style?: "primary" | "danger",
): Button {
  return {
    type: "button",
    action_id: actionId,
    text: { type: "plain_text", text: libelle, emoji: true },
    value: numero,
    ...(style ? { style } : {}),
  };
}

export function boutonsPourStatut(statut: string, numero: string, langue: Langue): Button[] {
  switch (statut) {
    case "AFFECTE":
      return [
        bouton("accuser_reception", traduire(langue, "notification.bouton_accuser_reception"), numero, "primary"),
        bouton("deleguer", traduire(langue, "notification.bouton_deleguer"), numero),
        bouton("signaler_erreur", traduire(langue, "notification.bouton_signaler_erreur"), numero),
        bouton("rejeter", traduire(langue, "notification.bouton_rejeter"), numero, "danger"),
      ];
    case "RECU":
      return [
        bouton("prendre_en_charge", traduire(langue, "notification.bouton_prendre_en_charge"), numero, "primary"),
        bouton("deleguer", traduire(langue, "notification.bouton_deleguer"), numero),
        bouton("rejeter", traduire(langue, "notification.bouton_rejeter"), numero, "danger"),
      ];
    case "EN_COURS":
      return [
        bouton("cloturer", traduire(langue, "notification.bouton_cloturer"), numero, "primary"),
        bouton("deleguer", traduire(langue, "notification.bouton_deleguer"), numero),
      ];
    case "TRAITE":
      return [bouton("archiver", traduire(langue, "notification.bouton_archiver"), numero)];
    default:
      return [];
  }
}
