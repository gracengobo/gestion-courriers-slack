# Passerelle Slack

La passerelle utilise Slack Bolt en Socket Mode. Elle ne contient pas de logique métier : commandes et actions délèguent aux services gRPC décrits dans `../proto/`. Chaque appel gRPC a une échéance de deux secondes.

## Préparation

1. Copier `.env.example` en `.env` et renseigner les jetons Slack. Créer une application Slack avec Socket Mode activé, le bot token scopes requis (`commands`, `chat:write`, `files:read`) et une commande `/courrier`.
2. Depuis le dossier `gateway`, lancer `npm install`, puis `npm run dev`. Pour produire la version exécutable : `npm run build`, puis `npm start`.
3. Le Gateway attend les services aux adresses gRPC configurées et MinIO avec le bucket `scans` déjà initialisé par l’infrastructure.

Les pièces jointes de création sont limitées à 10 Mo et aux PDF/JPG/PNG. Elles sont transférées vers MinIO avec une clé aléatoire datée; seul leur emplacement et leur empreinte sont communiqués au Service Courrier.

## Commandes et interactions

- `/courrier nouveau`, `/courrier sortant`, `/courrier interne` : formulaire de création.
- `/courrier chercher <mots>`, `/courrier statut <numero>`, `/courrier analyse <numero>`, `/courrier decision <numero> VALIDEE|CORRIGEE|REJETEE [categorie] [service]`, `/courrier mes-courriers`, `/courrier stats`, `/courrier langue fr|en`, `/courrier aide`.
- La décision `CORRIGEE` attend au moins une catégorie ou un code de service final. Les filtres de statut et d’urgence interprétés par l’IA restent en attente des filtres correspondants dans les contrats Courrier/Workflow.
- Les actions de statut Slack sont transmises à `WorkflowService.ChangerStatut`. `valider_affectation` et `modifier_affectation` ouvrent le formulaire d’affectation.
- Pour respecter le contrôle de concurrence du contrat, `ObtenirHistoriqueResponse` expose `versionActuelle`; le Gateway la transmet comme `versionAttendue` à `ChangerStatut`.

## Vérification

`npm run typecheck` vérifie les sources TypeScript; `npm run build` compile le Gateway.
Pour construire l’image depuis la racine du dépôt : `docker build -f gateway/Dockerfile -t gestion-courriers-gateway .`.
