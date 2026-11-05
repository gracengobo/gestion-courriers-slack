import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { publishCourrierCree } from '../rabbitmq/publisher';

const MAX_SEARCH_RESULTS = 100;
const DEFAULT_SEARCH_RESULTS = 20;

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

export async function createCourrier(data: {
  objet: string;
  expediteur: string;
  destinataire: string;
  contenu?: string;
  pieceJointeUrl?: string;
}) {
  const courrier = await prisma.$transaction(async (transaction) => {
    const { numero, annee } = await genererNumero(transaction);
    const created = await transaction.courrier.create({
      data: {
        numero,
        objet: data.objet,
        expediteur: data.expediteur,
        destinataire: data.destinataire,
        contenu: data.contenu || null,
        pieceJointeUrl: data.pieceJointeUrl || null,
        statut: 'RECU',
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
          details: { fields: ['objet', 'expediteur', 'destinataire', 'contenu', 'pieceJointeUrl'] },
        },
      ],
    });

    return created;
  });

  await publishCourrierCree({
    id: courrier.id,
    numero: courrier.numero,
    objet: courrier.objet,
    destinataire: courrier.destinataire,
  });

  return courrier;
}

export async function getCourrierByNumero(numero: string) {
  return prisma.courrier.findUnique({ where: { numero } });
}

export async function updateCourrier(
  numero: string,
  data: {
    objet: string;
    expediteur: string;
    destinataire: string;
    contenu?: string;
    pieceJointeUrl?: string;
  },
) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.courrier.findUnique({ where: { numero } });
    if (!existing) return null;

    const updatedData = {
      objet: data.objet,
      expediteur: data.expediteur,
      destinataire: data.destinataire,
      contenu: data.contenu || null,
      pieceJointeUrl: data.pieceJointeUrl || null,
    };
    const changedFields = [
      ...(existing.objet !== updatedData.objet ? ['objet'] : []),
      ...(existing.expediteur !== updatedData.expediteur ? ['expediteur'] : []),
      ...(existing.destinataire !== updatedData.destinataire ? ['destinataire'] : []),
      ...(existing.contenu !== updatedData.contenu ? ['contenu'] : []),
      ...(existing.pieceJointeUrl !== updatedData.pieceJointeUrl ? ['pieceJointeUrl'] : []),
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

export async function searchCourriers(query: string, limit = DEFAULT_SEARCH_RESULTS) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error('Le terme de recherche ne peut pas être vide');
  }

  const take = Math.min(Math.max(Math.trunc(limit) || DEFAULT_SEARCH_RESULTS, 1), MAX_SEARCH_RESULTS);
  return prisma.courrier.findMany({
    where: {
      OR: [
        { numero: { contains: normalizedQuery, mode: 'insensitive' } },
        { expediteur: { contains: normalizedQuery, mode: 'insensitive' } },
        { objet: { contains: normalizedQuery, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take,
  });
}
