import { Prisma, type Suivi } from "@prisma/client";
import { status } from "@grpc/grpc-js";
import { config } from "../config";
import { prisma } from "../prisma";
import { calculerEcheance } from "../domain/echeance";
import {
  ROLES_AFFECTATION,
  ROLES_ARCHIVE,
  ROLES_REJET,
  roleAutorise,
  validerTransition,
} from "../domain/statuts";
import { ErreurMetier, champManquant, courrierIntrouvable } from "../erreurs";
import { publierAffecte, publierStatutChange } from "../rabbitmq/publisher";

const LIMITE_DEFAUT = 20;
const LIMITE_MAX = 100;

function limiteDemandee(limite: number): number {
  const valeur = Math.trunc(limite) || LIMITE_DEFAUT;
  return Math.min(Math.max(valeur, 1), LIMITE_MAX);
}

export interface DonneesCourrierCree {
  type?: string;
  objet: string;
  expediteur: string;
  dateCourrier?: string | null;
  priorite?: string;
  confidentiel?: boolean;
  serviceCode?: string | null;
  destinataireSlackId?: string | null;
  agentSlackId?: string | null;
  langueDestinataire?: string;
}

export interface ResumeCourrier {
  numero: string;
  objet: string;
  statut: string;
  priorite: string;
  destinataire_slack_id: string;
  echeance: string;
  version: number;
}

function versResume(suivi: Suivi): ResumeCourrier {
  return {
    numero: suivi.numero,
    objet: suivi.objet,
    statut: suivi.statut,
    priorite: suivi.priorite,
    destinataire_slack_id: suivi.destinataireSlackId ?? "",
    echeance: suivi.echeance?.toISOString() ?? "",
    version: suivi.version,
  };
}

export async function lireUtilisateur(slackId: string) {
  return prisma.utilisateur.upsert({
    where: { slackId },
    update: {},
    create: { slackId, role: config.roleParDefaut },
  });
}

export async function enregistrerCourrierCree(
  numero: string,
  donnees: DonneesCourrierCree,
  eventId: string,
): Promise<boolean> {
  const affecte = Boolean(donnees.destinataireSlackId);
  const priorite = donnees.priorite || "NORMALE";
  const echeance = calculerEcheance(priorite, new Date(), config.delaiOuvrableJours);
  const acteur = donnees.agentSlackId || "service-courrier";
  let cree = false;

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.evenementTraite.create({ data: { eventId } });
      const dejaSuivi = await transaction.suivi.findUnique({
        where: { numero },
      });
      if (dejaSuivi) return;

      await transaction.suivi.create({
        data: {
          numero,
          type: donnees.type || "ENTRANT",
          objet: donnees.objet,
          expediteur: donnees.expediteur,
          priorite,
          confidentiel: donnees.confidentiel ?? false,
          serviceCode: donnees.serviceCode || null,
          destinataireSlackId: donnees.destinataireSlackId || null,
          agentSlackId: donnees.agentSlackId || null,
          langueDestinataire: donnees.langueDestinataire || "fr",
          statut: affecte ? "AFFECTE" : "ENREGISTRE",
          version: affecte ? 2 : 1,
          echeance,
        },
      });
      await transaction.historique.createMany({
        data: [
          { numero, statut: "ENREGISTRE", acteurSlackId: acteur },
          ...(affecte
            ? [
                {
                  numero,
                  statut: "AFFECTE",
                  acteurSlackId: acteur,
                  motif: "Destinataire choisi à la création",
                },
              ]
            : []),
        ],
      });
      cree = true;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }
    throw error;
  }

  if (affecte && cree) {
    await publierSansBloquer(() =>
      publierAffecte(numero, {
        destinataireSlackId: donnees.destinataireSlackId ?? "",
        ancienDestinataireSlackId: null,
        serviceCode: donnees.serviceCode || null,
        responsableSlackId: acteur,
        motif: null,
        echeance: echeance.toISOString(),
        objet: donnees.objet,
        priorite,
        confidentiel: donnees.confidentiel ?? false,
        agentSlackId: donnees.agentSlackId || null,
        langueDestinataire: donnees.langueDestinataire || "fr",
      }),
    );
  }
  return cree;
}

