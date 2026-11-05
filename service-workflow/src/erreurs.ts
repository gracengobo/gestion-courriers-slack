import { status } from "@grpc/grpc-js";

export class ErreurMetier extends Error {
  constructor(
    readonly statutGrpc: number,
    readonly codeMetier: string,
    message: string,
  ) {
    super(message);
    this.name = "ErreurMetier";
  }
}

export const courrierIntrouvable = () =>
  new ErreurMetier(status.NOT_FOUND, "COURRIER_INTROUVABLE", "Courrier introuvable.");

export const champManquant = (message: string) =>
  new ErreurMetier(status.INVALID_ARGUMENT, "CHAMP_MANQUANT", message);

export const serviceIndisponible = (message: string) =>
  new ErreurMetier(status.UNAVAILABLE, "SERVICE_INDISPONIBLE", message);
