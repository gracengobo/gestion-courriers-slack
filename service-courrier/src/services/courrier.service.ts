import { prisma } from '../prisma';
import { publishCourrierCree } from '../rabbitmq/publisher';

async function genererNumero(): Promise<string> {
  const annee = new Date().getFullYear();
  const prefix = `CE-${annee}-`;

  const dernier = await prisma.courrier.findFirst({
    where: { numero: { startsWith: prefix } },
    orderBy: { numero: 'desc' },
  });

  let compteur = 1;
  if (dernier) {
    const dernierNumero = Number.parseInt(dernier.numero.split('-')[2], 10);
    compteur = Number.isNaN(dernierNumero) ? 1 : dernierNumero + 1;
  }

  return `${prefix}${String(compteur).padStart(4, '0')}`;
}

export async function createCourrier(data: {
  objet: string;
  expediteur: string;
  destinataire: string;
  contenu?: string;
  pieceJointeUrl?: string;
}) {
  const numero = await genererNumero();

  const courrier = await prisma.courrier.create({
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
