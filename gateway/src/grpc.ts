import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

export interface UnaryMethod<Request extends object, Response> {
  (
    request: Request,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: (error: grpc.ServiceError | null, response: Response) => void,
  ): grpc.ClientUnaryCall;
}

export interface CourrierServiceClient extends grpc.Client {
  CreerCourrier: UnaryMethod<CreerCourrierRequest, CreerCourrierResponse>;
  ObtenirCourrier: UnaryMethod<ObtenirCourrierRequest, Courrier>;
  RechercherCourriers: UnaryMethod<RechercherCourriersRequest, RechercherCourriersResponse>;
}

export interface WorkflowServiceClient extends grpc.Client {
  AffecterCourrier: UnaryMethod<AffecterCourrierRequest, AffecterCourrierResponse>;
  ChangerStatut: UnaryMethod<ChangerStatutRequest, ChangerStatutResponse>;
  ObtenirHistorique: UnaryMethod<ObtenirHistoriqueRequest, ObtenirHistoriqueResponse>;
  ListerCourriersDuDestinataire: UnaryMethod<ListerCourriersRequest, ListerCourriersResponse>;
  ObtenirStatistiques: UnaryMethod<ObtenirStatistiquesRequest, ObtenirStatistiquesResponse>;
  ObtenirUtilisateur: UnaryMethod<ObtenirUtilisateurRequest, Utilisateur>;
  DefinirLangue: UnaryMethod<DefinirLangueRequest, DefinirLangueResponse>;
}

export interface IAServiceClient extends grpc.Client {
  ObtenirAnalyse: UnaryMethod<ObtenirAnalyseRequest, Analyse>;
  EnregistrerDecision: UnaryMethod<EnregistrerDecisionRequest, EnregistrerDecisionResponse>;
  InterpreterRecherche: UnaryMethod<InterpreterRechercheRequest, InterpreterRechercheResponse>;
}

