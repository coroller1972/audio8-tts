# Audio8 Studio

SPA de test d’Audio8-TTS Preview 0.6B : import d’un extrait vocal ou enregistrement
au microphone, création de profils réutilisables, synthèse à partir de texte,
réglages et comparaison des essais. Interface française, React + TypeScript +
Vite ; service FastAPI et moteur officiel ONNX INT4 sur CPU.

## Démarrer sur ce Mac

Les dépendances et le modèle sont déjà installés dans ce projet.

```bash
npm run dev
```

Ouvrir http://127.0.0.1:5173. Le service écoute sur 127.0.0.1:8000.
Attendre « Modèle prêt », importer ou enregistrer un extrait, renseigner son nom
et sa transcription exacte, puis cliquer sur « Créer la voix ». Sélectionner la
voix, écrire un texte et cliquer sur « Générer l’audio ».

Pour une nouvelle installation : Node.js 22.12+ ou 24+, Python 3.12, `uv`, FFmpeg.
Le runtime amont est testé sur macOS arm64. Le premier téléchargement est de
968 Mio environ, dans `models/audio8-int4/`.

```bash
npm run setup
npm run dev
```

`uv` choisit Python 3.12 même si le Python système a une autre version.
Le téléchargement utilise la révision conservée dans `model.lock.json`.
Aucun token Hugging Face n’est nécessaire pour le modèle public.

## Fonctionnement

- Audio de référence : 0,5 à 30 secondes, 50 Mio maximum. 5 à 15 secondes de parole
  claire sont conseillées. La transcription doit correspondre aux mots prononcés.
- WAV, MP3, M4A, FLAC, OGG et WebM sont décodés par FFmpeg, puis convertis en mono
  44,1 kHz. Le microphone nécessite localhost ou HTTPS et son autorisation.
- Enregistrement : une phrase à lire préremplit la transcription ; modifier la
  transcription si l’on prononce autre chose. Arrêt automatique après environ 29 s.
- Une voix est encodée une seule fois. Ses codes et sa transcription restent dans
  `data/voices/`. L’extrait original n’est pas conservé par le service.
- La synthèse produit un WAV PCM 16 bits à 44,1 kHz. Les WAV restent dans
  `data/outputs/`, et l’historique SQLite dans `data/studio.sqlite3`.
- Les 50 derniers essais restent accessibles après rechargement/redémarrage.
  Chaque essai expose le texte, les réglages effectifs, la révision du modèle,
  la durée de calcul, la durée audio, le WAV et un export JSON.
- « Réutiliser » restaure le texte, la voix et les réglages. « Supprimer » efface
  cet essai et son WAV. Les générations peuvent être annulées, même dans la file.
- Un seul travail utilise le moteur à la fois, avec huit travaux en attente ou en
  cours maximum. Les sessions de synthèse sont libérées pendant l’encodage vocal.

| Paramètre | Défaut | Limites |
| --- | --- | --- |
| Température | 0,7 | 0,05–2 |
| Top P | 0,9 | 0,05–1 |
| Top K | 50 | 1–4096 ; le curseur couvre 1–200 |
| Tokens maximum | 512 | 1–2048, limité par le contexte restant |
| Seed | 42 | 0–4294967295 ; vide = aléatoire |

Le runtime ONNX échantillonne toujours : `do_sample=false` n’est pas disponible.
La seed effective est enregistrée, y compris lorsqu’elle est choisie aléatoirement.
Une frame vaut environ 46 ms ; les tokens maximum ne garantissent pas une durée.
Un message prévient si la génération atteint son plafond et peut être coupée.
Le texte et la référence partagent un contexte de 2048 positions. L’application
limite le texte à 4000 caractères ; un texte qui dépasse le contexte réel est rejeté.

Il s’agit de la version quantifiée INT4, pas d’une évaluation du checkpoint BF16.
La quantification peut modifier la sortie. Le modèle est en Preview : la qualité
dépend de l’extrait, de sa transcription, du texte et des paramètres.

## Configuration serveur

| Variable | Défaut |
| --- | --- |
| `AUDIO8_MODEL_DIR` | `models/audio8-int4` |
| `AUDIO8_DATA_DIR` | `data` |
| `AUDIO8_THREADS` | `5` |
| `AUDIO8_FFMPEG` | exécutable `ffmpeg` trouvé dans le PATH |

Pour servir la SPA compilée et l’API depuis la même origine :

```bash
npm run build
npm start
```

Puis ouvrir http://127.0.0.1:8000. Cette version vise une utilisation locale,
sans authentification. Aucune publication sur Hugging Face n’a été effectuée.
Les routes se trouvent dans `backend/app.py` ; leur documentation est disponible
sur http://127.0.0.1:8000/docs.

## Vérifier

```bash
npm run build
npm run check
npm test
```

Les tests couvrent le décodage WebM, le rééchantillonnage, les limites audio,
la validation des requêtes, la conservation de la seed aléatoire et des réglages,
les exports WAV/JSON, l’annulation et la persistance après redémarrage.
Les tests du service utilisent un moteur contrôlé ; une synthèse avec les vrais
poids a aussi été vérifiée depuis la SPA.

## Sources et attribution

- Modèle : https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6B-ONNX-INT4
- Runtime : https://github.com/Edge0-AI/Audio8_TTS/tree/master/onnx_runtime
- Code amont conservé sans modification dans `backend/third_party/arktts_runtime`.
- Révision du runtime et notices Apache-2.0 : `backend/third_party/UPSTREAM.md`,
  `LICENSE` et `NOTICE` dans ce même répertoire.
- Concept visuel et choix d’interface : `docs/design.md`, `docs/design-concept.png`.
