# Ruolo e obiettivo

Sei un senior engineer full-stack esperto di NLP, media (audio/video), estensioni browser e interaction design.
Costruiamo insieme **Glint** (nome provvisorio): un progetto open-source che, ovunque una persona incontri un contenuto
(articolo, PDF, documento, video orizzontale, video verticale tipo Shorts/TikTok/Reels, podcast, film), rileva ogni
**menzione di un'opera** (libro, paper, articolo, video, film, serie, podcast, talk, canzone) e la rende consultabile:

1. **Prima di cliccare** → resoconto: badge con conteggio + card riassuntiva su link e miniature.
2. **Durante la fruizione** → la citazione appare nel punto esatto in cui viene nominata (timestamp nel video, posizione nel testo).
3. **Dopo** → elenco completo, salvabile ed esportabile (BibTeX, CSL-JSON, RIS, Zotero).

Vincoli non negoziabili: **non invasivo** (mai mettere in pausa, mai suoni, mai coprire sottotitoli o controlli, mai modali),
**animazioni molto interattive e attraenti**, **privacy-first**, **zero-config**.
Obiettivo: adozione di massa da parte di persone, creator e aziende.

# Come lavorare (importante)

- Sto imparando: spiegami in italiano ogni scelta tecnica, con la matematica dietro quando c'è.
  Codice, commenti, commit e docs pubbliche in inglese; README anche in italiano.
- **Fase 0, prima di scrivere codice**:
  a) verifica sul web stato attuale, limiti, licenze e termini d'uso di API e librerie citate qui sotto
     (non inventare endpoint: se non sei sicuro, verifica);
  b) analizza prodotti/progetti simili e scrivi `docs/LANDSCAPE.md`: cosa fanno, cosa manca, perché Glint è diverso;
  c) verifica che il nome sia libero su GitHub e npm, altrimenti proponi 5 alternative;
  d) presentami architettura e piano a milestone e **aspetta la mia conferma**.
- Milestone piccole e verificabili, commit atomici (Conventional Commits), test per ogni modulo, CI verde prima di andare avanti.
- Se un requisito è in conflitto con i ToS di una piattaforma o con il diritto d'autore, fermati e proponi l'alternativa lecita.
  Mai aggirare DRM, mai scaricare video da piattaforme che lo vietano.

# Architettura (monorepo TypeScript strict, pnpm workspaces)

```
packages/core        pipeline pura, senza DOM: extract → detect → link → score → track
packages/resolvers   plugin dei cataloghi (Wikidata, Open Library, Crossref, ...)
packages/media       testo+tempo da: sottotitoli, ASR on-device, OCR, PDF, DOCX
packages/ui          Web Components (Lit) + motore di animazione a molla + temi
packages/embed       script one-liner + wrapper React/Vue
packages/extension   estensione Manifest V3 (WXT o alternativa, verifica)
packages/server      API opzionale self-hostable (Hono, Docker one-command)
spec/                Open Citation Track: JSON Schema + esempi
apps/demo            playground con articolo, PDF, video orizzontale e verticale
eval/                gold set annotato + script delle metriche
docs/                MATH.md, ARCHITECTURE.md, PRIVACY.md, LANDSCAPE.md
```

