import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { publishCourrierCree } from '../rabbitmq/publisher';

const MAX_SEARCH_RESULTS = 100;
const DEFAULT_SEARCH_RESULTS = 20;

export interface PieceJointeInput {
  bucket: string;
  cle: string;
  nomOriginal: string;
  typeMime: string;
  tailleOctets: bigint;
  empreinteSha256: string;
}

export interface CreateCourrierInput {
  type: string;
  objet: string;
  expediteur: string;
  dateCourrier: string;
  priorite: string;
  confidentiel: boolean;
  serviceCode: string;
  destinataireSlackId: string;
  agentSlackId: string;
  langueDestinataire: string;
  pieceJointe?: PieceJointeInput;
}

async function genererNumero(
  transaction: Prisma.TransactionClient,
): Promise<{ numero: string; annee: number }> {
  const annee = new Date().getFullYear();
  const [compteur] = await transaction.$queryRaw<Array<{ dernierNumero: number }>>`
    INSERT INTO "compteurs_courrier" ("annee", "dernierNumero")
    VALUES (${annee}, 1)
    ON CONFLICT ("annee")
    DO UPDATE SET "dernierNumero" = "compteurs_courrier"."dernierNumero" + 1
    RETURNING "dernierNumero"
  `;

  return {
    annee,
    numero: `CE-${annee}-${String(compteur.dernierNumero).padStart(4, '0')}`,
  };
}

