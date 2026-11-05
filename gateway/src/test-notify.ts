import { notifierUtilisateur } from "./notify";

type Comportement = { ephemere?: string; dm?: string | null };

function fauxClient(comportement: Comportement) {
  const appels: string[] = [];
  const client: any = {
    chat: {
      postEphemeral: async () => {
        appels.push("postEphemeral");
        if (comportement.ephemere && comportement.ephemere !== "ok") {
          throw { data: { error: comportement.ephemere } };
        }
      },
      postMessage: async ({ channel }: { channel: string }) => {
        appels.push("postMessage:" + channel);
      },
    },
    conversations: {
      open: async () => ({
        channel: comportement.dm === null ? undefined : { id: comportement.dm ?? "D123" },
      }),
    },
  };
  return { client, appels };
}

async function cas(nom: string, comportement: Comportement, channelId: string): Promise<void> {
  const { client, appels } = fauxClient(comportement);
  try {
    await notifierUtilisateur(client, channelId, "U1", "texte");
  } catch {
    appels.push("ERREUR");
  }
  console.log(nom.padEnd(28) + " -> " + appels.join(", "));
}

async function main(): Promise<void> {
  await cas("ephemere OK", { ephemere: "ok" }, "C123");
  await cas("conversation privee", {}, "D123");
  await cas("not_in_channel", { ephemere: "not_in_channel" }, "C123");
  await cas("channel_not_found", { ephemere: "channel_not_found" }, "C123");
  await cas("erreur inconnue", { ephemere: "ratelimited" }, "C123");
  await cas("DM impossible", { dm: null }, "D123");
}

void main();
