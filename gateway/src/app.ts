import { App, type BlockAction, type SlackActionMiddlewareArgs } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import * as grpc from "@grpc/grpc-js";
import { config } from "./config";
import {
  callGrpc,
  type ChangerStatutRequest,
  type GrpcServices,
  type InterpreterRechercheResponse,
} from "./grpc";
import { errorMessage } from "./messages";
import { AttachmentStorage } from "./storage";

const STATUS_ACTIONS = [
  "accuser_reception",
  "prendre_en_charge",
  "cloturer",
  "rejeter",
  "archiver",
  "deleguer",
  "signaler_erreur",
] as const;
const ASSIGN_ACTIONS = ["valider_affectation", "modifier_affectation"] as const;
type StatusAction = (typeof STATUS_ACTIONS)[number];
type AssignmentAction = (typeof ASSIGN_ACTIONS)[number];
type Locale = "fr" | "en";

interface ModalContext {
  kind: "create" | "status" | "assign";
  actorSlackId: string;
  channelId: string;
  courrierType?: string;
  numero?: string;
  action?: StatusAction | AssignmentAction;
}

interface ModalValues {
  [blockId: string]: {
    [actionId: string]: {
      value?: string;
      selected_option?: { value: string };
      selected_options?: Array<{ value: string }>;
      selected_date?: string;
      selected_files?: Array<{ id: string }>;
    };
  };
}

type AssignmentActionArgs = SlackActionMiddlewareArgs<BlockAction> & { client: WebClient };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getValue(values: ModalValues, blockId: string, actionId: string): string {
  const entry = values[blockId]?.[actionId];
  return text(entry?.value ?? entry?.selected_option?.value ?? entry?.selected_date);
}

function modalInput(
  blockId: string,
  label: string,
  actionId: string,
  type: "plain_text_input" | "datepicker" = "plain_text_input",
  optional = false,
): KnownBlock {
  return {
    type: "input",
    block_id: blockId,
    label: { type: "plain_text", text: label },
    optional,
    element:
      type === "datepicker"
        ? { type: "datepicker", action_id: actionId, placeholder: { type: "plain_text", text: "AAAA-MM-JJ" } }
        : { type: "plain_text_input", action_id: actionId },
  } as KnownBlock;
}

function metadata(context: ModalContext): string {
  return JSON.stringify(context);
}

function parseMetadata(value: string): ModalContext {
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("kind" in parsed) ||
    !("actorSlackId" in parsed) ||
    !("channelId" in parsed)
  ) {
    throw new Error("Contexte de formulaire Slack invalide.");
  }
  return parsed as ModalContext;
}

function getAttachmentId(values: ModalValues): string | undefined {
  const selected = values["attachment_block"]?.attachment?.selected_files;
  if (selected && selected.length > 1) {
    throw new Error("Une seule pièce jointe peut être ajoutée.");
  }
  return selected?.[0]?.id;
}

