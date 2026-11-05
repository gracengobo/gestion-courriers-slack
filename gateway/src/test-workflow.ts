import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { callGrpc, closeGrpcServices, createGrpcServices, type GrpcServices } from "./grpc";
import { dernierStatut, type EntreeHistorique } from "./affichage";

const PORT = 50998;
const problemes: string[] = [];
let controles = 0;

function verifier(nom: string, condition: boolean): void {
  controles += 1;
  if (!condition) throw new Error(`Échec du test: ${nom}`);
  console.log(`ok ${nom}`);
}

function exiger(nom: string, condition: boolean): void {
  controles += 1;
  if (!condition) problemes.push(nom);
}

// Reproduit le serveur du binôme 4: keepCase côté serveur, handlers camelCase.
const handlers = {
  obtenirHistorique: (
    call: { request: { numero: string; acteur_slack_id: string } },
    callback: grpc.sendUnaryData<unknown>,
  ) => {
    exiger("ObtenirHistorique reçoit acteur_slack_id", call.request.acteur_slack_id === "U-ACTEUR");
    callback(null, {
      entrees: [
        {
          statut: "AFFECTE",
          acteur_slack_id: "U1",
          commentaire: "",
          motif: "",
          cree_le: "2026-11-05T10:00:00.000Z",
        },
        {
          statut: "RECU",
          acteur_slack_id: "U2",
          commentaire: "Pris en compte",
          motif: "",
          cree_le: "2026-11-06T08:00:00.000Z",
        },
      ],
      version_actuelle: 3,
    });
  },
  listerCourriersDuDestinataire: (
    call: { request: { acteur_slack_id: string; limite: number } },
    callback: grpc.sendUnaryData<unknown>,
  ) => {
    exiger("ListerCourriersDuDestinataire reçoit acteur_slack_id", call.request.acteur_slack_id === "U-ACTEUR");
    exiger("ListerCourriersDuDestinataire reçoit limite", call.request.limite === 5);
    callback(null, {
      courriers: [
        {
          numero: "C-1",
          objet: "Inscription",
          statut: "RECU",
          priorite: "NORMALE",
          destinataire_slack_id: "U-ACTEUR",
          echeance: "2026-11-12T16:00:00.000Z",
          version: 3,
        },
      ],
    });
  },
  obtenirStatistiques: (
    call: { request: { acteur_slack_id: string; service_code: string } },
    callback: grpc.sendUnaryData<unknown>,
  ) => {
    exiger("ObtenirStatistiques reçoit service_code", call.request.service_code === "SCOLARITE");
    callback(null, {
      total: 6,
      enregistres: 1,
      affectes: 2,
      en_cours: 2,
      traites: 1,
      en_retard: 1,
    });
  },
  changerStatut: (
    call: {
      request: {
        numero: string;
        acteur_slack_id: string;
        action: string;
        version_attendue: number;
        commentaire: string;
        motif: string;
        nouveau_destinataire_slack_id: string;
      };
    },
    callback: grpc.sendUnaryData<unknown>,
  ) => {
    exiger("ChangerStatut reçoit version_attendue", call.request.version_attendue === 3);
    exiger("ChangerStatut reçoit le commentaire", call.request.commentaire === "Clos");
    callback(null, {
      numero: call.request.numero,
      ancien_statut: "EN_COURS",
      nouveau_statut: "TRAITE",
      version: 4,
    });
  },
};

function demarrerFauxWorkflow(): Promise<grpc.Server> {
  const protoDir = path.resolve(process.env.PROTO_DIR ?? path.resolve(process.cwd(), "..", "proto"));
  const definition = protoLoader.loadSync(path.join(protoDir, "workflow.proto"), {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [protoDir],
  });
  const paquet = grpc.loadPackageDefinition(definition) as unknown as {
    courrier: { v1: { WorkflowService: grpc.ServiceClientConstructor } };
  };
  const service = paquet.courrier.v1.WorkflowService;
  const implementation = Object.fromEntries(
    Object.keys(service.service)
      .map((nom) => {
        const cle = nom.charAt(0).toLowerCase() + nom.slice(1);
        return [nom, (handlers as Record<string, unknown>)[cle]];
      })
      .filter(([, handler]) => handler !== undefined),
  ) as unknown as grpc.UntypedServiceImplementation;

  const serveur = new grpc.Server();
  serveur.addService(service.service, implementation);
  return new Promise((resolve, reject) => {
    serveur.bindAsync(
      `127.0.0.1:${PORT}`,
      grpc.ServerCredentials.createInsecure(),
      (error) => (error ? reject(error) : resolve(serveur)),
    );
  });
}

async function main(): Promise<void> {
  const serveur = await demarrerFauxWorkflow();
  const services: GrpcServices = createGrpcServices({
    courrier: `127.0.0.1:${PORT + 1}`,
    workflow: `127.0.0.1:${PORT}`,
    ia: `127.0.0.1:${PORT + 1}`,
  });

  try {
    const historique = await callGrpc(services.workflow.ObtenirHistorique.bind(services.workflow), {
      numero: "C-1",
      acteurSlackId: "U-ACTEUR",
    });
    const entrees = historique.entrees as EntreeHistorique[];
    verifier("historique décodé", historique.versionActuelle === 3);
    verifier("dernier statut", dernierStatut(entrees) === "RECU");
    verifier("commentaire décodé", entrees[1]?.commentaire === "Pris en compte");

    const liste = await callGrpc(
      services.workflow.ListerCourriersDuDestinataire.bind(services.workflow),
      { acteurSlackId: "U-ACTEUR", limite: 5 },
    );
    verifier("mes-courriers décodé", liste.courriers[0]?.statut === "RECU");
    verifier("échéance décodée", liste.courriers[0]?.echeance === "2026-11-12T16:00:00.000Z");

    const stats = await callGrpc(
      services.workflow.ObtenirStatistiques.bind(services.workflow),
      { acteurSlackId: "U-ACTEUR", serviceCode: "SCOLARITE" },
    );
    verifier("stats décodées", stats.total === 6 && stats.enCours === 2 && stats.enRetard === 1);

    const changement = await callGrpc(services.workflow.ChangerStatut.bind(services.workflow), {
      numero: "C-1",
      acteurSlackId: "U-ACTEUR",
      action: "cloturer",
      versionAttendue: 3,
      commentaire: "Clos",
      motif: "",
      nouveauDestinataireSlackId: "",
    });
    verifier("changement de statut décodé", changement.nouveauStatut === "TRAITE");
  } finally {
    closeGrpcServices(services);
    await new Promise<void>((resolve) => serveur.tryShutdown(() => resolve()));
  }

  if (problemes.length) {
    throw new Error(`Contrat gRPC non respecté: ${problemes.join(", ")}`);
  }
  console.log(`${controles}/${controles} contrôles du contrat Workflow passés.`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
