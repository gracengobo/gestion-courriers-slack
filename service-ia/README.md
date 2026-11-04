# service-ia

Service IA du projet G3 (Gestion des courriers via Slack). Binome 5.

Il ecoute `courrier.cree`, lit le scan dans MinIO, extrait le texte (OCR), fait analyser le courrier, puis publie `courrier.analyse`. L'IA propose, une personne decide.

## Lancer

1. Demarrer l'infrastructure (a la racine du depot) :

```
docker compose up -d
```

2. Dans ce dossier :

```
npm install
copy .env.example .env
npx tsx src/init-db.ts
npm run dev
```

`init-db.ts` cree les tables de `ia_db`. On ne le lance qu'une fois (il ne casse rien si on le relance).

## Configuration

Les variables sont dans `.env.example`. Le vrai `.env` n'est jamais envoye sur Git.
La cle `IA_API_KEY` (Gemini) est necessaire seulement quand la vraie analyse sera branchee.

## Tester seul

Il faut 3 terminaux, tous dans `service-ia`.

- Terminal 1 : `npm run dev`
- Terminal 2 : `npx tsx src/ecouter-analyse.ts` (affiche ce que le service publie)
- Terminal 3 : un des envois ci-dessous

```
npx tsx src/envoyer-scan.ts scans-test\test-scan.png CE-2026-0044
npx tsx src/envoyer-test.ts CE-2026-0045 confidentiel
npx tsx src/envoyer-test.ts CE-2026-0046
```

- Le premier depose le scan dans MinIO et envoie un courrier normal.
- Le deuxieme envoie un courrier confidentiel (resultat : `ignore_confidentiel`).
- Le troisieme n'a pas de piece jointe (resultat : `echec`).

Le dossier `scans-test` n'est pas dans Git : il faut y mettre une image PNG avec du texte.

## Fichiers

| Fichier | Role |
|---|---|
| `src/index.ts` | Point de depart |
| `src/config.ts` | Lit le `.env` |
| `src/rabbit.ts` | Connexion RabbitMQ, files |
| `src/consumer.ts` | Ecoute la file, 3 tentatives, file `.erreurs` |
| `src/traitement.ts` | Enchaine tout le traitement d'un courrier |
| `src/storage.ts` | Lecture du scan dans MinIO |
| `src/ocr.ts` | Lecture du texte (Tesseract pour les images, unpdf pour les PDF) |
| `src/db.ts` | Base `ia_db` |
| `src/publisher.ts` | Publie `courrier.analyse` |
| `src/contrat-analyse.ts` | Contrat avec la partie analyse (`analyserTexte`) |
| `sql/schema.sql` | Tables de `ia_db` |

## Regles du service

- Un courrier confidentiel n'est jamais envoye a l'IA.
- Une seule analyse par courrier, et les messages deja vus sont ignores.
- Si l'analyse echoue, le service publie `echec` et le courrier se traite a la main.
- Un message qui echoue est retente 3 fois (5 secondes d'attente), puis va dans `ia.courrier.cree.erreurs`.

## gRPC

Le serveur ecoute sur le port 50053 (`src/grpc.ts`). Il charge pour l'instant `proposition-proto/ia.proto`, en attendant le fichier officiel dans `proto/` (a valider avec le binome 2).

- `ObtenirAnalyse` : renvoie l'analyse d'un courrier (erreur `ANALYSE_INTROUVABLE` si elle n'existe pas).
- `EnregistrerDecision` : garde la decision humaine (`VALIDEE`, `CORRIGEE`, `REJETEE`).
- `InterpreterRecherche` : pas encore disponible (code 12, UNIMPLEMENTED).

Pour tester : `npm run dev` dans un terminal, puis `npx tsx src/test-grpc.ts` dans un autre.

Le controle des droits (`DROIT_INSUFFISANT`) n'est pas fait ici : les roles sont dans le Service Workflow.

## A faire

- Brancher la vraie analyse (Gemini) a la place de la version de test de `analyserTexte`.
- Brancher `InterpreterRecherche` (partie B).
- Remplacer `proposition-proto/` par `proto/ia.proto` quand le binome 2 l'aura valide.