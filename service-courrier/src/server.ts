import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import dotenv from 'dotenv';
import { createCourrier, getCourrierByNumero } from './services/courrier.service';

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
  CreateCourrier: async (call: any, callback: any) => {
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

  GetCourrier: async (call: any, callback: any) => {
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