function safeNumber(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function formatCourriers(
  items: Array<{ numero: string; objet: string; statut?: string; priorite?: string; echeance?: string }>,
): string {
  if (!items.length) return "Aucun courrier trouvé.";
  return items
    .slice(0, 20)
    .map((item) => `• *${item.numero}* — ${item.objet || "Sans objet"} · ${item.statut ?? "Statut indisponible"}${item.echeance ? ` · échéance ${item.echeance}` : ""}`)
    .join("\n");
}

async function postEphemeral(
  client: WebClient,
  channelId: string,
  userId: string,
  message: string,
): Promise<void> {
  await client.chat.postEphemeral({ channel: channelId, user: userId, text: message });
}

function openModal(
  client: WebClient,
  triggerId: string,
  view: Parameters<WebClient["views"]["open"]>[0]["view"],
): Promise<unknown> {
  return client.views.open({ trigger_id: triggerId, view });
}

function createView(courrierType: string, actorSlackId: string, channelId: string) {
  return {
    type: "modal" as const,
    callback_id: "courrier_create",
    private_metadata: metadata({ kind: "create", actorSlackId, channelId, courrierType }),
    title: { type: "plain_text" as const, text: "Nouveau courrier" },
    submit: { type: "plain_text" as const, text: "Enregistrer" },
    close: { type: "plain_text" as const, text: "Annuler" },
    blocks: [
      modalInput("subject_block", "Objet", "subject"),
      modalInput("sender_block", "Expéditeur", "sender"),
      modalInput("date_block", "Date du courrier", "date", "datepicker"),
      modalInput("service_block", "Code du service (facultatif)", "service", "plain_text_input", true),
      modalInput("recipient_block", "Identifiant Slack du destinataire (facultatif)", "recipient", "plain_text_input", true),
      {
        type: "input" as const,
        block_id: "language_block",
        label: { type: "plain_text" as const, text: "Langue du destinataire" },
        element: {
          type: "static_select" as const,
          action_id: "language",
          initial_option: {
            text: { type: "plain_text" as const, text: "Français" },
            value: "fr",
          },
          options: [
            { text: { type: "plain_text" as const, text: "Français" }, value: "fr" },
            { text: { type: "plain_text" as const, text: "English" }, value: "en" },
          ],
        },
      },
      {
        type: "input" as const,
        block_id: "priority_block",
        label: { type: "plain_text" as const, text: "Priorité" },
        element: {
          type: "static_select" as const,
          action_id: "priority",
          initial_option: {
            text: { type: "plain_text" as const, text: "Normale" },
            value: "NORMALE",
          },
          options: [
            { text: { type: "plain_text" as const, text: "Basse" }, value: "BASSE" },
            { text: { type: "plain_text" as const, text: "Normale" }, value: "NORMALE" },
            { text: { type: "plain_text" as const, text: "Urgente" }, value: "HAUTE" },
          ],
        },
      },
      {
        type: "input" as const,
        block_id: "confidential_block",
        label: { type: "plain_text" as const, text: "Confidentiel" },
        optional: true,
        element: {
          type: "checkboxes" as const,
          action_id: "confidentiel",
          options: [
            {
              text: { type: "plain_text" as const, text: "Ce courrier est confidentiel" },
              value: "true",
            },
          ],
        },
      },
      {
        type: "input" as const,
        block_id: "attachment_block",
        label: { type: "plain_text" as const, text: "Pièce jointe (PDF, JPG ou PNG, 10 Mo max.)" },
        optional: true,
        element: { type: "file_input" as const, action_id: "attachment", filetypes: ["pdf", "jpg", "png"], max_files: 1 },
      },
    ],
  };
}

function statusView(context: ModalContext) {
  const blocks: KnownBlock[] = [];
  if (context.action === "cloturer") blocks.push(modalInput("comment_block", "Commentaire", "comment"));
  if (context.action === "rejeter" || context.action === "signaler_erreur") {
    blocks.push(modalInput("reason_block", "Motif", "reason"));
  }
  if (context.action === "deleguer") {
    blocks.push(modalInput("reason_block", "Motif", "reason"));
    blocks.push(modalInput("recipient_block", "Identifiant Slack du nouveau destinataire", "recipient"));
  }
  return {
    type: "modal" as const,
    callback_id: "courrier_status",
    private_metadata: metadata(context),
    title: { type: "plain_text" as const, text: "Confirmer l’action" },
    submit: { type: "plain_text" as const, text: "Confirmer" },
    close: { type: "plain_text" as const, text: "Annuler" },
    blocks,
  };
}

function assignmentView(context: ModalContext) {
  return {
    type: "modal" as const,
    callback_id: "courrier_assign",
    private_metadata: metadata(context),
    title: { type: "plain_text" as const, text: "Affecter le courrier" },
    submit: { type: "plain_text" as const, text: "Affecter" },
    close: { type: "plain_text" as const, text: "Annuler" },
    blocks: [
      modalInput("recipient_block", "Identifiant Slack du destinataire", "recipient"),
      modalInput("service_block", "Code du service (facultatif)", "service", "plain_text_input", true),
      ...(context.action === "modifier_affectation"
        ? [modalInput("reason_block", "Motif de la modification", "reason")]
        : []),
    ],
  };
}

export function createApp(services: GrpcServices, storage: AttachmentStorage): App {
  const app = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,
    signingSecret: config.slackSigningSecret,
    socketMode: true,
  });

  app.command("/courrier", async ({ ack, body, client, command, respond }) => {
    await ack();
    const actorSlackId = body.user_id;
    const channelId = body.channel_id;
    const [subcommand, ...args] = command.text.trim().split(/\s+/).filter(Boolean);
    const language: Locale = "fr";

    try {
      switch (subcommand) {
        case "nouveau":
        case "sortant":
        case "interne": {
          const courrierType = subcommand === "sortant" ? "SORTANT" : subcommand === "interne" ? "INTERNE" : "ENTRANT";
          await openModal(client, body.trigger_id, createView(courrierType, actorSlackId, channelId));
          return;
        }
        case "chercher": {
          const query = args.join(" ").trim();
          if (!query) {
            await respond({ response_type: "ephemeral", text: "Indiquez les mots à rechercher : `/courrier chercher <mots>`." });
            return;
          }
          let filters: InterpreterRechercheResponse;
          let interpreterUnavailable = false;
          try {
            filters = await callGrpc(services.ia.InterpreterRecherche.bind(services.ia), {
              acteurSlackId: actorSlackId,
              phrase: query,
              langue: language,
            });
          } catch (error) {
            if (!isGrpcStatus(error, grpc.status.UNIMPLEMENTED)) throw error;
            interpreterUnavailable = true;
            console.warn("[gateway] InterpreterRecherche indisponible; recherche textuelle simple");
            filters = {
              motsCles: [],
              categorie: "",
              serviceCode: "",
              urgence: "",
              statuts: [],
              dateDebut: "",
              dateFin: "",
            };
          }
          const result = await callGrpc(services.courrier.RechercherCourriers.bind(services.courrier), {
            acteurSlackId: actorSlackId,
            requete: filters.motsCles.join(" ") || query,
            numero: "",
            objet: "",
            expediteur: "",
            categorie: filters.categorie,
            serviceCode: filters.serviceCode,
            dateDebut: filters.dateDebut,
            dateFin: filters.dateFin,
            limite: 20,
          });
          const notice = interpreterUnavailable
            ? "Interprétation IA indisponible; recherche textuelle simple.\n"
            : "";
          await respond({ response_type: "ephemeral", text: notice + formatCourriers(result.courriers) });
          return;
        }
        case "statut": {
          const numero = args[0] ?? "";
          if (!numero) {
            await respond({ response_type: "ephemeral", text: "Indiquez un numéro de courrier." });
            return;
          }
          const [courrier, history] = await Promise.all([
            callGrpc(services.courrier.ObtenirCourrier.bind(services.courrier), {
              numero,
              acteurSlackId: actorSlackId,
            }),
            callGrpc(services.workflow.ObtenirHistorique.bind(services.workflow), {
              numero,
              acteurSlackId: actorSlackId,
            }),
          ]);
          const latestStatus = history.entrees.at(-1)?.statut ?? "INCONNU";
          await respond({
            response_type: "ephemeral",
            text: `*${courrier.numero}* — ${courrier.objet}\nStatut : *${latestStatus}* · Priorité : ${courrier.priorite}`,
          });
          return;
        }
        case "mes-courriers": {
          const result = await callGrpc(
            services.workflow.ListerCourriersDuDestinataire.bind(services.workflow),
            { acteurSlackId: actorSlackId, limite: 20 },
          );
          await respond({ response_type: "ephemeral", text: formatCourriers(result.courriers) });
          return;
        }
        case "stats": {
          const result = await callGrpc(services.workflow.ObtenirStatistiques.bind(services.workflow), {
            acteurSlackId: actorSlackId,
            serviceCode: "",
          });
          await respond({
            response_type: "ephemeral",
            text: `*Statistiques des courriers*\nTotal : ${safeNumber(result.total)} · Enregistrés : ${safeNumber(result.enregistres)} · Affectés : ${safeNumber(result.affectes)} · En cours : ${safeNumber(result.enCours)} · Traités : ${safeNumber(result.traites)} · En retard : ${safeNumber(result.enRetard)}`,
          });
          return;
        }
        case "langue": {
          const languageCode = args[0];
          if (languageCode !== "fr" && languageCode !== "en") {
            await respond({ response_type: "ephemeral", text: "Choisissez une langue : `/courrier langue fr` ou `/courrier langue en`." });
            return;
          }
          const result = await callGrpc(services.workflow.DefinirLangue.bind(services.workflow), {
            acteurSlackId: actorSlackId,
            langue: languageCode,
          });
          await respond({ response_type: "ephemeral", text: `Langue enregistrée : ${result.langue}.` });
          return;
        }
        case "analyse": {
          const numero = args[0] ?? "";
          if (!numero) {
            await respond({ response_type: "ephemeral", text: "Indiquez un numéro de courrier." });
            return;
          }
          const analysis = await callGrpc(services.ia.ObtenirAnalyse.bind(services.ia), {
            numero,
            acteurSlackId: actorSlackId,
          });
          const message =
            analysis.statutAnalyse === "ok"
              ? `*Analyse IA de ${analysis.numero}* · ${analysis.categorie} · urgence ${analysis.urgence} · confiance ${Math.round(analysis.confiance * 100)} %\n${analysis.resume}${analysis.brouillonReponse ? `\nBrouillon proposé par l’IA : ${analysis.brouillonReponse}` : ""}`
              : `L’analyse de ${numero} n’est pas disponible (${analysis.statutAnalyse}).`;
          await respond({ response_type: "ephemeral", text: message });
          return;
        }
        case "decision": {
          const numero = args[0] ?? "";
          const decision = args[1]?.toUpperCase() ?? "";
          if (!numero || !["VALIDEE", "CORRIGEE", "REJETEE"].some((value) => value === decision)) {
            await respond({
              response_type: "ephemeral",
              text: "Utilisez `/courrier decision <numero> VALIDEE|CORRIGEE|REJETEE [categorie] [service]`.",
            });
            return;
          }
          const categorieFinale = args[2]?.toUpperCase() ?? "";
          const serviceFinal = args[3]?.toUpperCase() ?? "";
          if (decision === "CORRIGEE" && !categorieFinale && !serviceFinal) {
            await respond({
              response_type: "ephemeral",
              text: "Une décision CORRIGEE doit fournir une catégorie et/ou un code de service final.",
            });
            return;
          }
          const result = await callGrpc(services.ia.EnregistrerDecision.bind(services.ia), {
            numero,
            acteurSlackId: actorSlackId,
            decision,
            categorieFinale,
            serviceFinal,
          });
          await respond({
            response_type: "ephemeral",
            text: `Décision ${result.decision} enregistrée pour *${result.numero}*${result.decideLe ? ` le ${result.decideLe}` : ""}.`,
          });
          return;
        }
        case "aide":
        case undefined:
          await respond({
            response_type: "ephemeral",
            text: "`nouveau`, `sortant`, `interne`, `chercher <mots>`, `statut <numero>`, `analyse <numero>`, `decision <numero> VALIDEE|CORRIGEE|REJETEE [categorie] [service]`, `mes-courriers`, `stats`, `langue fr|en`.",
          });
          return;
        case "admin":
          await respond({ response_type: "ephemeral", text: "Les opérations d’administration ne sont pas encore définies dans le contrat gRPC." });
          return;
        default:
          await respond({ response_type: "ephemeral", text: "Commande inconnue. Utilisez `/courrier aide`." });
      }
    } catch (error) {
      console.error(`[gateway] commande /courrier échouée: ${error instanceof Error ? error.message : String(error)}`);
      await respond({ response_type: "ephemeral", text: errorMessage(error, language) });
    }
  });

  app.action<BlockAction>("valider_affectation", (args) => handleAssignmentAction(args));
  app.action<BlockAction>("modifier_affectation", (args) => handleAssignmentAction(args));

  for (const actionId of STATUS_ACTIONS) {
    app.action<BlockAction>(actionId, async ({ ack, body, action, client }) => {
      await ack();
      const actorSlackId = body.user.id;
      const channelId = body.channel?.id;
      const numero = "value" in action ? text(action.value) : "";
      if (!channelId || !numero) {
        console.error(`[gateway] action ${actionId} sans canal ou numéro de courrier`);
        return;
      }
      if (actionId === "cloturer" || actionId === "rejeter" || actionId === "deleguer" || actionId === "signaler_erreur") {
        try {
          await openModal(
            client,
            body.trigger_id,
            statusView({ kind: "status", actorSlackId, channelId, numero, action: actionId }),
          );
        } catch (error) {
          console.error(`[gateway] ouverture du formulaire ${actionId} échouée: ${error instanceof Error ? error.message : String(error)}`);
          await postEphemeral(client, channelId, actorSlackId, errorMessage(error));
        }
        return;
      }
      await performStatusChange(services, client, channelId, actorSlackId, numero, actionId, {});
    });
  }

  app.view("courrier_create", async ({ ack, body, view, client }) => {
    await ack();
    let context: ModalContext;
    try {
      context = parseMetadata(view.private_metadata);
      if (context.kind !== "create") throw new Error("Type de formulaire invalide.");
      const values = view.state.values as ModalValues;
      const objet = getValue(values, "subject_block", "subject");
      const expediteur = getValue(values, "sender_block", "sender");
      const dateCourrier = getValue(values, "date_block", "date");
      if (!objet || !expediteur || !dateCourrier) {
        throw new Error("L’objet, l’expéditeur et la date sont obligatoires.");
      }
      const fileId = getAttachmentId(values);
      let attachment;
      if (fileId) attachment = await storage.storeSlackFile(client, fileId);
      let numero: string;
      try {
        const created = await callGrpc(services.courrier.CreerCourrier.bind(services.courrier), {
          type: context.courrierType ?? "ENTRANT",
          objet,
          expediteur,
          dateCourrier,
          priorite: getValue(values, "priority_block", "priority") || "NORMALE",
          confidentiel: Boolean(values["confidential_block"]?.confidentiel?.selected_options?.length),
          serviceCode: getValue(values, "service_block", "service"),
          destinataireSlackId: getValue(values, "recipient_block", "recipient"),
          agentSlackId: context.actorSlackId,
          langueDestinataire: getValue(values, "language_block", "language") || "fr",
          ...(attachment ? { pieceJointe: attachment } : {}),
        });
        numero = created.numero;
      } catch (error) {
        if (attachment) {
          try {
            await storage.remove(attachment.cle);
          } catch (cleanupError) {
            console.error(`[gateway] nettoyage MinIO ${attachment.cle} échoué: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
          }
        }
        throw error;
      }
      await postEphemeral(client, context.channelId, context.actorSlackId, `Courrier créé : *${numero}*.`);
    } catch (error) {
      const userId = body.user.id;
      const channelId = safeMetadataChannel(view.private_metadata);
      console.error(`[gateway] création de courrier échouée: ${error instanceof Error ? error.message : String(error)}`);
      if (channelId) await postEphemeral(client, channelId, userId, errorMessage(error));
    }
  });

  app.view("courrier_status", async ({ ack, body, view, client }) => {
    await ack();
    try {
      const context = parseMetadata(view.private_metadata);
      if (context.kind !== "status" || !context.numero || !isStatusAction(context.action)) {
        throw new Error("Contexte de changement de statut invalide.");
      }
      const values = view.state.values as ModalValues;
      await performStatusChange(services, client, context.channelId, context.actorSlackId, context.numero, context.action, {
        commentaire: getValue(values, "comment_block", "comment"),
        motif: getValue(values, "reason_block", "reason"),
        nouveauDestinataireSlackId: getValue(values, "recipient_block", "recipient"),
      });
    } catch (error) {
      console.error(`[gateway] changement de statut échoué: ${error instanceof Error ? error.message : String(error)}`);
      const context = safeParseMetadata(view.private_metadata);
      if (context) await postEphemeral(client, context.channelId, context.actorSlackId, errorMessage(error));
    }
  });

  app.view("courrier_assign", async ({ ack, view, client }) => {
    await ack();
    try {
      const context = parseMetadata(view.private_metadata);
      if (
        context.kind !== "assign" ||
        !context.numero ||
        (context.action !== "valider_affectation" && context.action !== "modifier_affectation")
      ) {
        throw new Error("Contexte d’affectation invalide.");
      }
      const values = view.state.values as ModalValues;
      const recipient = getValue(values, "recipient_block", "recipient");
      const serviceCode = getValue(values, "service_block", "service");
      const reason = getValue(values, "reason_block", "reason");
      if (!recipient) throw new Error("L’identifiant Slack du destinataire est obligatoire.");
      const assigned = await callGrpc(services.workflow.AffecterCourrier.bind(services.workflow), {
        numero: context.numero,
        acteurSlackId: context.actorSlackId,
        destinataireSlackId: recipient,
        serviceCode,
        motif: reason,
      });
      await postEphemeral(
        client,
        context.channelId,
        context.actorSlackId,
        `Courrier *${assigned.numero}* affecté à <@${assigned.destinataireSlackId}>.`,
      );
    } catch (error) {
      console.error(`[gateway] affectation échouée: ${error instanceof Error ? error.message : String(error)}`);
      const context = safeParseMetadata(view.private_metadata);
      if (context) await postEphemeral(client, context.channelId, context.actorSlackId, errorMessage(error));
    }
  });

  app.error(async (error) => {
    console.error(`[gateway] erreur Slack Bolt: ${error.message}`);
  });

  return app;
}

async function handleAssignmentAction(
  args: AssignmentActionArgs,
): Promise<void> {
  await args.ack();
  const action = args.action;
  const numero = "value" in action ? text(action.value) : "";
  const channelId = args.body.channel?.id;
  if (!numero || !channelId) {
    console.error("[gateway] action d’affectation sans numéro ou canal");
    return;
  }
  try {
    await openModal(
      args.client,
      args.body.trigger_id,
      assignmentView({
        kind: "assign",
        actorSlackId: args.body.user.id,
        channelId,
        numero,
        action: action.action_id as AssignmentAction,
      }),
    );
  } catch (error) {
    console.error(`[gateway] ouverture du formulaire d’affectation échouée: ${error instanceof Error ? error.message : String(error)}`);
    await postEphemeral(args.client, channelId, args.body.user.id, errorMessage(error));
  }
}

async function performStatusChange(
  services: GrpcServices,
  client: WebClient,
  channelId: string,
  actorSlackId: string,
  numero: string,
  action: StatusAction,
  details: { commentaire?: string; motif?: string; nouveauDestinataireSlackId?: string },
): Promise<void> {
  try {
    const request: ChangerStatutRequest = {
      numero,
    acteurSlackId: actorSlackId,
      action,
      versionAttendue: (
        await callGrpc(services.workflow.ObtenirHistorique.bind(services.workflow), {
          numero,
          acteurSlackId: actorSlackId,
        })
      ).versionActuelle,
      commentaire: details.commentaire ?? "",
      motif: details.motif ?? "",
      nouveauDestinataireSlackId: details.nouveauDestinataireSlackId ?? "",
    };
    const result = await callGrpc(services.workflow.ChangerStatut.bind(services.workflow), request);
    await postEphemeral(client, channelId, actorSlackId, `Courrier *${result.numero}* : ${result.nouveauStatut}.`);
  } catch (error) {
    console.error(`[gateway] action ${action} pour ${numero} échouée: ${error instanceof Error ? error.message : String(error)}`);
    await postEphemeral(client, channelId, actorSlackId, errorMessage(error));
  }
}

function safeMetadataChannel(value: string): string | undefined {
  return safeParseMetadata(value)?.channelId;
}

function isStatusAction(action: ModalContext["action"]): action is StatusAction {
  return STATUS_ACTIONS.some((candidate) => candidate === action);
}

function isGrpcStatus(error: unknown, status: grpc.status): error is grpc.ServiceError {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "number" &&
    error.code === status
  );
}

function safeParseMetadata(value: string): ModalContext | undefined {
  try {
    return parseMetadata(value);
  } catch (error) {
    console.error(`[gateway] métadonnées de formulaire invalides: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}
