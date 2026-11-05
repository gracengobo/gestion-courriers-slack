import assert from "node:assert/strict";
import { traduire } from "./i18n";
import { boutonsPourStatut } from "./domain/boutons";
import { etatRappel, nombreDeJoursEntre } from "./domain/rappels";

const cas: Array<[string, () => void]> = [
  [
    "message de rappel J-2 en français",
    () => {
      const texte = traduire("fr", "notification.rappel_j2", {
        numero: "CE-2026-0042",
        objet: "Demande de bourse",
        echeance: "12/11/2026 16:00 UTC",
      });
      assert.match(texte, /CE-2026-0042/);
      assert.match(texte, /dans 2 jours/);
    },
  ],
  [
    "message de confirmation en anglais",
    () => {
      const texte = traduire("en", "notification.courrier_cree", { numero: "CE-2026-0042" });
      assert.match(texte, /registered/);
    },
  ],
  [
    "repli sur le français pour une langue inconnue",
    () => {
      const texte = traduire("de", "notification.rappel_jour", {
        numero: "CE-2026-0042",
        objet: "Objet",
        echeance: "12/11/2026 16:00 UTC",
      });
      assert.match(texte, /aujourd’hui/);
    },
  ],
  [
    "rappel J-2 dû deux jours avant l’échéance",
    () => {
      const etat = etatRappel(
        new Date("2026-11-12T16:00:00Z"),
        new Date("2026-11-10T08:00:00Z"),
        { rappelJ2Envoye: false, rappelJourEnvoye: false },
      );
      assert.equal(etat.joursRestants, 2);
      assert.equal(etat.envoyerJ2, true);
      assert.equal(etat.envoyerJour, false);
      assert.equal(etat.enRetard, false);
    },
  ],
  [
    "rappel du jour dû le jour de l’échéance",
    () => {
      const etat = etatRappel(
        new Date("2026-11-12T16:00:00Z"),
        new Date("2026-11-12T09:00:00Z"),
        { rappelJ2Envoye: true, rappelJourEnvoye: false },
      );
      assert.equal(etat.envoyerJour, true);
      assert.equal(etat.envoyerJ2, false);
    },
  ],
  [
    "rappel J-2 non renvoyé s’il est déjà parti",
    () => {
      const etat = etatRappel(
        new Date("2026-11-12T16:00:00Z"),
        new Date("2026-11-10T08:00:00Z"),
        { rappelJ2Envoye: true, rappelJourEnvoye: false },
      );
      assert.equal(etat.envoyerJ2, false);
    },
  ],
  [
    "retard signalé avec le nombre de jours",
    () => {
      const etat = etatRappel(
        new Date("2026-11-10T16:00:00Z"),
        new Date("2026-11-12T08:00:00Z"),
        { rappelJ2Envoye: true, rappelJourEnvoye: true },
      );
      assert.equal(etat.enRetard, true);
      assert.equal(etat.joursDeRetard, 2);
    },
  ],
  [
    "calcul des jours entre deux dates UTC",
    () => {
      assert.equal(
        nombreDeJoursEntre(new Date("2026-11-10T23:00:00Z"), new Date("2026-11-12T01:00:00Z")),
        2,
      );
    },
  ],
  [
    "boutons du statut AFFECTE",
    () => {
      const boutons = boutonsPourStatut("AFFECTE", "CE-2026-0042", "fr");
      assert.deepEqual(
        boutons.map((bouton) => bouton.action_id),
        ["accuser_reception", "deleguer", "signaler_erreur", "rejeter"],
      );
      assert.ok(boutons.every((bouton) => bouton.value === "CE-2026-0042"));
      assert.equal(boutons[0].text.text, "Accuser réception");
    },
  ],
  [
    "boutons du statut TRAITE",
    () => {
      const boutons = boutonsPourStatut("TRAITE", "CE-2026-0042", "en");
      assert.deepEqual(boutons.map((bouton) => bouton.action_id), ["archiver"]);
      assert.equal(boutons[0].text.text, "Archive");
    },
  ],
  [
    "aucun bouton pour un statut final",
    () => {
      assert.deepEqual(boutonsPourStatut("ARCHIVE", "CE-2026-0042", "fr"), []);
      assert.deepEqual(boutonsPourStatut("REJETE", "CE-2026-0042", "fr"), []);
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
