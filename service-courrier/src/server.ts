import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import dotenv from 'dotenv';
import {
  createCourrier,
  getCourrierByNumero,
  searchCourriers,
  updateCourrier,
  type CreateCourrierInput,
} from './services/courrier.service';

dotenv.config();

interface PieceJointeRequest {
  bucket: string;
  cle: string;
  nom_original: string;
  type_mime: string;
  taille_octets: string | number;
  empreinte_sha256: string;
}

interface CreerCourrierRequest {
  type: string;
  objet: string;
  expediteur: string;
  date_courrier: string;
  priorite: string;
  confidentiel: boolean;
  service_code: string;
  destinataire_slack_id: string;
  agent_slack_id: string;
  langue_destinataire: string;
  piece_jointe?: PieceJointeRequest;
}

interface NumeroRequest {
  numero: string;
  acteur_slack_id: string;
}

interface RechercherCourriersRequest extends NumeroRequest {
  requete: string;
  objet: string;
  expediteur: string;
  service_code: string;
  date_debut: string;
  date_fin: string;
  limite: number;
  categorie: string;
}

interface CorrigerCourrierRequest extends NumeroRequest {
  objet: string;
  expediteur: string;
  date_courrier: string;
  priorite: string;
  confidentiel: boolean;
}

interface CourrierResponse {
  numero: string;
  type: string;
  objet: string;
  expediteur: string;
  date_courrier: string;
  priorite: string;
  confidentiel: boolean;
  service_code: string;
  destinataire_slack_id: string;
  agent_slack_id: string;
  piece_jointe?: PieceJointeRequest;
  cree_le: string;
}

type UnaryCall<Request> = { request: Request };
type UnaryCallback<Response> = (
  error: grpc.ServiceError | null,
  response?: Response,
) => void;

