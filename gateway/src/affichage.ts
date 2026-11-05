export interface CourrierAffiche {
  numero: string;
  objet: string;
  statut?: string;
  priorite?: string;
  echeance?: string;
}

export interface EntreeHistorique {
  statut: string;
  acteurSlackId: string;
  commentaire: string;
  motif: string;
  creeLe: string;
}

export function formatDateHeure(valeur: string | undefined): string {
  if (!valeur) return "";
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return valeur;
  const jour = String(date.getUTCDate()).padStart(2, "0");
  const mois = String(date.getUTCMonth() + 1).padStart(2, "0");
  const heures = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${jour}/${mois}/${date.getUTCFullYear()} ${heures}:${minutes} UTC`;
}

// La recherche renvoie les champs du Service Courrier; le statut vient du Workflow.
export function appliquerStatuts<T extends { numero: string }>(
  courriers: readonly T[],
  statuts: ReadonlyMap<string, string>,
): Array<T & { statut?: string }> {
  return courriers.map((courrier) => ({ ...courrier, statut: statuts.get(courrier.numero) }));
}

export function dernierStatut(entrees: readonly EntreeHistorique[]): string {
  return entrees.length ? entrees[entrees.length - 1]!.statut : "INCONNU";
}

export function formatCourriers(
  items: readonly CourrierAffiche[],
  vide = "Aucun courrier trouvé.",
): string {
  if (!items.length) return vide;
  return items
    .slice(0, 20)
    .map((item) => {
      const details = [item.statut ?? "Statut indisponible"];
      if (item.priorite) details.push(item.priorite);
      const echeance = formatDateHeure(item.echeance);
      if (echeance) details.push(`échéance ${echeance}`);
      return `• *${item.numero}* — ${item.objet || "Sans objet"} · ${details.join(" · ")}`;
    })
    .join("\n");
}

export function resumeDerniereAction(entree: EntreeHistorique | undefined): string {
  if (!entree) return "Aucune action enregistrée.";
  const date = formatDateHeure(entree.creeLe);
  const precision = entree.commentaire || entree.motif;
  return `${entree.statut}${date ? ` le ${date}` : ""}${precision ? ` — ${precision}` : ""}`;
}
