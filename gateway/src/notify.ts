import type { WebClient } from "@slack/web-api";

function codeErreurSlack(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("data" in error)) return undefined;
  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null || !("error" in data)) return undefined;
  const code = (data as { error?: unknown }).error;
  return typeof code === "string" ? code : undefined;
}

async function envoyerMessagePrive(client: WebClient, userId: string, message: string): Promise<void> {
  const conversation = await client.conversations.open({ users: userId });
  const canal = conversation.channel?.id;
  if (!canal) {
    throw new Error("Impossible d'ouvrir le message privé Slack pour transmettre la réponse.");
  }
  await client.chat.postMessage({ channel: canal, text: message });
}

// Un message ephemere n'est pas admis dans une conversation privee (D...)
export async function notifierUtilisateur(
  client: WebClient,
  channelId: string,
  userId: string,
  message: string,
): Promise<void> {
  if (channelId.startsWith("D")) {
    await envoyerMessagePrive(client, userId, message);
    return;
  }

  try {
    await client.chat.postEphemeral({ channel: channelId, user: userId, text: message });
  } catch (error) {
    const code = codeErreurSlack(error);
    const repliPossible =
      code === "not_in_channel" ||
      code === "channel_not_found" ||
      code === "is_archived" ||
      code === "invalid_arguments";
    if (!repliPossible) throw error;

    console.warn(`[gateway] message ephemere refuse (${code}); envoi en message prive`);
    await envoyerMessagePrive(client, userId, message);
  }
}
