import {
  appliquerStatuts,
  dernierStatut,
  formatCourriers,
  formatDateHeure,
  resumeDerniereAction,
  type EntreeHistorique,
} from "./affichage";

function verifier(nom: string, condition: boolean): void {
  if (!condition) throw new Error(`Échec du test: ${nom}`);
  console.log(`ok ${nom}`);
}

const entrees: EntreeHistorique[] = [
  {
    statut: "AFFECTE",
    acteurSlackId: "U1",
    commentaire: "",
    motif: "",
    creeLe: "2026-11-05T10:30:00.000Z",
  },
  {
    statut: "RECU",
    acteurSlackId: "U2",
    commentaire: "Pris en compte",
    motif: "",
    creeLe: "2026-11-06T08:00:00.000Z",
  },
];

verifier("date UTC lisible", formatDateHeure("2026-11-12T16:00:00.000Z") === "12/11/2026 16:00 UTC");
verifier("date absente", formatDateHeure("") === "");
verifier("date invalide conservée", formatDateHeure("demain") === "demain");

const fusion = appliquerStatuts(
  [{ numero: "C-1", objet: "Inscription" }, { numero: "C-2", objet: "Facture" }],
  new Map([["C-1", "RECU"]]),
);
verifier("statut fusionné", fusion[0]?.statut === "RECU");
verifier("statut manquant", fusion[1]?.statut === undefined);

verifier("dernier statut", dernierStatut(entrees) === "RECU");
verifier("historique vide", dernierStatut([]) === "INCONNU");

const ligne = formatCourriers(fusion);
verifier("statut affiché", ligne.includes("C-1") && ligne.includes("RECU"));
verifier("repli statut", ligne.includes("Statut indisponible"));
verifier("liste vide", formatCourriers([]) === "Aucun courrier trouvé.");
verifier("liste vide personnalisée", formatCourriers([], "Aucun courrier à traiter.") === "Aucun courrier à traiter.");

const avecEcheance = formatCourriers([
  { numero: "C-3", objet: "Convocation", statut: "AFFECTE", echeance: "2026-11-12T16:00:00.000Z" },
]);
verifier("échéance lisible", avecEcheance.includes("échéance 12/11/2026 16:00 UTC"));

verifier(
  "dernière action",
  resumeDerniereAction(entrees[1]) === "RECU le 06/11/2026 08:00 UTC — Pris en compte",
);
verifier("action absente", resumeDerniereAction(undefined) === "Aucune action enregistrée.");

console.log("14/14 vérifications d'affichage passées.");
