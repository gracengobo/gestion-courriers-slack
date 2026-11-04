import type { Channel } from "amqplib";
import type { DonneesAnalyse, Enveloppe } from "./types.js";
import { analyserTexte } from "./contrat-analyse.js";
import { lireScan } from "./storage.js";
import { extraireTexte } from "./ocr.js";
import { publierAnalyse } from "./publisher.js";
import { analyseExiste, enregistrerAnalyse, evenementDejaTraite, marquerEvenement } from "./db.js";

// Liste fixe en attendant que le Service Workflow la fournisse
const SERVICES_CONNUS = ["SCOLARITE", "FINANCES", "RH"];

// Message sans analyse : tous les champs a null
function sansAnalyse(statut: "echec" | "ignore_confidentiel"): DonneesAnalyse {
  return {
    statutAnalyse: statut,
    categorie: null,
    confiance: null,
    urgence: null,
    datesDetectees: null,
    resume: null,
    serviceSuggere: null,
    justification: null,
    produitParIA: true,
    langueDetectee: null
  };
}

export async function traiterCourrier(canal: Channel, message: Enveloppe) {
  const numero = message.numero;

  // 1. doublons
  if (await evenementDejaTraite(message.eventId)) {
    console.log("[service-ia] " + numero + " message deja traite, ignore");
    return;
  }
  if (await analyseExiste(numero)) {
    console.log("[service-ia] " + numero + " analyse deja faite, ignore");
    await marquerEvenement(message.eventId, numero);
    return;
  }

  let donnees: DonneesAnalyse;
  let brouillon: string | null = null;

  if (message.donnees.confidentiel) {
    // 2. confidentiel : rien n'est envoye a l'IA
    donnees = sansAnalyse("ignore_confidentiel");
  } else {
    // 3. lecture du scan, OCR, analyse
    try {
      const piece = message.donnees.pieceJointe;
      if (!piece) {
        throw new Error("pas de piece jointe");
      }
      const contenu = await lireScan(piece.bucket, piece.cle);
      const texte = await extraireTexte(contenu, piece.typeMime);
      const resultat = await analyserTexte({
        numero: numero,
        texte: texte,
        langue: "fr",
        servicesConnus: SERVICES_CONNUS
      });
      donnees = {
        statutAnalyse: "ok",
        categorie: resultat.categorie,
        confiance: resultat.confiance,
        urgence: resultat.urgence,
        datesDetectees: resultat.datesDetectees,
        resume: resultat.resume,
        serviceSuggere: resultat.serviceSuggere,
        justification: resultat.justification,
        produitParIA: true,
        langueDetectee: resultat.langueDetectee
      };
      brouillon = resultat.brouillonReponse;
    } catch (erreur) {
      // repli manuel (BF-46)
      console.error("[service-ia] " + numero + " analyse impossible :", erreur);
      donnees = sansAnalyse("echec");
    }
  }

  // 4. publier, puis enregistrer
  publierAnalyse(canal, numero, donnees);
  await enregistrerAnalyse(message.eventId, numero, donnees, brouillon);
  console.log("[service-ia] " + numero + " traite");
}