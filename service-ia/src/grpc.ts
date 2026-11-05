import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { enregistrerDecision, lireAnalyse } from "./db.js";
import { interpreterRecherche } from "./recherche.js";

// Pour l'instant on lit la proposition. Quand ia.proto sera dans proto/, on change ce chemin.
const CHEMIN_PROTO = fileURLToPath(new URL("../proposition-proto/ia.proto", import.meta.url));

const DECISIONS = ["VALIDEE", "CORRIGEE", "REJETEE"];
const CATEGORIES = ["ADMINISTRATIF", "FINANCIER", "JURIDIQUE", "PEDAGOGIQUE", "RH", "AUTRE"];

// Charge le fichier .proto et renvoie le package courrier.v1
export function chargerPackage(): any {
  const definition = protoLoader.loadSync(CHEMIN_PROTO, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true
  });
  const paquet: any = grpc.loadPackageDefinition(definition);
  return paquet.courrier.v1;
}

// Erreur au format du contrat : code gRPC + code-metier dans les metadonnees
function erreur(code: number, codeMetier: string, message: string) {
  const metadata = new grpc.Metadata();
  metadata.set("code-metier", codeMetier);
  return { code: code, details: message, metadata: metadata };
}

function baseIndisponible(callback: any, e: unknown) {
  console.error("[service-ia] erreur base :", e);
  callback(erreur(grpc.status.UNAVAILABLE, "SERVICE_INDISPONIBLE", "base indisponible"));
}

async function obtenirAnalyse(call: any, callback: any) {
  try {
    const numero = String(call.request.numero ?? "").trim();
    if (!numero) {
      callback(erreur(grpc.status.INVALID_ARGUMENT, "CHAMP_MANQUANT", "numero manquant"));
      return;
    }

    const a = await lireAnalyse(numero);
    if (!a) {
      callback(erreur(grpc.status.NOT_FOUND, "ANALYSE_INTROUVABLE", "aucune analyse pour " + numero));
      return;
    }

    console.log("[service-ia] " + numero + " ObtenirAnalyse");
    callback(null, {
      numero: a.numero,
      statutAnalyse: a.statut_analyse,
      categorie: a.categorie ?? "",
      confiance: a.confiance ?? 0,
      urgence: a.urgence ?? "",
      datesDetectees: a.dates_detectees ?? [],
      resume: a.resume ?? "",
      serviceSuggere: a.service_suggere ?? "",
      justification: a.justification ?? "",
      langueDetectee: a.langue_detectee ?? "",
      brouillonReponse: a.brouillon_reponse ?? "",
      produitParIa: a.produit_par_ia
    });
  } catch (e) {
    baseIndisponible(callback, e);
  }
}

async function enregistrerDecisionGrpc(call: any, callback: any) {
  try {
    const r = call.request;
    const numero = String(r.numero ?? "").trim();
    const acteur = String(r.acteurSlackId ?? "").trim();
    const decision = String(r.decision ?? "");
    const categorie = String(r.categorieFinale ?? "").trim();
    const service = String(r.serviceFinal ?? "").trim();

    // controles de la saisie
    if (!numero || !acteur) {
      callback(erreur(grpc.status.INVALID_ARGUMENT, "CHAMP_MANQUANT", "numero ou acteur manquant"));
      return;
    }
    if (!DECISIONS.includes(decision)) {
      callback(erreur(grpc.status.INVALID_ARGUMENT, "CHAMP_MANQUANT", "decision invalide (VALIDEE, CORRIGEE ou REJETEE)"));
      return;
    }
    if (decision === "CORRIGEE" && !categorie && !service) {
      callback(erreur(grpc.status.INVALID_ARGUMENT, "CHAMP_MANQUANT", "une correction demande la categorie ou le service final"));
      return;
    }
    if (categorie && !CATEGORIES.includes(categorie)) {
      callback(erreur(grpc.status.INVALID_ARGUMENT, "CHAMP_MANQUANT", "categorie inconnue : " + categorie));
      return;
    }

    // l'analyse doit exister
    const a = await lireAnalyse(numero);
    if (!a) {
      callback(erreur(grpc.status.NOT_FOUND, "ANALYSE_INTROUVABLE", "aucune analyse pour " + numero));
      return;
    }

    const date = await enregistrerDecision(numero, decision, acteur, categorie || null, service || null);
    console.log("[service-ia] " + numero + " decision " + decision + " par " + acteur);
    callback(null, { numero: numero, decision: decision, decideLe: date });
  } catch (e) {
    baseIndisponible(callback, e);
  }
}

async function interpreterRechercheGrpc(call: any, callback: any) {
  try {
    const phrase = String(call.request.phrase ?? "").trim();
    const langueDemandee = String(call.request.langue ?? "").trim().toLowerCase().slice(0, 2);
    const langue = langueDemandee === "" ? "fr" : langueDemandee;

    if (!phrase) {
      callback(erreur(grpc.status.INVALID_ARGUMENT, "CHAMP_MANQUANT", "phrase manquante"));
      return;
    }
    if (langue !== "fr" && langue !== "en") {
      callback(erreur(grpc.status.INVALID_ARGUMENT, "CHAMP_MANQUANT", "langue invalide (fr ou en)"));
      return;
    }

    const filtres = await interpreterRecherche(phrase, langue);
    console.log("[service-ia] InterpreterRecherche (" + langue + ") : " + phrase);
    callback(null, {
      motsCles: filtres.motsCles,
      categorie: filtres.categorie ?? "",
      serviceCode: filtres.serviceCode ?? "",
      urgence: filtres.urgence ?? "",
      statuts: filtres.statuts,
      dateDebut: filtres.dateDebut ?? "",
      dateFin: filtres.dateFin ?? ""
    });
  } catch (e) {
    console.error("[service-ia] erreur recherche :", e);
    callback(erreur(grpc.status.UNAVAILABLE, "SERVICE_INDISPONIBLE", "service indisponible"));
  }
}

// Demarre le serveur gRPC
export function demarrerGrpc() {
  const paquet = chargerPackage();
  const serveur = new grpc.Server();

  serveur.addService(paquet.IAService.service, {
    obtenirAnalyse: obtenirAnalyse,
    enregistrerDecision: enregistrerDecisionGrpc,
    interpreterRecherche: interpreterRechercheGrpc
  });

  const port = config.grpcIaUrl.split(":")[1] ?? "50053";
  serveur.bindAsync("0.0.0.0:" + port, grpc.ServerCredentials.createInsecure(), (e) => {
    if (e) {
      console.error("[service-ia] gRPC impossible :", e);
      return;
    }
    console.log("[service-ia] gRPC en ecoute sur le port " + port);
  });
}