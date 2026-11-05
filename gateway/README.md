# Passerelle Slack

La passerelle utilise Slack Bolt en Socket Mode. Elle ne contient pas de logique métier : commandes et actions délèguent aux services gRPC décrits dans `../proto/`. Chaque appel gRPC a une échéance de deux secondes.

## Préparation

1. Créer une application Slack, activer **Socket Mode**, puis ajouter les scopes du bot `commands`, `chat:write`, `files:read`, `im:write`. Le jeton applicatif (`xapp-`) doit avoir le scope `connections:write`. Créer la commande `/courrier`, puis réinstaller l’application après chaque changement de scopes.
2. Copier `.env.example` en `.env` et renseigner `SLACK_BOT_TOKEN` (`xoxb-`), `SLACK_APP_TOKEN` (`xapp-`) et `SLACK_SIGNING_SECRET`.
3. Depuis le dossier `gateway`, lancer `npm install`, puis `npm run dev`. Pour produire la version exécutable : `npm run build`, puis `npm start`.
4. Le Gateway attend les services aux adresses gRPC configurées et MinIO avec le bucket `scans` déjà initialisé par l’infrastructure.
5. **ngrok n’est pas nécessaire en Socket Mode** : Slack ouvre la connexion vers le Gateway. ngrok ne sert que si l’on repasse en mode HTTP, auquel cas les URL de commande et d’interactivité doivent pointer vers le tunnel.

Les pièces jointes de création sont limitées à 10 Mo et aux PDF/JPG/PNG. Elles sont transférées vers MinIO avec une clé aléatoire datée; seul leur emplacement et leur empreinte sont communiqués au Service Courrier.
Les confirmations et les erreurs sont envoyées en message éphémère dans le canal, ou en message privé si le bot n’est pas membre du canal ou si la commande a été lancée en conversation privée (`im:write`).

## Commandes et interactions

- `/courrier nouveau`, `/courrier sortant`, `/courrier interne` : formulaire de création.
- `/courrier chercher <mots>`, `/courrier statut <numero>`, `/courrier analyse <numero>`, `/courrier decision <numero> VALIDEE|CORRIGEE|REJETEE [categorie] [service]`, `/courrier mes-courriers`, `/courrier stats`, `/courrier langue fr|en`, `/courrier aide`.
- La décision `CORRIGEE` attend au moins une catégorie ou un code de service final. Les filtres de statut et d’urgence interprétés par l’IA restent en attente des filtres correspondants dans les contrats Courrier/Workflow.
- Les actions de statut Slack sont transmises à `WorkflowService.ChangerStatut`. `valider_affectation` et `modifier_affectation` ouvrent le formulaire d’affectation.
- Pour respecter le contrôle de concurrence du contrat, `ObtenirHistoriqueResponse` expose `versionActuelle`; le Gateway la transmet comme `versionAttendue` à `ChangerStatut`.

## Vérification

`npm run typecheck` vérifie les sources TypeScript; `npm run build` compile le Gateway. `npx tsx src/test-notify.ts` vérifie sans Slack la transmission des réponses (message éphémère, conversation privée, repli en message privé).
Pour construire l’image depuis la racine du dépôt : `docker build -f gateway/Dockerfile -t gestion-courriers-gateway .`.

## Textes d’erreur

Le Gateway lit le `code-metier` dans les métadonnées gRPC et affiche le texte ci-dessous.

| `code-metier` | Français | English |
|---|---|---|
| `CHAMP_MANQUANT` | Certains champs obligatoires sont manquants. | Some required fields are missing. |
| `COMMENTAIRE_OBLIGATOIRE` | Un commentaire est obligatoire pour clôturer ce courrier. | A comment is required to close this letter. |
| `MOTIF_OBLIGATOIRE` | Un motif est obligatoire pour cette action. | A reason is required for this action. |
| `DROIT_INSUFFISANT` | Vous n’avez pas les droits nécessaires pour cette action. | You are not allowed to perform this action. |
| `COURRIER_INTROUVABLE` | Ce courrier est introuvable. | This letter could not be found. |
| `ANALYSE_INTROUVABLE` | Aucune analyse n’est disponible pour ce courrier. | No analysis is available for this letter. |
| `ALREADY_EXISTS` | Une décision a déjà été enregistrée pour cette analyse. | A decision has already been recorded for this analysis. |
| `TRANSITION_INTERDITE` | Cette transition de statut n’est pas autorisée. | This status transition is not allowed. |
| `COURRIER_ARCHIVE` | Ce courrier est archivé et ne peut plus être modifié. | This letter is archived and cannot be changed. |
| `CONFLIT_VERSION` | Ce courrier vient d’être modifié. Actualisez-le avant de réessayer. | This letter has changed. Refresh it before trying again. |
| `SERVICE_INDISPONIBLE` | Un service est temporairement indisponible. Réessayez plus tard. | A service is temporarily unavailable. Please try again. |

Les erreurs de saisie propres au formulaire (objet, expéditeur ou date manquants, pièce jointe refusée) sont affichées en français dans le message de retour.

## Dépannage : aucune réponse après la soumission

- La réponse est envoyée en message éphémère dans le canal. Si le bot n’est pas membre du canal, ou si le formulaire a été ouvert en conversation privée, elle part en message privé : le scope `im:write` est donc indispensable.
- Si le Service Courrier n’est pas joignable, la réponse affichée est « Un service est temporairement indisponible. Réessayez plus tard. ».
- Les échecs sont tracés dans la console du Gateway (`[gateway] ...`), avec le code gRPC et son message.
- Le formulaire transmet au maximum une pièce jointe, lue dans le champ `files` de `view.state.values`.

## Captures d’écran à fournir

À réaliser avec un espace de travail Slack réel, une fois les services Courrier et Workflow lancés :

1. formulaire de création (`/courrier nouveau`) ;
2. carte de validation avec ses boutons d’action ;
3. notification reçue par le destinataire ;
4. réponse à `/courrier stats` ;
5. réponse à `/courrier admin` (aujourd’hui : « Les opérations d’administration ne sont pas encore définies dans le contrat gRPC. »).