Stack indicativo (verifica le versioni attuali): Vite, Vitest, Playwright (E2E anche sull'estensione), Lit,
transformers.js (WebGPU/WASM), pdf.js, Tesseract.js, Hono, GitHub Actions.

## Modello dati

```ts
type WorkType = "book" | "paper" | "article" | "video" | "film" | "series"
              | "podcast" | "talk" | "song" | "other";

interface Work {
  id: string;                         // canonico "wikidata:Q…", fallback "doi:…", "isbn:…", "tmdb:…"
  type: WorkType;
  title: string;
  authors: string[];
  year?: number;
  identifiers: Record<string, string>;
  links: { label: string; url: string }[];
  coverUrl?: string;
}

type Anchor =
  | { kind: "time"; start: number; end: number }                    // secondi
  | { kind: "text"; exact: string; prefix: string; suffix: string;  // W3C Web Annotation TextQuoteSelector
      startHint?: number };                                          // robusto ai cambi del DOM

interface Mention {
  id: string;
  surface: string;          // testo esatto pronunciato o scritto
  anchor: Anchor;
  workId: string | null;    // null = NIL, menzione non collegata
  p: number;                // confidenza calibrata ∈ [0, 1]
  source: "creator" | "auto";
}

interface CitationTrack {
  specVersion: string;      // semver
  content: { url?: string; hash?: string; durationSec?: number };
  works: Work[];
  mentions: Mention[];
}
```

# Pipeline e matematica

## 1. Estrazione testo + tempo
- Documenti: testo del DOM (mappa offset → Range), PDF (text layer di pdf.js), DOCX, Markdown.
- Video/audio, in ordine di priorità: (1) sottotitoli esistenti (WebVTT/SRT, caption della piattaforma se accessibili lecitamente);
  (2) ASR on-device (Whisper via transformers.js) con timestamp per parola; (3) opzionale OCR su frame campionati
  (testo sovrimpresso nei verticali, copertine mostrate).
- Output comune: sequenza di token wᵢ con intervallo [tₛ, tₑ] oppure offset di carattere.

## 2. Rilevamento menzioni
- Candidati: NER (WORK_OF_ART e simili), titoli tra virgolette o in corsivo, pattern multilingua (almeno it/en):
  "nel libro …", "come scrive X in …", "il paper di …", "nel film …", "ho letto …", "in the book …", "as X argues in …";
  DOI/ISBN/arXiv/URL espliciti (confidenza ≈ 1).
- Vettore di feature f ∈ ℝᵈ (pattern, maiuscole, virgolette, co-occorrenza col nome dell'autore, forza del match nel catalogo,
  frequenza nel contenuto). Probabilità: p_m = σ(wᵀf + b), calibrata con isotonic regression o Platt scaling sul gold set.
  Calibrazione misurata con ECE = Σ_b (|B_b|/n)·|acc(B_b) − conf(B_b)|.
- LLM opzionale e pluggable (locale via Ollama o API) solo per i casi ambigui (0.4 < p < 0.8).
  **Il core deve funzionare senza nessuna chiave API.**

## 3. Entity linking (menzione → opera reale)
- Normalizzazione: NFKD, rimozione diacritici, lowercase, rimozione di articoli e punteggiatura; titoli multilingua
  tramite le etichette Wikidata ("Il nome della rosa" ≡ "The Name of the Rose").
- Score del candidato e per la menzione m:
  s(m,e) = α·JW(titolo) + β·JW(autore) + γ·cos(φ(ctx_m), φ(desc_e)) + δ·log(1+pop_e)/log(1+pop_max) + ε·𝟙[tipo compatibile]
  dove JW = similarità Jaro–Winkler, φ = embedding multilingua on-device, cos(u,v) = u·v / (‖u‖·‖v‖).
- P(e|m) = softmax(s/T) sui candidati più un candidato NIL; se max P < τ_link, nessun link (meglio niente che sbagliato).
- Confidenza finale p = p_m · P(e|m). Pesi iniziali ragionati, poi stimati sul gold set (logistic regression o grid search).

## 4. Decidere SE mostrare (teoria delle decisioni)
Mostra solo se il valore atteso è positivo:
  p·U − (1−p)·C_fp − C_att > 0  ⇔  p > p* = (C_fp + C_att) / (U + C_fp)
Default U = 1, C_fp = 3, C_att = 0.2 ⇒ p* = 0.8, configurabile come "livello di discrezione".
Ottimizza F_β con β = 0.5: la precisione pesa più del recall, perché un falso positivo disturba più di una citazione persa.
Le menzioni con 0.5 ≤ p < p* vanno solo nel resoconto, marcate "forse".

## 5. Tempo, ritmo e spazio (non invasività misurabile)
- Finestra di visualizzazione [tₛ − δ, tₑ + Δ] con δ = 0.3 s, Δ = 6 s; finestre sovrapposte unite (interval merging, O(n log n)).
- Rate limiting con token bucket: b(t) = min(k, b(t₀) + r·(t − t₀)), k = 2, r = 0.1 s⁻¹.
  Un chip appare solo se b ≥ 1 (poi b ← b − 1); altrimenti la citazione va direttamente nel tray (contatore "+n").
  Al massimo 2 chip contemporanei.
- Occlusione: chip chiuso ≤ 1.5% dell'area del player, card aperta ≤ 12% e solo su hover/focus.
- Posizionamento: per ogni slot candidato s ∈ S,
  J(s) = w₁·IoU(s, UI piattaforma) + w₂·IoU(s, sottotitoli) + w₃·IoU(s, zone salienti: volti/testo) + w₄·‖s − s_prev‖;
  scegli argmin J. Preset di safe-zone per YouTube, Shorts, TikTok, Reels (nei verticali la UI occupa il lato destro e il basso).
- Fullscreen o modalità focus: solo un punto luminoso di 6 px. Scorciatoia per nascondere tutto; disattivazione per singolo sito.

## 6. Animazione: concept "costellazione"
Quando un'opera viene nominata, un piccolo bagliore (glint) appare al bordo e si trasforma (tecnica FLIP) in una pill con
copertina, icona del tipo e titolo. Dopo Δ si rimpicciolisce in una stella che "vola" nel tray, dove le citazioni della
sessione formano una costellazione. Hover/focus → card espansa con molla: copertina, autore, anno, la frase esatta in cui
è citata, azioni (apri, salva, copia citazione, vai al momento).
- Motore a molla **analitico**, indipendente dal frame rate. Oscillatore smorzato x'' + 2ζω₀x' + ω₀²x = 0;
  per ζ < 1: x(t) = e^(−ζω₀t)·(A·cos(ω_d t) + B·sin(ω_d t)), con ω_d = ω₀·√(1−ζ²).
  ζ ≈ 0.7 per il "pop", ζ = 1 (smorzamento critico, nessun overshoot) per le chiusure. Niente integrazione di Euler.
- Animare solo transform e opacity (compositor). Budget ≤ 2 ms di JS per frame a 60 fps (16.7 ms). Shadow DOM per isolare
  gli stili dalla pagina ospite.
- prefers-reduced-motion ⇒ solo dissolvenze. WCAG 2.2 AA, navigazione completa da tastiera,
  aria-live="polite" ("Citato: Sapiens, libro di Yuval Noah Harari"), tema chiaro/scuro automatico.

## 7. Resoconto pre-click
- IntersectionObserver su link e miniature visibili → prefetch in requestIdleCallback
  (max 3 richieste concorrenti, cache LRU in memoria + IndexedDB).
- Badge discreto con il conteggio sulla miniatura. Hover con intent delay di 300 ms → card con conteggio per tipo,
  top-5 opere e **mini-timeline** (barra con un punto per ogni citazione). Cliccando un punto il contenuto si apre già al secondo giusto.
- Contenuto non ancora analizzato: nessun badge, mai spinner; analisi lazy in background.

# Resolver (architettura a plugin)

```ts
interface Resolver {
  id: string;
  types: WorkType[];
  search(q: { surface: string; context: string; typeHint?: WorkType; lang: string },
         signal: AbortSignal): Promise<Candidate[]>;
}
```

Primi resolver: Wikidata (hub, il QID è l'ID canonico), Open Library, Google Books, Crossref, OpenAlex, Semantic Scholar,
arXiv, TMDB (film/serie), YouTube Data API, MusicBrainz, Podcast Index. Ognuno con cache, token bucket proprio e retry con
backoff esponenziale + jitter: delay_n = min(cap, base·2ⁿ)·U(0.5, 1). Rispetta attribuzioni e ToS (verificali in Fase 0).

**Per le aziende**: resolver custom per cataloghi interni (Confluence, SharePoint, Notion, Google Drive, wiki interne).
In una registrazione di riunione, "come dice il report Q3" diventa un link al documento interno.

# Standard aperto: Open Citation Track

In `spec/` definisci un formato aperto, così creator ed editori possono pubblicare citazioni verificate:
- JSON Schema `citation-track.schema.json`, versionato in semver;
- trasporto: traccia WebVTT `kind="metadata"` con cue JSON (funziona in qualunque player HTML5), sidecar `*.citations.json`,
  mapping verso la proprietà schema.org `citation`;
- se esiste una traccia ufficiale ha priorità sul rilevamento automatico (badge "verificato dal creator").

# Superfici di distribuzione (in ordine di priorità)

1. Estensione browser MV3: Chrome, Edge, Firefox (Safari dopo). YouTube + Shorts, Vimeo, video HTML5 generici, articoli, PDF;
   TikTok e Instagram web solo nei limiti dei loro ToS.
2. Embed one-liner per siti, LMS e intranet: `<script type="module" src=".../glint.js">` + `<glint-layer for="#player">`,
   UI ≤ 30 KB gzip, più wrapper React/Vue.
3. Server opzionale self-hostable: API di analisi, cache condivisa opt-in, piccola dashboard admin.
4. Roadmap: plugin Jellyfin (film e serie personali con SRT), Obsidian, WordPress, bot Slack/Teams che riassume
   le citazioni dei link condivisi.
   Servizi di streaming con DRM: nessun aggiramento, solo sottotitoli già esposti al player e solo se i ToS lo consentono.

# Privacy e aspetti legali

- Local-first: trascrizione e rilevamento sul dispositivo. Verso i cataloghi parte solo la stringa della menzione, mai la trascrizione.
- Cache condivisa solo opt-in: si inviano (SHA-256 dell'URL canonico, citation track), nessun dato personale.
  Nessuna telemetria di default. Conformità GDPR, `docs/PRIVACY.md` chiaro e breve.
- Nessuna trascrizione completa o contenuto protetto salvato: solo metadati delle citazioni e brevissimi estratti di contesto.
- Link neutrali, nessuna affiliazione di default (la fiducia è il prodotto).
- Licenza Apache-2.0 (concessione di brevetti esplicita, adatta alle aziende).

# Valutazione (eval/)

- Gold set annotato a mano: ≥ 60 item misti (articoli, PDF, video orizzontali e verticali, podcast; it + en)
  con opere e timestamp corretti.
- Metriche nel CI con report: precision, recall, F₀.₅ per tipo di opera; Accuracy@1 del linking; MAE temporale in secondi; ECE.
- Target iniziali, da rivedere dopo la prima misura: precision ≥ 0.90, F₀.₅ ≥ 0.80, Acc@1 ≥ 0.85, MAE ≤ 1.0 s, ECE ≤ 0.05.
- Performance: ASR con real-time factor < 0.5 su un laptop medio con WebGPU; overlay ≤ 2 ms/frame; nessuna regressione
  Lighthouse sulle pagine ospiti.

# Milestone

- M0: Fase 0 (ricerca, LANDSCAPE.md, nome, piano) → mia conferma.
- M1: core + resolver base (Wikidata, Open Library, Crossref, OpenAlex, TMDB) + gold set iniziale + eval nel CI.
- M2: UI (web components + motore a molla) + `apps/demo` con articolo, PDF, video orizzontale e verticale con sottotitoli.
- M3: estensione per articoli/PDF + YouTube con sottotitoli; resoconto pre-click sulle miniature YouTube.
- M4: ASR on-device per video senza sottotitoli; video verticali (Shorts, poi TikTok/Reels nei limiti dei ToS); placement con safe-zone.
- M5: embed SDK + Open Citation Track + server self-hostable + resolver aziendali.
- M6: lancio con README e GIF demo, landing page, docs, CONTRIBUTING, good first issues, template di issue/PR,
  i18n it/en, pubblicazione negli store delle estensioni.

Ogni milestone si chiude con: test verdi, metriche aggiornate, demo funzionante e una breve nota in italiano su cosa ho imparato
(concetti e formule usati).

# Documentazione obbligatoria

- `docs/MATH.md`: ogni formula usata, con derivazione e intuizione (serve anche a me per imparare).
- `docs/ARCHITECTURE.md` con un diagramma Mermaid della pipeline.
- `docs/PRIVACY.md`, `spec/README.md`, `CONTRIBUTING.md`.

Inizia ora dalla Fase 0.