export async function createCourrier(data: CreateCourrierInput) {
  const courrier = await prisma.$transaction(async (transaction) => {
    const { numero, annee } = await genererNumero(transaction);
    const created = await transaction.courrier.create({
      data: {
        numero,
        type: data.type || 'ENTRANT',
        objet: data.objet,
        expediteur: data.expediteur,
        destinataire: data.destinataireSlackId || null,
        dateCourrier: data.dateCourrier || null,
        priorite: data.priorite || 'NORMALE',
        confidentiel: data.confidentiel,
        serviceCode: data.serviceCode || null,
        agentSlackId: data.agentSlackId || null,
        langueDestinataire: data.langueDestinataire || 'fr',
        pieceJointeBucket: data.pieceJointe?.bucket || null,
        pieceJointeCle: data.pieceJointe?.cle || null,
        pieceJointeNomOriginal: data.pieceJointe?.nomOriginal || null,
        pieceJointeTypeMime: data.pieceJointe?.typeMime || null,
        pieceJointeTailleOctets: data.pieceJointe?.tailleOctets ?? null,
        pieceJointeEmpreinteSha256: data.pieceJointe?.empreinteSha256 || null,
        pieceJointeUrl: data.pieceJointe
          ? `${data.pieceJointe.bucket}/${data.pieceJointe.cle}`
          : null,
        statut: 'ENREGISTRE',
      },
    });

    await transaction.journalAudit.createMany({
      data: [
        {
          action: 'NUMERO_ATTRIBUE',
          courrierId: created.id,
          numero,
          details: { annee, numero },
        },
        {
          action: 'COURRIER_CREE',
          courrierId: created.id,
          numero,
          details: {
            fields: [
              'type',
              'objet',
              'expediteur',
              'dateCourrier',
              'priorite',
              'confidentiel',
              'serviceCode',
              'destinataireSlackId',
              'agentSlackId',
              'langueDestinataire',
              'pieceJointe',
            ],
          },
        },
      ],
    });

    return created;
  });

  try {
    await publishCourrierCree({
      numero: courrier.numero,
      type: courrier.type,
      objet: courrier.objet,
      expediteur: courrier.expediteur,
      dateCourrier: courrier.dateCourrier,
      priorite: courrier.priorite,
      confidentiel: courrier.confidentiel,
      serviceCode: courrier.serviceCode,
      destinataireSlackId: courrier.destinataire,
      agentSlackId: courrier.agentSlackId,
      pieceJointe: courrier.pieceJointeCle
        ? {
            bucket: courrier.pieceJointeBucket ?? '',
            cle: courrier.pieceJointeCle,
            nomOriginal: courrier.pieceJointeNomOriginal ?? '',
            typeMime: courrier.pieceJointeTypeMime ?? '',
            tailleOctets: Number(courrier.pieceJointeTailleOctets ?? 0),
            empreinteSha256: courrier.pieceJointeEmpreinteSha256 ?? '',
          }
        : null,
    });
  } catch (error) {
    console.error(
      `[service-courrier] ${courrier.numero} enregistré, mais publication de courrier.cree impossible: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return courrier;
}

export async function getCourrierByNumero(numero: string) {
  return prisma.courrier.findUnique({ where: { numero } });
}

export async function updateCourrier(
  numero: string,
  data: {
    objet?: string;
    expediteur?: string;
    destinataire?: string | null;
    contenu?: string;
    pieceJointeUrl?: string;
    dateCourrier?: string;
    priorite?: string;
    confidentiel?: boolean;
  },
) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.courrier.findUnique({ where: { numero } });
    if (!existing) return null;

    const updatedData = {
      objet: data.objet ?? existing.objet,
      expediteur: data.expediteur ?? existing.expediteur,
      destinataire: data.destinataire === undefined ? existing.destinataire : data.destinataire,
      contenu: data.contenu === undefined ? existing.contenu : data.contenu || null,
      pieceJointeUrl:
        data.pieceJointeUrl === undefined ? existing.pieceJointeUrl : data.pieceJointeUrl || null,
      dateCourrier: data.dateCourrier ?? existing.dateCourrier,
      priorite: data.priorite || existing.priorite,
      confidentiel: data.confidentiel ?? existing.confidentiel,
    };
    const changedFields = [
      ...(existing.objet !== updatedData.objet ? ['objet'] : []),
      ...(existing.expediteur !== updatedData.expediteur ? ['expediteur'] : []),
      ...(existing.destinataire !== updatedData.destinataire ? ['destinataire'] : []),
      ...(existing.contenu !== updatedData.contenu ? ['contenu'] : []),
      ...(existing.pieceJointeUrl !== updatedData.pieceJointeUrl ? ['pieceJointeUrl'] : []),
      ...(existing.dateCourrier !== updatedData.dateCourrier ? ['dateCourrier'] : []),
      ...(existing.priorite !== updatedData.priorite ? ['priorite'] : []),
      ...(existing.confidentiel !== updatedData.confidentiel ? ['confidentiel'] : []),
    ];

    const courrier = await transaction.courrier.update({
      where: { numero },
      data: updatedData,
    });

    if (changedFields.length > 0) {
      await transaction.journalAudit.create({
        data: {
          action: 'COURRIER_MODIFIE',
          courrierId: courrier.id,
          numero: courrier.numero,
          details: { fields: changedFields },
        },
      });
    }

    return courrier;
  });
}

export async function searchCourriers(
  query: string,
  limit = DEFAULT_SEARCH_RESULTS,
  filters: { serviceCode?: string; dateDebut?: string; dateFin?: string } = {},
) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery && !filters.serviceCode && !filters.dateDebut && !filters.dateFin) {
    throw new Error('Le terme de recherche ne peut pas être vide');
  }

  const take = Math.min(Math.max(Math.trunc(limit) || DEFAULT_SEARCH_RESULTS, 1), MAX_SEARCH_RESULTS);
  const and: Prisma.CourrierWhereInput[] = [];
  if (normalizedQuery) {
    and.push({
      OR: [
        { numero: { contains: normalizedQuery, mode: 'insensitive' } },
        { expediteur: { contains: normalizedQuery, mode: 'insensitive' } },
        { objet: { contains: normalizedQuery, mode: 'insensitive' } },
      ],
    });
  }
  if (filters.serviceCode) and.push({ serviceCode: filters.serviceCode });
  if (filters.dateDebut || filters.dateFin) {
    and.push({
      dateCourrier: {
        ...(filters.dateDebut ? { gte: filters.dateDebut } : {}),
        ...(filters.dateFin ? { lte: filters.dateFin } : {}),
      },
    });
  }

  return prisma.courrier.findMany({
    where: { AND: and },
    orderBy: { createdAt: 'desc' },
    take,
  });
}
