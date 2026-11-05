import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { config } from "./config";
import { ErreurMetier } from "./erreurs";
import {
  affecter,
  changerStatut,
  definirLangue,
  listerCourriersDuDestinataire,
  listerCourriersDuService,
  obtenirHistorique,
  obtenirStatistiques,
  obtenirUtilisateur,
} from "./services/workflow.service";

const PROTO_DIR = path.join(__dirname, "../proto");
const PROTO_PATH = path.join(PROTO_DIR, "workflow.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_DIR],
});

const loadedPackage = grpc.loadPackageDefinition(packageDefinition) as unknown as {
  courrier?: { v1?: { WorkflowService?: grpc.ServiceClientConstructor } };
};
const serviceConstructor = loadedPackage.courrier?.v1?.WorkflowService;
if (!serviceConstructor) {
  throw new Error("Le service courrier.v1.WorkflowService est absent du contrat gRPC.");
}

type UnaryCall<Request> = { request: Request };
type UnaryCallback<Response> = (
  error: grpc.ServiceError | null,
  response?: Response,
) => void;

function erreurGrpc(error: unknown): grpc.ServiceError {
  const metadata = new grpc.Metadata();
  if (error instanceof ErreurMetier) {
    metadata.set("code-metier", error.codeMetier);
    return Object.assign(new Error(error.message), {
      code: error.statutGrpc,
      details: error.message,
      metadata,
    }) as grpc.ServiceError;
  }

  console.error("[service-workflow] erreur inattendue:", error);
  metadata.set("code-metier", "SERVICE_INDISPONIBLE");
  return Object.assign(new Error("Impossible de traiter la demande pour le moment."), {
    code: grpc.status.UNAVAILABLE,
    details: "Impossible de traiter la demande pour le moment.",
    metadata,
  }) as grpc.ServiceError;
}

async function repondre<Response>(
  callback: UnaryCallback<Response>,
  traitement: () => Promise<Response>,
): Promise<void> {
  try {
    callback(null, await traitement());
  } catch (error) {
    callback(erreurGrpc(error));
  }
}

interface AffecterRequest {
  numero: string;
  acteur_slack_id: string;
  destinataire_slack_id: string;
  service_code: string;
  motif: string;
}

interface ChangerStatutRequest {
  numero: string;
  acteur_slack_id: string;
  action: string;
  version_attendue: number;
  commentaire: string;
  motif: string;
  nouveau_destinataire_slack_id: string;
}

interface NumeroRequest {
  numero: string;
  acteur_slack_id: string;
}

interface ListerRequest {
  acteur_slack_id: string;
  limite: number;
}

interface ListerServiceRequest extends ListerRequest {
  service_code: string;
}

interface StatistiquesRequest {
  acteur_slack_id: string;
  service_code: string;
}

interface UtilisateurRequest {
  slack_id: string;
  acteur_slack_id: string;
}

interface LangueRequest {
  acteur_slack_id: string;
  langue: string;
}

const handlers = {
  affecterCourrier: (
    call: UnaryCall<AffecterRequest>,
    callback: UnaryCallback<unknown>,
  ) =>
    repondre(callback, () =>
      affecter({
        numero: call.request.numero,
        acteurSlackId: call.request.acteur_slack_id,
        destinataireSlackId: call.request.destinataire_slack_id,
        serviceCode: call.request.service_code,
        motif: call.request.motif,
      }),
    ),

  changerStatut: (
    call: UnaryCall<ChangerStatutRequest>,
    callback: UnaryCallback<unknown>,
  ) =>
    repondre(callback, () =>
      changerStatut({
        numero: call.request.numero,
        acteurSlackId: call.request.acteur_slack_id,
        action: call.request.action,
        versionAttendue: call.request.version_attendue,
        commentaire: call.request.commentaire,
        motif: call.request.motif,
        nouveauDestinataireSlackId: call.request.nouveau_destinataire_slack_id,
      }),
    ),

  obtenirHistorique: (
    call: UnaryCall<NumeroRequest>,
    callback: UnaryCallback<unknown>,
  ) => repondre(callback, () => obtenirHistorique(call.request.numero)),

  listerCourriersDuDestinataire: (
    call: UnaryCall<ListerRequest>,
    callback: UnaryCallback<unknown>,
  ) =>
    repondre(callback, () =>
      listerCourriersDuDestinataire(call.request.acteur_slack_id, call.request.limite),
    ),

  listerCourriersDuService: (
    call: UnaryCall<ListerServiceRequest>,
    callback: UnaryCallback<unknown>,
  ) =>
    repondre(callback, () =>
      listerCourriersDuService(
        call.request.acteur_slack_id,
        call.request.service_code,
        call.request.limite,
      ),
    ),

  obtenirStatistiques: (
    call: UnaryCall<StatistiquesRequest>,
    callback: UnaryCallback<unknown>,
  ) => repondre(callback, () => obtenirStatistiques(call.request.service_code)),

  obtenirUtilisateur: (
    call: UnaryCall<UtilisateurRequest>,
    callback: UnaryCallback<unknown>,
  ) => repondre(callback, () => obtenirUtilisateur(call.request.slack_id)),

  definirLangue: (
    call: UnaryCall<LangueRequest>,
    callback: UnaryCallback<unknown>,
  ) => repondre(callback, () => definirLangue(call.request.acteur_slack_id, call.request.langue)),
};

export function demarrerGrpc(): grpc.Server {
  const serveur = new grpc.Server();
  const implementation = Object.fromEntries(
    Object.keys(serviceConstructor!.service).map((nom) => {
      const cle = nom.charAt(0).toLowerCase() + nom.slice(1);
      const handler = (handlers as Record<string, unknown>)[cle];
      if (!handler) throw new Error(`Handler gRPC manquant pour ${nom}.`);
      return [nom, handler];
    }),
  ) as unknown as grpc.UntypedServiceImplementation;
  serveur.addService(serviceConstructor!.service, implementation);

  serveur.bindAsync(
    `0.0.0.0:${config.grpcPort}`,
    grpc.ServerCredentials.createInsecure(),
    (error) => {
      if (error) {
        console.error(`[service-workflow] démarrage gRPC impossible: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      console.log(`[service-workflow] gRPC en écoute sur ${config.grpcPort}`);
    },
  );

  return serveur;
}
