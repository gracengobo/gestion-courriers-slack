import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import dotenv from 'dotenv';
import {
  createCourrier,
  getCourrierByNumero,
  searchCourriers,
  updateCourrier,
} from './services/courrier.service';

dotenv.config();

const PROTO_PATH = path.join(__dirname, '../proto/courrier.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition) as any;
const courrierPackage = proto.courrier;

const handlers = {
  createCourrier: async (call: any, callback: any) => {
    try {
      console.log('[gRPC] CreateCourrier reçu:', call.request);
      const courrier = await createCourrier(call.request);

      callback(null, {
        id: courrier.id,
        numero: courrier.numero,
        objet: courrier.objet,
        expediteur: courrier.expediteur,
        destinataire: courrier.destinataire,
        statut: courrier.statut,
        createdAt: courrier.createdAt.toISOString(),
      });
    } catch (err: any) {
      console.error('[gRPC] Erreur CreateCourrier:', err);
      callback({
        code: grpc.status.INTERNAL,
        message: err.message || 'Erreur interne du service courrier',
      });
    }
  },

  getCourrier: async (call: any, callback: any) => {
    try {
      const courrier = await getCourrierByNumero(call.request.numero);
      if (!courrier) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: 'Courrier introuvable',
        });
      }

      callback(null, {
        id: courrier.id,
        numero: courrier.numero,
        objet: courrier.objet,
        expediteur: courrier.expediteur,
        destinataire: courrier.destinataire,
        statut: courrier.statut,
        createdAt: courrier.createdAt.toISOString(),
      });
    } catch (err: any) {
      console.error('[gRPC] Erreur GetCourrier:', err);
      callback({
        code: grpc.status.INTERNAL,
        message: err.message || 'Erreur interne du service courrier',
      });
    }
  },

  updateCourrier: async (call: any, callback: any) => {
    try {
      const { numero, objet, expediteur, destinataire, contenu, pieceJointeUrl } = call.request;
      if (!numero || !objet || !expediteur || !destinataire) {
        return callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'numero, objet, expediteur et destinataire sont obligatoires',
        });
      }

      const courrier = await updateCourrier(numero, {
        objet,
        expediteur,
        destinataire,
        contenu,
        pieceJointeUrl,
      });
      if (!courrier) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: 'Courrier introuvable',
        });
      }

      callback(null, {
        id: courrier.id,
        numero: courrier.numero,
        objet: courrier.objet,
        expediteur: courrier.expediteur,
        destinataire: courrier.destinataire,
        statut: courrier.statut,
        createdAt: courrier.createdAt.toISOString(),
      });
    } catch (err: any) {
      console.error('[gRPC] Erreur UpdateCourrier:', err);
      callback({
        code: grpc.status.INTERNAL,
        message: err.message || 'Erreur interne du service courrier',
      });
    }
  },

  searchCourriers: async (call: any, callback: any) => {
    if (!call.request.query?.trim()) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Le terme de recherche ne peut pas être vide',
      });
    }

    try {
      const courriers = await searchCourriers(call.request.query, call.request.limit);
      callback(null, {
        courriers: courriers.map((courrier) => ({
          id: courrier.id,
          numero: courrier.numero,
          objet: courrier.objet,
          expediteur: courrier.expediteur,
          destinataire: courrier.destinataire,
          statut: courrier.statut,
          createdAt: courrier.createdAt.toISOString(),
        })),
      });
    } catch (err: any) {
      console.error('[gRPC] Erreur SearchCourriers:', err);
      callback({
        code: grpc.status.INTERNAL,
        message: err.message || 'Erreur interne pendant la recherche',
      });
    }
  },
};

function main() {
  const server = new grpc.Server();
  server.addService(courrierPackage.CourrierService.service, handlers);

  const port = process.env.GRPC_PORT || '50051';
  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    () => {
      console.log(`✅ Service Courrier démarré sur le port ${port}`);
    },
  );
}

main();
