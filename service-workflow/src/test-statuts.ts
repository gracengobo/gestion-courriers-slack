import assert from "node:assert/strict";
import { ajouterJoursOuvres, calculerEcheance } from "./domain/echeance";
import { validerTransition, type ContexteTransition } from "./domain/statuts";

function contexte(partiel: Partial<ContexteTransition> = {}): ContexteTransition {
  return {
    statut: "AFFECTE",
    destinataireSlackId: "U-DEST",
    acteurSlackId: "U-DEST",
    commentaire: "",
    motif: "",
    nouveauDestinataireSlackId: "",
    ...partiel,
  };
}

const cas: Array<[string, () => void]> = [
  [
    "échéance à 5 jours ouvrés depuis un vendredi",
    () =>
      assert.equal(
        ajouterJoursOuvres(new Date("2026-11-06T10:00:00Z"), 5).toISOString(),
        "2026-11-13T16:00:00.000Z",
      ),
  ],
  [
    "échéance à 5 jours ouvrés depuis un lundi",
    () =>
      assert.equal(
        ajouterJoursOuvres(new Date("2026-11-09T08:00:00Z"), 5).toISOString(),
        "2026-11-16T16:00:00.000Z",
      ),
  ],
  [
    "accuser réception par le destinataire",
    () => {
      const resultat = validerTransition("accuser_reception", contexte());
      assert.deepEqual(resultat, { ok: true, statutSuivant: "RECU" });
    },
  ],
  [
    "échéance à 48 heures pour une priorité haute",
    () =>
      assert.equal(
        calculerEcheance("HAUTE", new Date("2026-11-05T10:00:00Z"), 5).toISOString(),
        "2026-11-07T10:00:00.000Z",
      ),
  ],
  [
    "échéance à 5 jours ouvrés pour une priorité normale",
    () =>
      assert.equal(
        calculerEcheance("NORMALE", new Date("2026-11-05T10:00:00Z"), 5).toISOString(),
        "2026-11-12T16:00:00.000Z",
      ),
  ],
  [
    "accuser réception par un autre agent",
    () => {
      const resultat = validerTransition("accuser_reception", contexte({ acteurSlackId: "U-AUTRE" }));
      assert.equal(resultat.ok, false);
      if (!resultat.ok) assert.equal(resultat.code, "DROIT_INSUFFISANT");
    },
  ],
  [
    "clôture sans commentaire",
    () => {
      const resultat = validerTransition("cloturer", contexte({ statut: "EN_COURS" }));
      assert.equal(resultat.ok, false);
      if (!resultat.ok) assert.equal(resultat.code, "COMMENTAIRE_OBLIGATOIRE");
    },
  ],
  [
    "rejet sans motif",
    () => {
      const resultat = validerTransition("rejeter", contexte({ statut: "ENREGISTRE" }));
      assert.equal(resultat.ok, false);
      if (!resultat.ok) assert.equal(resultat.code, "MOTIF_OBLIGATOIRE");
    },
  ],
  [
    "archivage après traitement",
    () => {
      const resultat = validerTransition("archiver", contexte({ statut: "TRAITE" }));
      assert.deepEqual(resultat, { ok: true, statutSuivant: "ARCHIVE" });
    },
  ],
  [
    "saut d'étape refusé",
    () => {
      const resultat = validerTransition("accuser_reception", contexte({ statut: "ENREGISTRE" }));
      assert.equal(resultat.ok, false);
      if (!resultat.ok) assert.equal(resultat.code, "TRANSITION_INTERDITE");
    },
  ],
  [
    "délégation sans nouveau destinataire",
    () => {
      const resultat = validerTransition(
        "deleguer",
        contexte({ statut: "RECU", motif: "Absence" }),
      );
      assert.equal(resultat.ok, false);
      if (!resultat.ok) assert.equal(resultat.code, "CHAMP_MANQUANT");
    },
  ],
  [
    "signalement d'erreur",
    () => {
      const resultat = validerTransition(
        "signaler_erreur",
        contexte({ motif: "Mauvais service" }),
      );
      assert.deepEqual(resultat, { ok: true, statutSuivant: "ENREGISTRE" });
    },
  ],
  [
    "courrier archivé non modifiable",
    () => {
      const resultat = validerTransition("archiver", contexte({ statut: "ARCHIVE" }));
      assert.equal(resultat.ok, false);
      if (!resultat.ok) assert.equal(resultat.code, "COURRIER_ARCHIVE");
    },
  ],
];

let echecs = 0;
for (const [nom, verification] of cas) {
  try {
    verification();
    console.log(`OK   ${nom}`);
  } catch (error) {
    echecs += 1;
    console.error(`ECHEC ${nom} : ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`${cas.length - echecs}/${cas.length} vérifications réussies`);
process.exitCode = echecs === 0 ? 0 : 1;
