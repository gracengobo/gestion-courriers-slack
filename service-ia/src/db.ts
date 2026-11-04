import pg from "pg";
import { config } from "./config.js";
import type { DonneesAnalyse } from "./types.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });

// Ce message a-t-il deja ete traite ?
export async function evenementDejaTraite(eventId: string): Promise<boolean> {
  const r = await pool.query("SELECT 1 FROM evenements_traites WHERE event_id = $1", [eventId]);
  return (r.rowCount ?? 0) > 0;
}

// Ce courrier a-t-il deja une analyse ?
export async function analyseExiste(numero: string): Promise<boolean> {
  const r = await pool.query("SELECT 1 FROM analyses WHERE numero = $1", [numero]);
  return (r.rowCount ?? 0) > 0;
}

// Note le message comme traite (sans enregistrer d'analyse)
export async function marquerEvenement(eventId: string, numero: string) {
  await pool.query(
    "INSERT INTO evenements_traites (event_id, numero) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [eventId, numero]
  );
}

// Enregistre l'analyse et le message traite, en une seule fois
export async function enregistrerAnalyse(
  eventId: string,
  numero: string,
  donnees: DonneesAnalyse,
  brouillon: string | null
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO analyses
         (numero, statut_analyse, categorie, confiance, urgence, dates_detectees,
          resume, service_suggere, justification, langue_detectee, brouillon_reponse, produit_par_ia)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (numero) DO NOTHING`,
      [
        numero,
        donnees.statutAnalyse,
        donnees.categorie,
        donnees.confiance,
        donnees.urgence,
        donnees.datesDetectees,
        donnees.resume,
        donnees.serviceSuggere,
        donnees.justification,
        donnees.langueDetectee,
        brouillon,
        donnees.produitParIA
      ]
    );
    await client.query(
      "INSERT INTO evenements_traites (event_id, numero) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [eventId, numero]
    );
    await client.query("COMMIT");
  } catch (erreur) {
    await client.query("ROLLBACK");
    throw erreur;
  } finally {
    client.release();
  }
}

// Lit l'analyse d'un courrier (null si elle n'existe pas)
export async function lireAnalyse(numero: string) {
  const r = await pool.query("SELECT * FROM analyses WHERE numero = $1", [numero]);
  return r.rows[0] ?? null;
}

// Enregistre la decision humaine sur une analyse
export async function enregistrerDecision(
  numero: string,
  decision: string,
  acteurSlackId: string,
  categorieFinale: string | null,
  serviceFinal: string | null
): Promise<string> {
  const r = await pool.query(
    `INSERT INTO decisions (numero, decision, acteur_slack_id, categorie_finale, service_final)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING decide_le`,
    [numero, decision, acteurSlackId, categorieFinale, serviceFinal]
  );
  return new Date(r.rows[0].decide_le).toISOString();
}