export interface CreerCourrierRequest {
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
  pieceJointe?: PieceJointe;
}
export interface PieceJointe {
  bucket: string;
  cle: string;
  nomOriginal: string;
  typeMime: string;
  tailleOctets: number;
  empreinteSha256: string;
}
export interface CreerCourrierResponse {
  numero: string;
}
export interface ObtenirCourrierRequest {
  numero: string;
  acteurSlackId: string;
}
export interface Courrier {
  numero: string;
  type: string;
  objet: string;
  expediteur: string;
  dateCourrier: string;
  priorite: string;
  confidentiel: boolean;
  serviceCode: string;
  destinataireSlackId: string;
  agentSlackId: string;
  creeLe: string;
}
export interface RechercherCourriersRequest {
  acteurSlackId: string;
  requete: string;
  numero: string;
  objet: string;
  expediteur: string;
  categorie: string;
  serviceCode: string;
  dateDebut: string;
  dateFin: string;
  limite: number;
}
export interface RechercherCourriersResponse {
  courriers: Courrier[];
}
export interface AffecterCourrierRequest {
  numero: string;
  acteurSlackId: string;
  destinataireSlackId: string;
  serviceCode: string;
  motif: string;
}
export interface AffecterCourrierResponse {
  numero: string;
  destinataireSlackId: string;
  statut: string;
  version: number;
}
export interface ChangerStatutRequest {
  numero: string;
  acteurSlackId: string;
  action: string;
  versionAttendue: number;
  commentaire: string;
  motif: string;
  nouveauDestinataireSlackId: string;
}
export interface ChangerStatutResponse {
  numero: string;
  ancienStatut: string;
  nouveauStatut: string;
  version: number;
}
export interface ObtenirHistoriqueRequest {
  numero: string;
  acteurSlackId: string;
}
export interface HistoriqueEntree {
  statut: string;
  acteurSlackId: string;
  commentaire: string;
  motif: string;
  creeLe: string;
}
export interface ObtenirHistoriqueResponse {
  entrees: HistoriqueEntree[];
  versionActuelle: number;
}
export interface ListerCourriersRequest {
  acteurSlackId: string;
  limite: number;
}
export interface CourrierResume {
  numero: string;
  objet: string;
  statut: string;
  priorite: string;
  destinataireSlackId: string;
  echeance: string;
  version: number;
}
export interface ListerCourriersResponse {
  courriers: CourrierResume[];
}
export interface ObtenirStatistiquesRequest {
  acteurSlackId: string;
  serviceCode: string;
}
export interface ObtenirStatistiquesResponse {
  total: number;
  enregistres: number;
  affectes: number;
  enCours: number;
  traites: number;
  enRetard: number;
}
export interface ObtenirUtilisateurRequest {
  slackId: string;
  acteurSlackId: string;
}
export interface Utilisateur {
  slackId: string;
  role: string;
  serviceCode: string;
  langue: string;
}
export interface DefinirLangueRequest {
  acteurSlackId: string;
  langue: string;
}
export interface DefinirLangueResponse {
  slackId: string;
  langue: string;
}
export interface ObtenirAnalyseRequest {
  numero: string;
  acteurSlackId: string;
}
export interface Analyse {
  numero: string;
  statutAnalyse: string;
  categorie: string;
  confiance: number;
  urgence: string;
  datesDetectees: string[];
  resume: string;
  serviceSuggere: string;
  justification: string;
  produitParIa: boolean;
  langueDetectee: string;
  brouillonReponse: string;
}
export interface InterpreterRechercheRequest {
  acteurSlackId: string;
  phrase: string;
  langue: string;
}
export interface InterpreterRechercheResponse {
  motsCles: string[];
  categorie: string;
  serviceCode: string;
  urgence: string;
  statuts: string[];
  dateDebut: string;
  dateFin: string;
}
export interface EnregistrerDecisionRequest {
  acteurSlackId: string;
  numero: string;
  decision: string;
  categorieFinale: string;
  serviceFinal: string;
}
export interface EnregistrerDecisionResponse {
  numero: string;
  decision: string;
  decideLe: string;
}

interface ProtoServices {
  courrier: {
    v1: {
      CourrierService: new (address: string, credentials: grpc.ChannelCredentials) => CourrierServiceClient;
      WorkflowService: new (address: string, credentials: grpc.ChannelCredentials) => WorkflowServiceClient;
      IAService: new (address: string, credentials: grpc.ChannelCredentials) => IAServiceClient;
    };
  };
}

export interface GrpcServices {
  courrier: CourrierServiceClient;
  workflow: WorkflowServiceClient;
  ia: IAServiceClient;
}

export function createGrpcServices(
  addresses: { courrier: string; workflow: string; ia: string },
): GrpcServices {
  const files = ["courrier.proto", "workflow.proto", "ia.proto"].map((file) =>
    path.resolve(process.env.PROTO_DIR ?? path.resolve(process.cwd(), "..", "proto"), file),
  );
  const definition = protoLoader.loadSync(files, {
    defaults: true,
    keepCase: false,
    longs: Number,
    enums: String,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(definition) as unknown as ProtoServices;
  const services = loaded.courrier.v1;
  const credentials = grpc.credentials.createInsecure();

  return {
    courrier: new services.CourrierService(addresses.courrier, credentials),
    workflow: new services.WorkflowService(addresses.workflow, credentials),
    ia: new services.IAService(addresses.ia, credentials),
  };
}

export function callGrpc<Request extends object, Response>(
  method: UnaryMethod<Request, Response>,
  request: Request,
  delaiMs = 2_000,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    method(
      request,
      new grpc.Metadata(),
      { deadline: Date.now() + delaiMs },
      (error, response) => (error ? reject(error) : resolve(response)),
    );
  });
}

export function closeGrpcServices(services: GrpcServices): void {
  services.courrier.close();
  services.workflow.close();
  services.ia.close();
}
