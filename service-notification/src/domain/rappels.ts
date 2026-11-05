export interface EtatRappel {
  joursRestants: number;
  envoyerJ2: boolean;
  envoyerJour: boolean;
  enRetard: boolean;
  joursDeRetard: number;
}

function jourUtc(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function nombreDeJoursEntre(debut: Date, fin: Date): number {
  return Math.round((jourUtc(fin) - jourUtc(debut)) / 86_400_000);
}

export function memeJour(a: Date, b: Date): boolean {
  return jourUtc(a) === jourUtc(b);
}

export function etatRappel(
  echeance: Date,
  maintenant: Date,
  deja: { rappelJ2Envoye: boolean; rappelJourEnvoye: boolean },
): EtatRappel {
  const joursRestants = nombreDeJoursEntre(maintenant, echeance);

  return {
    joursRestants,
    envoyerJ2: joursRestants === 2 && !deja.rappelJ2Envoye,
    envoyerJour: joursRestants === 0 && !deja.rappelJourEnvoye,
    enRetard: joursRestants < 0,
    joursDeRetard: joursRestants < 0 ? -joursRestants : 0,
  };
}
