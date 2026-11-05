CREATE TABLE "courriers" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "objet" TEXT NOT NULL,
    "expediteur" TEXT NOT NULL,
    "destinataire" TEXT NOT NULL,
    "contenu" TEXT,
    "pieceJointeUrl" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'RECU',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courriers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "courriers_numero_key" ON "courriers"("numero");

CREATE TABLE "compteurs_courrier" (
    "annee" INTEGER NOT NULL,
    "dernierNumero" INTEGER NOT NULL,

    CONSTRAINT "compteurs_courrier_pkey" PRIMARY KEY ("annee")
);

CREATE TABLE "journal_audit" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "courrierId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "journal_audit_courrierId_createdAt_idx"
    ON "journal_audit"("courrierId", "createdAt");
CREATE INDEX "journal_audit_numero_createdAt_idx"
    ON "journal_audit"("numero", "createdAt");
