-- Tables de ia_db (Service IA)

-- Messages deja traites (pour ignorer les doublons)
CREATE TABLE IF NOT EXISTS evenements_traites (
    event_id  TEXT PRIMARY KEY,
    numero    TEXT NOT NULL,
    traite_le TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Une seule analyse par courrier
CREATE TABLE IF NOT EXISTS analyses (
    numero            TEXT PRIMARY KEY,
    statut_analyse    TEXT NOT NULL CHECK (statut_analyse IN ('ok', 'echec', 'ignore_confidentiel')),
    categorie         TEXT,
    confiance         REAL,
    urgence           TEXT,
    dates_detectees   TEXT[],
    resume            TEXT,
    service_suggere   TEXT,
    justification     TEXT,
    langue_detectee   TEXT,
    brouillon_reponse TEXT,
    produit_par_ia    BOOLEAN NOT NULL DEFAULT true,
    cree_le           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Decision humaine sur une analyse (on garde l'historique)
CREATE TABLE IF NOT EXISTS decisions (
    id               SERIAL PRIMARY KEY,
    numero           TEXT NOT NULL REFERENCES analyses (numero),
    decision         TEXT NOT NULL CHECK (decision IN ('VALIDEE', 'CORRIGEE', 'REJETEE')),
    acteur_slack_id  TEXT NOT NULL,
    categorie_finale TEXT,
    service_final    TEXT,
    decide_le        TIMESTAMPTZ NOT NULL DEFAULT now()
);