export async function enregistrerRappelRetard(eventId: string, numero: string): Promise<void> {
  try {
    await prisma.evenementTraite.create({ data: { eventId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }

  const suivi = await prisma.suivi.findUnique({ where: { numero } });
  if (!suivi) return;

  await prisma.historique.create({
    data: {
      numero,
      statut: suivi.statut,
      acteurSlackId: "service-notification",
      commentaire: "Rappel : échéance dépassée.",
    },
  });
}

export interface AffecterInput {
  numero: string;
  acteurSlackId: string;
  destinataireSlackId: string;
  serviceCode: string;
  motif: string;
}

export async function affecter(input: AffecterInput) {
  if (!input.numero.trim()) throw champManquant("Le numéro du courrier est obligatoire.");
  if (!input.destinataireSlackId.trim()) throw champManquant("Le destinataire est obligatoire.");

  const utilisateur = await lireUtilisateur(input.acteurSlackId);
  if (!roleAutorise(utilisateur.role, ROLES_AFFECTATION)) {
    throw new ErreurMetier(
      status.PERMISSION_DENIED,
      "DROIT_INSUFFISANT",
      "Vous n’êtes pas autorisé à affecter ce courrier.",
    );
  }

  const suivi = await prisma.suivi.findUnique({ where: { numero: input.numero } });
  if (!suivi) throw courrierIntrouvable();
  if (suivi.statut === "ARCHIVE") {
    throw new ErreurMetier(
      status.FAILED_PRECONDITION,
      "COURRIER_ARCHIVE",
      "Ce courrier est archivé et ne peut plus être modifié.",
    );
  }

  const redirection = Boolean(
    suivi.destinataireSlackId &&
      suivi.destinataireSlackId !== input.destinataireSlackId,
  );
  if (redirection && !input.motif.trim()) {
    throw new ErreurMetier(
      status.INVALID_ARGUMENT,
      "MOTIF_OBLIGATOIRE",
      "Un motif est obligatoire pour rediriger un courrier.",
    );
  }

  const maj = await prisma.$transaction(async (transaction) => {
    const courrier = await transaction.suivi.update({
      where: { numero: input.numero },
      data: {
        destinataireSlackId: input.destinataireSlackId,
        serviceCode: input.serviceCode || suivi.serviceCode,
        statut: "AFFECTE",
        version: { increment: 1 },
      },
    });
    await transaction.historique.create({
      data: {
        numero: input.numero,
        statut: "AFFECTE",
        acteurSlackId: input.acteurSlackId,
        commentaire: redirection ? "Redirection" : null,
        motif: input.motif || null,
      },
    });
    return courrier;
  });

  await publierSansBloquer(() =>
    publierAffecte(input.numero, {
      destinataireSlackId: input.destinataireSlackId,
      ancienDestinataireSlackId: suivi.destinataireSlackId,
      serviceCode: maj.serviceCode,
      responsableSlackId: input.acteurSlackId,
      motif: input.motif || null,
      echeance: maj.echeance?.toISOString() ?? null,
      objet: maj.objet,
      priorite: maj.priorite,
      confidentiel: maj.confidentiel,
      agentSlackId: maj.agentSlackId,
      langueDestinataire: maj.langueDestinataire,
    }),
  );

  return {
    numero: maj.numero,
    destinataire_slack_id: maj.destinataireSlackId ?? "",
    statut: maj.statut,
    version: maj.version,
  };
}

export interface ChangerStatutInput {
  numero: string;
  acteurSlackId: string;
  action: string;
  versionAttendue: number;
  commentaire: string;
  motif: string;
  nouveauDestinataireSlackId: string;
}

export async function changerStatut(input: ChangerStatutInput) {
  const suivi = await prisma.suivi.findUnique({ where: { numero: input.numero } });
  if (!suivi) throw courrierIntrouvable();

  if (input.versionAttendue > 0 && input.versionAttendue !== suivi.version) {
    throw new ErreurMetier(
      status.ABORTED,
      "CONFLIT_VERSION",
      "Ce courrier vient d’être modifié. Actualisez-le avant de réessayer.",
    );
  }

  const resultat = validerTransition(input.action, {
    statut: suivi.statut,
    destinataireSlackId: suivi.destinataireSlackId,
    acteurSlackId: input.acteurSlackId,
    commentaire: input.commentaire,
    motif: input.motif,
    nouveauDestinataireSlackId: input.nouveauDestinataireSlackId,
  });
  if (!resultat.ok) {
    throw new ErreurMetier(statutGrpcDe(resultat.code), resultat.code, resultat.message);
  }

  const utilisateur = await lireUtilisateur(input.acteurSlackId);
  if (input.action === "rejeter" && !roleAutorise(utilisateur.role, ROLES_REJET)) {
    throw new ErreurMetier(
      status.PERMISSION_DENIED,
      "DROIT_INSUFFISANT",
      "Vous n’êtes pas autorisé à rejeter ce courrier.",
    );
  }
  if (input.action === "archiver" && !roleAutorise(utilisateur.role, ROLES_ARCHIVE)) {
    throw new ErreurMetier(
      status.PERMISSION_DENIED,
      "DROIT_INSUFFISANT",
      "Vous n’êtes pas autorisé à archiver ce courrier.",
    );
  }

  const delegation = input.action === "deleguer";
  const maj = await prisma.$transaction(async (transaction) => {
    const courrier = await transaction.suivi.update({
      where: { numero: input.numero },
      data: {
        statut: resultat.statutSuivant,
        ...(delegation
          ? { destinataireSlackId: input.nouveauDestinataireSlackId }
          : {}),
        version: { increment: 1 },
      },
    });
    await transaction.historique.create({
      data: {
        numero: input.numero,
        statut: resultat.statutSuivant,
        acteurSlackId: input.acteurSlackId,
        commentaire: input.commentaire || null,
        motif: input.motif || null,
      },
    });
    return courrier;
  });

  await publierSansBloquer(() =>
    publierStatutChange(input.numero, {
      ancienStatut: suivi.statut,
      nouveauStatut: maj.statut,
      acteurSlackId: input.acteurSlackId,
      destinataireSlackId: maj.destinataireSlackId,
      agentSlackId: maj.agentSlackId,
      commentaire: input.commentaire || null,
      motif: input.motif || null,
    }),
  );

  if (delegation) {
    await publierSansBloquer(() =>
      publierAffecte(input.numero, {
        destinataireSlackId: input.nouveauDestinataireSlackId,
        ancienDestinataireSlackId: suivi.destinataireSlackId,
        serviceCode: maj.serviceCode,
        responsableSlackId: input.acteurSlackId,
        motif: input.motif || null,
        echeance: maj.echeance?.toISOString() ?? null,
        objet: maj.objet,
        priorite: maj.priorite,
        confidentiel: maj.confidentiel,
        agentSlackId: maj.agentSlackId,
        langueDestinataire: maj.langueDestinataire,
      }),
    );
  }

  return {
    numero: maj.numero,
    ancien_statut: suivi.statut,
    nouveau_statut: maj.statut,
    version: maj.version,
  };
}

export async function obtenirHistorique(numero: string) {
  const suivi = await prisma.suivi.findUnique({
    where: { numero },
    include: { historique: { orderBy: { creeLe: "asc" } } },
  });
  if (!suivi) throw courrierIntrouvable();

  return {
    entrees: suivi.historique.map((entree) => ({
      statut: entree.statut,
      acteur_slack_id: entree.acteurSlackId,
      commentaire: entree.commentaire ?? "",
      motif: entree.motif ?? "",
      cree_le: entree.creeLe.toISOString(),
    })),
    version_actuelle: suivi.version,
  };
}

export async function listerCourriersDuDestinataire(
  acteurSlackId: string,
  limite: number,
): Promise<{ courriers: ResumeCourrier[] }> {
  const suivis = await prisma.suivi.findMany({
    where: {
      destinataireSlackId: acteurSlackId,
      statut: { notIn: ["TRAITE", "ARCHIVE", "REJETE"] },
    },
    orderBy: [{ echeance: { sort: "asc", nulls: "last" } }],
    take: limiteDemandee(limite),
  });
  return { courriers: suivis.map(versResume) };
}

export async function listerCourriersDuService(
  acteurSlackId: string,
  serviceCode: string,
  limite: number,
): Promise<{ courriers: ResumeCourrier[] }> {
  const code = serviceCode || (await lireUtilisateur(acteurSlackId)).serviceCode;
  if (!code) throw champManquant("Le code de service est obligatoire.");

  const suivis = await prisma.suivi.findMany({
    where: { serviceCode: code, statut: { not: "ARCHIVE" } },
    orderBy: [{ echeance: { sort: "asc", nulls: "last" } }],
    take: limiteDemandee(limite),
  });
  return { courriers: suivis.map(versResume) };
}

export async function obtenirStatistiques(serviceCode: string) {
  const filtre: Prisma.SuiviWhereInput = serviceCode
    ? { serviceCode }
    : {};
  const actifs = { notIn: ["TRAITE", "ARCHIVE", "REJETE"] };

  const [total, enregistres, affectes, recusEnCours, traites, enRetard] =
    await Promise.all([
      prisma.suivi.count({ where: filtre }),
      prisma.suivi.count({ where: { ...filtre, statut: "ENREGISTRE" } }),
      prisma.suivi.count({ where: { ...filtre, statut: "AFFECTE" } }),
      prisma.suivi.count({ where: { ...filtre, statut: { in: ["RECU", "EN_COURS"] } } }),
      prisma.suivi.count({ where: { ...filtre, statut: "TRAITE" } }),
      prisma.suivi.count({
        where: {
          ...filtre,
          echeance: { lt: new Date() },
          statut: actifs,
        },
      }),
    ]);

  return {
    total,
    enregistres,
    affectes,
    en_cours: recusEnCours,
    traites,
    en_retard: enRetard,
  };
}

export async function obtenirUtilisateur(slackId: string) {
  if (!slackId.trim()) throw champManquant("L’identifiant Slack est obligatoire.");
  const utilisateur = await lireUtilisateur(slackId);
  return {
    slack_id: utilisateur.slackId,
    role: utilisateur.role,
    service_code: utilisateur.serviceCode ?? "",
    langue: utilisateur.langue,
  };
}

export async function definirLangue(acteurSlackId: string, langue: string) {
  if (!acteurSlackId.trim()) throw champManquant("L’identifiant Slack est obligatoire.");
  if (langue !== "fr" && langue !== "en") {
    throw champManquant("La langue doit valoir fr ou en.");
  }
  const utilisateur = await prisma.utilisateur.upsert({
    where: { slackId: acteurSlackId },
    update: { langue },
    create: { slackId: acteurSlackId, role: config.roleParDefaut, langue },
  });
  return { slack_id: utilisateur.slackId, langue: utilisateur.langue };
}

function statutGrpcDe(code: string): number {
  switch (code) {
    case "CHAMP_MANQUANT":
    case "COMMENTAIRE_OBLIGATOIRE":
    case "MOTIF_OBLIGATOIRE":
      return status.INVALID_ARGUMENT;
    case "DROIT_INSUFFISANT":
      return status.PERMISSION_DENIED;
    case "COURRIER_ARCHIVE":
    case "TRANSITION_INTERDITE":
      return status.FAILED_PRECONDITION;
    default:
      return status.INVALID_ARGUMENT;
  }
}

async function publierSansBloquer(publication: () => Promise<void>): Promise<void> {
  try {
    await publication();
  } catch (error) {
    console.error(
      `[service-workflow] publication impossible: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
