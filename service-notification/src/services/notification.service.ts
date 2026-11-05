import type { KnownBlock } from "@slack/types";
import { prisma } from "../prisma";
import { libelleStatut, normaliserLangue, traduire, type Langue } from "../i18n";
import { envoyerDm, mettreAJourMessage } from "../slack";
import { boutonsPourStatut } from "../domain/boutons";
import { etatRappel, memeJour } from "../domain/rappels";
import { publierRetard } from "../rabbitmq/publisher";
import type {
  DonneesCourrierAffecte,
  DonneesCourrierAnalyse,
  DonneesCourrierCree,
  DonneesStatutChange,
} from "../types";

const STATUTS_FINAUX = new Set(["TRAITE", "ARCHIVE", "REJETE"]);

function mention(userId: string | null | undefined, langue: Langue): string {
  return userId ? `<@${userId}>` : traduire(langue, "notification.valeur_absente");
}

function formaterEcheance(echeance: Date, langue: Langue): string {
  return `${echeance.toLocaleDateString(langue === "en" ? "en-GB" : "fr-FR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })} 16:00 UTC`;
}

function carteStatut(
  numero: string,
  corps: string,
  statut: string,
  langue: Langue,
  avecActions: boolean,
): KnownBlock[] {
  const blocs: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${traduire(langue, "notification.statut_courrier_titre", { numero })}*`,
      },
    },
    { type: "section", text: { type: "mrkdwn", text: corps } },
  ];

  const boutons = avecActions ? boutonsPourStatut(statut, numero, langue) : [];
  if (boutons.length > 0) {
    blocs.push({ type: "actions", block_id: `actions_${statut.toLowerCase()}`, elements: boutons });
  }
  return blocs;
}

async function enregistrerMessage(
  numero: string,
  type: string,
  destinataireSlackId: string,
  envoye: { canal: string; ts: string },
): Promise<void> {
  await prisma.messageSlack.upsert({
    where: {
      numero_type_destinataireSlackId: { numero, type, destinataireSlackId },
    },
    create: { numero, type, destinataireSlackId, canal: envoye.canal, ts: envoye.ts },
    update: { canal: envoye.canal, ts: envoye.ts },
  });
}

export async function traiterCourrierCree(
  numero: string,
  donnees: DonneesCourrierCree,
): Promise<void> {
  const langue = normaliserLangue(donnees.langueDestinataire);

  await prisma.courrierNotifie.upsert({
    where: { numero },
    create: {
      numero,
      objet: donnees.objet,
      priorite: donnees.priorite,
      serviceCode: donnees.serviceCode ?? null,
      agentSlackId: donnees.agentSlackId ?? null,
      destinataireSlackId: donnees.destinataireSlackId ?? null,
      langue,
      statut: "ENREGISTRE",
    },
    update: {
      objet: donnees.objet,
      priorite: donnees.priorite,
      serviceCode: donnees.serviceCode ?? null,
      agentSlackId: donnees.agentSlackId ?? null,
      destinataireSlackId: donnees.destinataireSlackId ?? null,
      langue,
    },
  });

  if (donnees.agentSlackId) {
    const texte = `${traduire(langue, "notification.courrier_cree", { numero })}\n${traduire(
      langue,
      "notification.courrier_cree_detail",
      { objet: donnees.objet, expediteur: donnees.expediteur },
    )}`;
    await envoyerDm(donnees.agentSlackId, texte);
  }
}

export async function traiterCourrierAnalyse(
  numero: string,
  donnees: DonneesCourrierAnalyse,
): Promise<void> {
  const courrier = await prisma.courrierNotifie.findUnique({ where: { numero } });
  const langue = normaliserLangue(courrier?.langue);
  const cible = courrier?.responsableSlackId ?? courrier?.agentSlackId;

  if (!cible) {
    console.warn(
      `[service-notification] ${numero} : aucun responsable ni agent pour recevoir l'analyse.`,
    );
    return;
  }

  if (donnees.statutAnalyse !== "ok") {
    await envoyerDm(
      cible,
      traduire(langue, "notification.analyse_indisponible", {
        numero,
        statut: donnees.statutAnalyse ?? "echec",
      }),
    );
    return;
  }

  const texte = traduire(langue, "notification.validation_titre", { numero });
  const blocs: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${texte}*\n${traduire(langue, "notification.validation_corps", {
          objet: courrier?.objet ?? traduire(langue, "notification.valeur_absente"),
          categorie: donnees.categorie ?? traduire(langue, "notification.valeur_absente"),
          service: donnees.serviceSuggere ?? traduire(langue, "notification.valeur_absente"),
          urgence: donnees.urgence ?? traduire(langue, "notification.valeur_absente"),
          confiance:
            typeof donnees.confiance === "number"
              ? Math.round(donnees.confiance * 100)
              : traduire(langue, "notification.valeur_absente"),
          resume: donnees.resume ?? traduire(langue, "notification.valeur_absente"),
        })}`,
      },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: traduire(langue, "notification.validation_source_ia") },
      ],
    },
    {
      type: "actions",
      block_id: "actions_validation",
      elements: [
        {
          type: "button",
          action_id: "valider_affectation",
          text: { type: "plain_text", text: traduire(langue, "notification.bouton_valider"), emoji: true },
          style: "primary",
          value: numero,
        },
        {
          type: "button",
          action_id: "modifier_affectation",
          text: { type: "plain_text", text: traduire(langue, "notification.bouton_modifier"), emoji: true },
          value: numero,
        },
      ],
    },
  ];

  const envoye = await envoyerDm(cible, texte, blocs);
  if (envoye) await enregistrerMessage(numero, "validation", cible, envoye);
}

export async function traiterCourrierAffecte(
  numero: string,
  donnees: DonneesCourrierAffecte,
): Promise<void> {
  const langue = normaliserLangue(donnees.langueDestinataire);
  const echeance = donnees.echeance ? new Date(donnees.echeance) : null;

  await prisma.courrierNotifie.upsert({
    where: { numero },
    create: {
      numero,
      objet: donnees.objet,
      priorite: donnees.priorite,
      serviceCode: donnees.serviceCode ?? null,
      agentSlackId: donnees.agentSlackId ?? null,
      destinataireSlackId: donnees.destinataireSlackId,
      responsableSlackId: donnees.responsableSlackId,
      langue,
      echeance,
      statut: "AFFECTE",
      actif: true,
    },
    update: {
      objet: donnees.objet,
      priorite: donnees.priorite,
      serviceCode: donnees.serviceCode ?? null,
      agentSlackId: donnees.agentSlackId ?? null,
      destinataireSlackId: donnees.destinataireSlackId,
      responsableSlackId: donnees.responsableSlackId,
      langue,
      echeance,
      statut: "AFFECTE",
      actif: true,
    },
  });

  if (echeance) {
    const remiseAZero = {
      echeance,
      objet: donnees.objet,
      destinataireSlackId: donnees.destinataireSlackId,
      responsableSlackId: donnees.responsableSlackId,
      langue,
      actif: true,
      rappelJ2Envoye: false,
      rappelJourEnvoye: false,
      retardSignaleLe: null,
    };
    await prisma.rappel.upsert({
      where: { numero },
      create: { numero, ...remiseAZero },
      update: remiseAZero,
    });
  } else {
    await prisma.rappel.updateMany({ where: { numero }, data: { actif: false } });
  }

  if (
    donnees.ancienDestinataireSlackId &&
    donnees.ancienDestinataireSlackId !== donnees.destinataireSlackId
  ) {
    await envoyerDm(
      donnees.ancienDestinataireSlackId,
      traduire(langue, "notification.affecte_redirection", {
        numero,
        motif: donnees.motif ?? traduire(langue, "notification.valeur_absente"),
      }),
    );
  }

  const corps = traduire(langue, "notification.affecte_corps", {
    objet: donnees.objet,
    priorite: donnees.priorite,
    echeance: echeance
      ? formaterEcheance(echeance, langue)
      : traduire(langue, "notification.valeur_absente"),
    agent: mention(donnees.agentSlackId, langue),
    service: donnees.serviceCode ?? traduire(langue, "notification.valeur_absente"),
  });
  const blocs = carteStatut(numero, corps, "AFFECTE", langue, true);
  const envoye = await envoyerDm(
    donnees.destinataireSlackId,
    traduire(langue, "notification.affecte_titre", { numero }),
    blocs,
  );
  if (envoye) {
    await enregistrerMessage(numero, "affectation", donnees.destinataireSlackId, envoye);
  }
}

function detailChangement(
  langue: Langue,
  donnees: DonneesStatutChange,
): string {
  return traduire(langue, "notification.statut_change_detail", {
    acteur: mention(donnees.acteurSlackId, langue),
    commentaire: donnees.commentaire ?? traduire(langue, "notification.valeur_absente"),
    motif: donnees.motif ?? traduire(langue, "notification.valeur_absente"),
  });
}

export async function traiterStatutChange(
  numero: string,
  donnees: DonneesStatutChange,
): Promise<void> {
  const courrier = await prisma.courrierNotifie.findUnique({ where: { numero } });
  const langue = normaliserLangue(courrier?.langue);
  const statutFinal = STATUTS_FINAUX.has(donnees.nouveauStatut);

  await prisma.courrierNotifie.updateMany({
    where: { numero },
    data: { statut: donnees.nouveauStatut, actif: !statutFinal },
  });

  if (statutFinal) {
    await prisma.rappel.updateMany({ where: { numero }, data: { actif: false } });
  }

  const texte = traduire(langue, "notification.statut_change", {
    numero,
    ancien: libelleStatut(langue, donnees.ancienStatut),
    nouveau: libelleStatut(langue, donnees.nouveauStatut),
  });
  const corps = `${texte}\n${detailChangement(langue, donnees)}`;
  const messages = await prisma.messageSlack.findMany({
    where: { numero, type: "affectation" },
  });
  for (const message of messages) {
    const destinataireCourant = message.destinataireSlackId === donnees.destinataireSlackId;
    const blocs = carteStatut(
      numero,
      corps,
      donnees.nouveauStatut,
      langue,
      destinataireCourant && !statutFinal,
    );
    await mettreAJourMessage(message.canal, message.ts, texte, blocs);
  }

  if (courrier?.agentSlackId && courrier.agentSlackId !== donnees.acteurSlackId) {
    await envoyerDm(courrier.agentSlackId, corps);
  }
}

export async function executerRappels(maintenant: Date = new Date()): Promise<void> {
  const rappels = await prisma.rappel.findMany({ where: { actif: true } });

  for (const rappel of rappels) {
    const langue = normaliserLangue(rappel.langue);
    const etat = etatRappel(rappel.echeance, maintenant, rappel);
    const echeance = formaterEcheance(rappel.echeance, langue);

    if (etat.envoyerJ2) {
      await envoyerDm(
        rappel.destinataireSlackId,
        traduire(langue, "notification.rappel_j2", {
          numero: rappel.numero,
          objet: rappel.objet,
          echeance,
        }),
      );
      await prisma.rappel.update({ where: { id: rappel.id }, data: { rappelJ2Envoye: true } });
    }

    if (etat.envoyerJour) {
      await envoyerDm(
        rappel.destinataireSlackId,
        traduire(langue, "notification.rappel_jour", {
          numero: rappel.numero,
          objet: rappel.objet,
          echeance,
        }),
      );
      await prisma.rappel.update({ where: { id: rappel.id }, data: { rappelJourEnvoye: true } });
    }

    if (etat.enRetard && !(rappel.retardSignaleLe && memeJour(rappel.retardSignaleLe, maintenant))) {
      const cible = rappel.responsableSlackId ?? rappel.destinataireSlackId;
      await envoyerDm(
        cible,
        traduire(langue, "notification.retard", {
          numero: rappel.numero,
          objet: rappel.objet,
          jours: etat.joursDeRetard,
          echeance,
        }),
      );
      await publierRetard(rappel.numero, {
        echeance: rappel.echeance.toISOString(),
        joursDeRetard: etat.joursDeRetard,
        destinataireSlackId: rappel.destinataireSlackId,
        responsableSlackId: rappel.responsableSlackId,
      });
      await prisma.rappel.update({
        where: { id: rappel.id },
        data: { retardSignaleLe: maintenant },
      });
    }
  }
}
