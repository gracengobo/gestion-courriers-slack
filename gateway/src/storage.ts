import { createHash, randomUUID } from "node:crypto";
import { Client } from "minio";
import type { WebClient } from "@slack/web-api";
import { config } from "./config";
import type { PieceJointe } from "./grpc";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

export class AttachmentStorage {
  constructor(
    private readonly minio: Client,
    private readonly bucket: string,
  ) {}

  async storeSlackFile(client: WebClient, fileId: string): Promise<PieceJointe> {
    const info = await client.files.info({ file: fileId });
    const file = info.file;
    if (!file?.url_private_download || !file.mimetype || !file.name) {
      throw new Error("Le fichier Slack est incomplet ou inaccessible.");
    }

    const extension = ACCEPTED_TYPES.get(file.mimetype);
    if (!extension) {
      throw new Error("Formats acceptés : PDF, JPG et PNG.");
    }
    if (typeof file.size === "number" && file.size > MAX_FILE_BYTES) {
      throw new Error("La pièce jointe dépasse la limite de 10 Mo.");
    }

    const response = await fetch(file.url_private_download, {
      headers: { Authorization: `Bearer ${config.slackBotToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Téléchargement Slack impossible (HTTP ${response.status}).`);
    }
    const buffer = await readBounded(response.body);
    if (buffer.byteLength === 0) {
      throw new Error("Le fichier téléchargé est vide.");
    }
    if (!matchesSignature(file.mimetype, buffer)) {
      throw new Error("Le contenu du fichier ne correspond pas à son type déclaré.");
    }

    const year = new Date().getUTCFullYear();
    const key = `${year}/${randomUUID()}.${extension}`;
    const digest = createHash("sha256").update(buffer).digest("hex");
    const exists = await this.minio.bucketExists(this.bucket);
    if (!exists) {
      throw new Error(`Le bucket MinIO "${this.bucket}" n'existe pas.`);
    }
    await this.minio.putObject(this.bucket, key, buffer, buffer.byteLength, {
      "Content-Type": file.mimetype,
    });

    return {
      bucket: this.bucket,
      cle: key,
      nomOriginal: file.name,
      typeMime: file.mimetype,
      tailleOctets: buffer.byteLength,
      empreinteSha256: digest,
    };
  }

  async remove(key: string): Promise<void> {
    await this.minio.removeObject(this.bucket, key);
  }
}

function matchesSignature(mimeType: string, buffer: Buffer): boolean {
  switch (mimeType) {
    case "application/pdf":
      return buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"));
    case "image/jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    default:
      return false;
  }
}

async function readBounded(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FILE_BYTES) {
        await reader.cancel();
        throw new Error("La pièce jointe dépasse la limite de 10 Mo.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}
