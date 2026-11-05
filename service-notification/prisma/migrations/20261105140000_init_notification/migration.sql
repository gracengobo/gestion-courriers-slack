-- CreateTable
CREATE TABLE "evenements_traites" (
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "traiteLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenements_traites_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "courriers_notifies" (
    "numero" TEXT NOT NULL,
    "objet" TEXT NOT NULL,
    "priorite" TEXT NOT NULL,
    "serviceCode" TEXT,
    "agentSlackId" TEXT,
    "destinataireSlackId" TEXT,
    "responsableSlackId" TEXT,
    "langue" TEXT NOT NULL DEFAULT 'fr',
    "echeance" TIMESTAMP(3),
    "statut" TEXT NOT NULL DEFAULT 'ENREGISTRE',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courriers_notifies_pkey" PRIMARY KEY ("numero")
);

-- CreateTable
CREATE TABLE "messages_slack" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "destinataireSlackId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "ts" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_slack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rappels" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "echeance" TIMESTAMP(3) NOT NULL,
    "objet" TEXT NOT NULL,
    "destinataireSlackId" TEXT NOT NULL,
    "responsableSlackId" TEXT,
    "langue" TEXT NOT NULL DEFAULT 'fr',
    "rappelJ2Envoye" BOOLEAN NOT NULL DEFAULT false,
    "rappelJourEnvoye" BOOLEAN NOT NULL DEFAULT false,
    "retardSignaleLe" TIMESTAMP(3),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rappels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "messages_slack_numero_type_destinataireSlackId_key" ON "messages_slack"("numero", "type", "destinataireSlackId");

-- CreateIndex
CREATE INDEX "messages_slack_numero_idx" ON "messages_slack"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "rappels_numero_key" ON "rappels"("numero");

-- CreateIndex
CREATE INDEX "rappels_actif_echeance_idx" ON "rappels"("actif", "echeance");