const PROTO_PATH = path.join(__dirname, '../proto/courrier.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const loadedPackage = grpc.loadPackageDefinition(packageDefinition);
const courrierPackage = isRecord(loadedPackage['courrier'])
  ? loadedPackage['courrier']
  : undefined;
const courrierV1 = courrierPackage && isRecord(courrierPackage['v1'])
  ? courrierPackage['v1']
  : undefined;
const serviceConstructor = courrierV1?.['CourrierService'];
if (!isServiceConstructor(serviceConstructor)) {
  throw new Error('Le service courrier.v1.CourrierService est absent du contrat gRPC.');
}
const courrierServiceConstructor: grpc.ServiceClientConstructor = serviceConstructor;

function serviceError(
  code: grpc.status,
  businessCode: string,
  details: string,
): grpc.ServiceError {
  const metadata = new grpc.Metadata();
  metadata.set('code-metier', businessCode);
  return Object.assign(new Error(details), {
    code,
    details,
    metadata,
  }) as grpc.ServiceError;
}

function toCourrierResponse(courrier: {
  numero: string;
  type: string;
  objet: string;
  expediteur: string;
  destinataire: string | null;
  dateCourrier: string | null;
  priorite: string;
  confidentiel: boolean;
  serviceCode: string | null;
  agentSlackId: string | null;
  langueDestinataire: string;
  pieceJointeBucket: string | null;
  pieceJointeCle: string | null;
  pieceJointeNomOriginal: string | null;
  pieceJointeTypeMime: string | null;
  pieceJointeTailleOctets: bigint | null;
  pieceJointeEmpreinteSha256: string | null;
  statut: string;
  createdAt: Date;
}): CourrierResponse {
  return {
    numero: courrier.numero,
    type: courrier.type,
    objet: courrier.objet,
    expediteur: courrier.expediteur,
    date_courrier: courrier.dateCourrier ?? '',
    priorite: courrier.priorite,
    confidentiel: courrier.confidentiel,
    service_code: courrier.serviceCode ?? '',
    destinataire_slack_id: courrier.destinataire ?? '',
    agent_slack_id: courrier.agentSlackId ?? '',
    ...(courrier.pieceJointeCle
      ? {
          piece_jointe: {
            bucket: courrier.pieceJointeBucket ?? '',
            cle: courrier.pieceJointeCle,
            nom_original: courrier.pieceJointeNomOriginal ?? '',
            type_mime: courrier.pieceJointeTypeMime ?? '',
            taille_octets: courrier.pieceJointeTailleOctets?.toString() ?? '0',
            empreinte_sha256: courrier.pieceJointeEmpreinteSha256 ?? '',
          },
        }
      : {}),
    cree_le: courrier.createdAt.toISOString(),
  };
}

const handlers = {
  creerCourrier: async (
    call: UnaryCall<CreerCourrierRequest>,
    callback: UnaryCallback<{ numero: string }>,
  ) => {
    const request = call.request;
    if (!request.objet.trim() || !request.expediteur.trim()) {
      callback(serviceError(
        grpc.status.INVALID_ARGUMENT,
        'CHAMP_MANQUANT',
        'L’objet et l’expéditeur sont obligatoires.',
      ));
      return;
    }

    try {
      const input: CreateCourrierInput = {
        type: request.type || 'ENTRANT',
        objet: request.objet.trim(),
        expediteur: request.expediteur.trim(),
        dateCourrier: request.date_courrier,
        priorite: request.priorite || 'NORMALE',
        confidentiel: request.confidentiel,
        serviceCode: request.service_code,
        destinataireSlackId: request.destinataire_slack_id,
        agentSlackId: request.agent_slack_id,
        langueDestinataire: request.langue_destinataire || 'fr',
        ...(request.piece_jointe
          ? {
              pieceJointe: {
                bucket: request.piece_jointe.bucket,
                cle: request.piece_jointe.cle,
                nomOriginal: request.piece_jointe.nom_original,
                typeMime: request.piece_jointe.type_mime,
                tailleOctets: BigInt(request.piece_jointe.taille_octets),
                empreinteSha256: request.piece_jointe.empreinte_sha256,
              },
            }
          : {}),
      };
      const courrier = await createCourrier(input);

      console.info(`[service-courrier] ${courrier.numero} courrier créé`);
      callback(null, { numero: courrier.numero });
    } catch (error) {
      console.error(
        `[service-courrier] erreur de création: ${error instanceof Error ? error.message : String(error)}`,
      );
      callback(serviceError(
        grpc.status.UNAVAILABLE,
        'SERVICE_INDISPONIBLE',
        'Impossible d’enregistrer le courrier pour le moment.',
      ));
    }
  },

  obtenirCourrier: async (
    call: UnaryCall<NumeroRequest>,
    callback: UnaryCallback<CourrierResponse>,
  ) => {
    try {
      const courrier = await getCourrierByNumero(call.request.numero.trim());
      if (!courrier) {
        callback(serviceError(
          grpc.status.NOT_FOUND,
          'COURRIER_INTROUVABLE',
          'Courrier introuvable.',
        ));
        return;
      }

      callback(null, toCourrierResponse(courrier));
    } catch (error) {
      console.error(
        `[service-courrier] erreur de consultation: ${error instanceof Error ? error.message : String(error)}`,
      );
      callback(serviceError(
        grpc.status.UNAVAILABLE,
        'SERVICE_INDISPONIBLE',
        'Impossible de consulter le courrier pour le moment.',
      ));
    }
  },

  rechercherCourriers: async (
    call: UnaryCall<RechercherCourriersRequest>,
    callback: UnaryCallback<{ courriers: CourrierResponse[] }>,
  ) => {
    const request = call.request;
    const query = request.requete.trim()
      || request.numero.trim()
      || request.objet.trim()
      || request.expediteur.trim();
    if (
      !query
      && !request.service_code.trim()
      && !request.date_debut.trim()
      && !request.date_fin.trim()
    ) {
      callback(serviceError(
        grpc.status.INVALID_ARGUMENT,
        'CHAMP_MANQUANT',
        'Un critère de recherche est obligatoire.',
      ));
      return;
    }

    try {
      const courriers = await searchCourriers(query, request.limite, {
        serviceCode: request.service_code,
        dateDebut: request.date_debut,
        dateFin: request.date_fin,
      });
      callback(null, { courriers: courriers.map(toCourrierResponse) });
    } catch (error) {
      console.error(
        `[service-courrier] erreur de recherche: ${error instanceof Error ? error.message : String(error)}`,
      );
      callback(serviceError(
        grpc.status.UNAVAILABLE,
        'SERVICE_INDISPONIBLE',
        'Impossible de rechercher les courriers pour le moment.',
      ));
    }
  },

  corrigerCourrier: async (
    call: UnaryCall<CorrigerCourrierRequest>,
    callback: UnaryCallback<CourrierResponse>,
  ) => {
    const request = call.request;
    if (!request.numero.trim()) {
      callback(serviceError(
        grpc.status.INVALID_ARGUMENT,
        'CHAMP_MANQUANT',
        'Le numéro du courrier est obligatoire.',
      ));
      return;
    }

    try {
      const existing = await getCourrierByNumero(request.numero.trim());
      if (!existing) {
        callback(serviceError(
          grpc.status.NOT_FOUND,
          'COURRIER_INTROUVABLE',
          'Courrier introuvable.',
        ));
        return;
      }

      const courrier = await updateCourrier(request.numero.trim(), {
        objet: request.objet.trim() || existing.objet,
        expediteur: request.expediteur.trim() || existing.expediteur,
        destinataire: existing.destinataire,
        contenu: existing.contenu ?? undefined,
        pieceJointeUrl: existing.pieceJointeUrl ?? undefined,
        dateCourrier: request.date_courrier || undefined,
        priorite: request.priorite || undefined,
        confidentiel: request.confidentiel,
      });
      if (!courrier) {
        callback(serviceError(
          grpc.status.NOT_FOUND,
          'COURRIER_INTROUVABLE',
          'Courrier introuvable.',
        ));
        return;
      }

      callback(null, toCourrierResponse(courrier));
    } catch (error) {
      console.error(
        `[service-courrier] erreur de correction: ${error instanceof Error ? error.message : String(error)}`,
      );
      callback(serviceError(
        grpc.status.UNAVAILABLE,
        'SERVICE_INDISPONIBLE',
        'Impossible de corriger le courrier pour le moment.',
      ));
    }
  },
};

function main(): void {
  const server = new grpc.Server();
  server.addService(courrierServiceConstructor.service, handlers);

  const port = process.env.GRPC_PORT || '50051';
  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (error) => {
      if (error) {
        console.error(`[service-courrier] démarrage gRPC impossible: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      console.info(`[service-courrier] service gRPC démarré sur le port ${port}`);
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isServiceConstructor(
  value: unknown,
): value is grpc.ServiceClientConstructor {
  return typeof value === 'function' && 'service' in value;
}

main();
