import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "node:path";
import { config } from "./config";
import { demarrerGrpc } from "./server";

const PROTO_DIR = path.join(__dirname, "../proto");
const definition = protoLoader.loadSync(path.join(PROTO_DIR, "workflow.proto"), {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_DIR],
});
const paquet = grpc.loadPackageDefinition(definition) as unknown as {
  courrier: {
    v1: {
      WorkflowService: new (adresse: string, identifiants: grpc.ChannelCredentials) => grpc.Client;
    };
  };
};

interface ClientWorkflow extends grpc.Client {
  obtenirUtilisateur(
    request: { slack_id: string; acteur_slack_id: string },
    callback: (error: grpc.ServiceError | null) => void,
  ): void;
}

const serveur = demarrerGrpc();
const client = new paquet.courrier.v1.WorkflowService(
  `127.0.0.1:${config.grpcPort}`,
  grpc.credentials.createInsecure(),
) as ClientWorkflow;

setTimeout(() => {
  client.obtenirUtilisateur(
    { slack_id: "", acteur_slack_id: "U-TEST" },
    (error: grpc.ServiceError | null) => {
      try {
        if (!error) throw new Error("une erreur était attendue pour un identifiant vide");
        if (error.code !== grpc.status.INVALID_ARGUMENT) {
          throw new Error(`code gRPC inattendu : ${error.code}`);
        }
        const codeMetier = error.metadata.get("code-metier")[0];
        if (codeMetier !== "CHAMP_MANQUANT") {
          throw new Error(`code métier inattendu : ${String(codeMetier)}`);
        }
        console.log("OK   méthode ObtenirUtilisateur reliée au serveur gRPC");
        console.log("1/1 vérification réussie");
        process.exitCode = 0;
      } catch (verification) {
        console.error(
          `ECHEC ${verification instanceof Error ? verification.message : String(verification)}`,
        );
        process.exitCode = 1;
      } finally {
        client.close();
        serveur.tryShutdown(() => {
          process.exit(process.exitCode ?? 0);
        });
      }
    },
  );
}, 500);
