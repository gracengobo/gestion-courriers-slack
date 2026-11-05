// Échéance à 5 jours ouvrés, week-ends exclus (voir CONTRATS.md).
export function ajouterJoursOuvres(depart: Date, jours: number): Date {
  const date = new Date(depart.getTime());
  let restants = Math.max(Math.trunc(jours), 0);

  while (restants > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const jour = date.getUTCDay();
    if (jour !== 0 && jour !== 6) restants -= 1;
  }

  date.setUTCHours(16, 0, 0, 0);
  return date;
}

// Priorité HAUTE : 48 heures. Sinon : 5 jours ouvrés (RG-06).
export function calculerEcheance(
  priorite: string | null | undefined,
  depart: Date,
  joursOuvres: number,
): Date {
  if ((priorite ?? "NORMALE").toUpperCase() === "HAUTE") {
    return new Date(depart.getTime() + 48 * 60 * 60 * 1000);
  }
  return ajouterJoursOuvres(depart, joursOuvres);
}
