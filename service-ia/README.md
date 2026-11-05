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
La cle `IA_API_KEY` est necessaire pour l'analyse.

Fournisseur par defaut : Groq (`IA_FOURNISSEUR=groq`), modele `openai/gpt-oss-120b`,
appele par l'API compatible OpenAI (`https://api.groq.com/openai/v1`).
Gemini reste disponible avec `IA_FOURNISSEUR=gemini` (`gemini-flash-latest`).
On peut changer le modele avec `IA_MODELE` et l'adresse avec `IA_BASE_URL`.
Chaque appel est borne a 15 secondes (`IA_DELAI_MS`) et tente 2 fois (`IA_TENTATIVES`).

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
| `src/contrat-analyse.ts` | Types du contrat avec la partie analyse |
| `src/prompts.ts` | Consignes envoyees au modele (analyse et recherche) |
| `src/validation.ts` | Verification du JSON renvoye par le modele |
| `src/llm.ts` | Appel du modele (Groq ou Gemini), delai, tentatives, `analyserTexte` |
| `src/recherche.ts` | `interpreterRecherche` : phrase en langage courant vers filtres (BF-44) |
| `src/test-analyse.ts` | Test de l'analyse sans RabbitMQ ni MinIO |
| `src/test-recherche.ts` | Test de la recherche en langage courant |
| `src/test-ocr.ts` | Test fichier local (PDF/JPG/PNG) -> OCR -> analyse |
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

## Analyse IA

Sans infrastructure, dans ce dossier :

```
npx tsx src/test-analyse.ts
npx tsx src/test-recherche.ts
npx tsx src/test-ocr.ts scans-test/lettre.png CE-2026-0201
npx tsx src/test-ocr.ts "chemin/vers/document.pdf" CE-2026-0202
```

Les scripts affichent le resultat de chaque cas et sortent en erreur si un appel echoue.
`test-ocr.ts` lit un fichier local (PDF, JPG ou PNG), extrait le texte puis l'analyse :
il teste le meme chemin que le service, sans RabbitMQ ni MinIO.
`analyserTexte` lance une erreur si le modele ne repond pas ou si le JSON est invalide :
le service publie alors `courrier.analyse` avec `statutAnalyse = "echec"`.

## A faire

- Brancher `InterpreterRecherche` dans `grpc.ts` (partie A).
- Remplacer `proposition-proto/` par `proto/ia.proto` quand le binome 2 l'aura valide.