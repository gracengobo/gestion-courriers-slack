CREATE TABLE "suivis" (
    "numero" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ENTRANT',
    "objet" TEXT NOT NULL,
    "expediteur" TEXT NOT NULL,
    "priorite" TEXT NOT NULL DEFAULT 'NORMALE',
    "confidentiel" BOOLEAN NOT NULL DEFAULT false,
    "serviceCode" TEXT,
    "destinataireSlackId" TEXT,
    "agentSlackId" TEXT,
    "langueDestinataire" TEXT NOT NULL DEFAULT 'fr',
    "statut" TEXT NOT NULL DEFAULT 'ENREGISTRE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "echeance" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suivis_pkey" PRIMARY KEY ("numero")
);

CREATE INDEX "suivis_destinataireSlackId_echeance_idx"
    ON "suivis"("destinataireSlackId", "echeance");
CREATE INDEX "suivis_serviceCode_statut_idx"
    ON "suivis"("serviceCode", "statut");

CREATE TABLE "historique" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "statut" TEXT NOT NULL,
    "acteurSlackId" TEXT NOT NULL,
    "commentaire" TEXT,
    "motif" TEXT,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historique_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "historique_numero_creeLe_idx" ON "historique"("numero", "creeLe");

ALTER TABLE "historique"
    ADD CONSTRAINT "historique_numero_fkey"
    FOREIGN KEY ("numero") REFERENCES "suivis"("numero")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "utilisateurs" (
    "slackId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'AGENT',
    "serviceCode" TEXT,
    "langue" TEXT NOT NULL DEFAULT 'fr',

    CONSTRAINT "utilisateurs_pkey" PRIMARY KEY ("slackId")
);

CREATE TABLE "evenements_traites" (
    "eventId" TEXT NOT NULL,
    "recuLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenements_traites_pkey" PRIMARY KEY ("eventId")
);
