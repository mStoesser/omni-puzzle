# Architektur

## Überblick

```
┌──────────────────────────── Browser / PWA ────────────────────────────┐
│  UI (lit-html)                                                        │
│   Views: Start · Bibliothek · Spielen · Editor                        │
│        │                                                              │
│  Core: Router · Store · Registry · Share-Codec · Storage · Grid-Utils │
│        │                                                              │
│  Puzzle-Plugins: quiz · laser · rushhour · …                          │
│   je: logic (rein) · solver (rein) · render · editor                  │
└───────────────────────────────────────────────────────────────────────┘
Phase 2: + Backend (Galerie, Accounts, Bewertungen)
```

## Tech-Entscheidungen

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Templates | `lit-html` (`html` und `svg`) | klein, nah am Standard, effizientes Diffing |
| Komponenten | Funktionen, die Templates zurückgeben; Custom Elements nur bei echtem Bedarf | so wenig Abstraktion wie möglich |
| Spielfeld | **SVG** mit `viewBox` | skaliert automatisch, Pointer Events pro Element, gut testbar; Canvas nur, falls Performance es später verlangt |
| Sprache | TypeScript, nur „erasable syntax“ | Typsicherheit; Tests laufen direkt in Node ohne Build |
| Build | Vite | einzige Build-Abhängigkeit, schneller Dev-Server |
| Tests | `node --test` | eingebaut, keine Abhängigkeit |
| Routing | eigener Hash-Router | funktioniert auf statischem Hosting; Hash wird nie an den Server gesendet |
| State | eigener Mini-Store (Zustand, `subscribe`, `set`) und ein Render-Loop | ca. 30 Zeilen |
| Lokale Speicherung | IndexedDB mit kleinem eigenen Wrapper | eigene Rätsel, Fortschritt |
| Kompression | `CompressionStream('deflate-raw')` | nativ, kein lz-string |
| Offline | `manifest.webmanifest` und handgeschriebener Service Worker | PWA ohne Workbox |

### tsconfig (wichtige Optionen)

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
```

## Ordnerstruktur

```
index.html
public/
  manifest.webmanifest
  sw.js
  icons/
src/
  main.ts                 # Bootstrapping, Router-Start, Render-Loop
  i18n/de.ts              # alle UI-Texte
  i18n/t.ts               # t(key, params): Textabruf mit {platzhalter}
  core/
    types.ts              # PuzzleDocument, PuzzleType-Interface, Hilfstypen
    registry.ts           # Registrierung und Lookup der Rätseltypen
    store.ts              # Mini-Store
    router.ts             # Hash-Router
    session.ts            # Spiel-Session (rein): Historie, Undo/Redo, Neustart, Zugzähler, gelöst
    document.ts           # Hülle prüfen, loadDocument: Hülle → Typ → migrate → validate
    share.ts              # encode/decode PuzzleDocument <-> URL-Code
    storage.ts            # IndexedDB-Wrapper
    grid.ts               # Richtungen, Koordinaten, Raster-Hilfen (rein)
    hash.ts               # SHA-256-Hilfen für Quiz-Antworten
    test-fixtures.ts      # Mini-Rätseltyp „counter“ nur für Core-Tests
  ui/
    views/                # home.ts, library.ts, play.ts, editor.ts
    components/           # button, dialog, toolbar, grid-editor …
    styles.css
  puzzles/
    index.ts              # registriert alle Typen
    rushhour/  { index.ts, logic.ts, solver.ts, render.ts, editor.ts, *.test.ts }
    laser/     { … }
    quiz/      { … }
docs/
```

## Das Datenformat: `PuzzleDocument`

Jedes Rätsel, egal welcher Typ, steckt in derselben Hülle:

```ts
type PuzzleDocument<D = unknown> = {
  format: 1;              // Version der Hülle
  type: string;           // z. B. "laser"
  typeVersion: number;    // Version des Typ-Datenformats
  meta: {
    title: string;
    author?: string;
    description?: string;
    createdAt: string;    // ISO-Datum
    verified?: boolean;   // vom Ersteller gelöst
    minMoves?: number;    // vom Solver ermittelt
  };
  data: D;                // typspezifisch
};
```

## Die Plugin-Schnittstelle: `PuzzleType`

```ts
type PuzzleType<D, S, M> = {
  id: string;                       // "laser"
  version: number;                  // aktuelle typeVersion
  name: string;                     // i18n-Key
  icon: string;                     // Emoji oder SVG

  // --- Daten ---
  createDefault(): D;               // Startpunkt für den Editor
  validate(data: unknown): D;       // wirft bei ungültigen Daten (Links sind nicht vertrauenswürdig!)
  migrate?(data: unknown, fromVersion: number): unknown;

  // --- Spiellogik (rein, DOM-frei) ---
  initState(data: D): S;
  applyMove(data: D, state: S, move: M): S | null;  // null = ungültiger Zug
  isSolved(data: D, state: S): boolean;

  // --- Solver (optional, rein) ---
  solve?(data: D, limits: { maxNodes: number }): SolveResult<M>;

  // --- Darstellung ---
  renderPlay(ctx: PlayContext<D, S, M>): TemplateResult;
  renderEditor(ctx: EditorContext<D>): TemplateResult;
};

type SolveResult<M> =
  | { status: "solved"; moves: M[] }
  | { status: "unsolvable" }
  | { status: "aborted" };          // Suchlimit erreicht

type PlayContext<D, S, M> = {
  data: D; state: S;
  dispatch(move: M): void;          // Core ruft applyMove, speichert History (Undo/Redo), prüft isSolved
};

type EditorContext<D> = {
  data: D;
  update(next: D): void;            // Core speichert Undo-History des Editors
};
```

**Wichtig:** Undo/Redo, Zugzähler, Timer, „Gelöst!“-Dialog und Neustart gehören in den **Core**, nicht in die Plugins.
Ein Plugin liefert nur reine Zugfunktionen und Darstellung.

## Gemeinsame Raster-Bausteine (`core/grid.ts` und `ui/components/grid-editor.ts`)

- Richtungen als `"N" | "E" | "S" | "W"` mit `DELTA = { N: [0,-1], E: [1,0], S: [0,1], W: [-1,0] } as const` (y wächst nach unten).
- Generischer **Grid-Editor**: Rastergröße einstellen, Werkzeug-Palette, Tippen platziert, erneutes Tippen dreht, Radierer-Werkzeug.
  Plugins liefern nur ihre Palette und eine Funktion `applyTool(data, tool, x, y) → D`.

## Die MVP-Rätseltypen im Detail

### Rush Hour (`rushhour`)

```ts
type RushHourData = {
  width: number; height: number;          // Standard 6×6
  blocks: { id: string; x: number; y: number; length: number;
            axis: "h" | "v"; target?: true }[];
  exit: { side: "N" | "E" | "S" | "W"; index: number };
};
type RushHourState = { pos: number[] };   // Position jedes Blocks entlang seiner Achse
type RushHourMove = { block: number; delta: number };
```

- Genau ein Block ist `target`, und seine Achse muss zur Ausgangsseite passen.
- Gelöst, wenn der Zielblock die Kante am Ausgang berührt.
- Bedienung: Block ziehen (Pointer Capture), rastet auf Felder ein. Ein Zug ist eine zusammenhängende Verschiebung.
- Solver: Breitensuche über Zustände, liefert die minimale Zuganzahl (= Schwierigkeit).

### Laser & Spiegel (`laser`)

```ts
type LaserCell =
  | { kind: "wall" }
  | { kind: "emitter"; dir: Dir }
  | { kind: "target" }
  | { kind: "mirror"; orientation: "/" | "\\"; rotatable: boolean };
type LaserData = { width: number; height: number;
                   cells: { x: number; y: number; cell: LaserCell }[] };
type LaserState = { orientations: Record<string, "/" | "\\"> };  // Key "x,y"
type LaserMove = { x: number; y: number };                       // Spiegel umdrehen
```

- Reflexion: `/` = `{ N→E, E→N, S→W, W→S }`, `\` = `{ N→W, W→N, S→E, E→S }`.
- Strahlverfolgung ab jedem Emitter, bis Wand, Rand oder Schleife erreicht ist. Schleifen werden über ein Set besuchter `(x, y, dir)` erkannt.
- Gelöst, wenn alle Ziele getroffen sind. Der Strahlverlauf wird live als SVG-Polylinie gezeichnet.
- Solver: alle Kombinationen drehbarer Spiegel durchprobieren (2ⁿ, mit Limit), später mit Pruning.
- Erweiterungen (später): Spiegel aus einem Inventar platzieren, Strahlteiler, Farben, „Bomben“-Felder, die nicht getroffen werden dürfen.

### Quiz (`quiz`)

```ts
type QuizQuestion =
  | { kind: "single"; text: string; options: string[]; answer: string }      // answer = Hash
  | { kind: "multi";  text: string; options: string[]; answer: string }
  | { kind: "text";   text: string; answers: string[] }                     // Hashes normalisierter Antworten
  | { kind: "number"; text: string; value: number; tolerance: number };
type QuizData = { questions: QuizQuestion[]; passPercent: number };
```

- **Antworten nicht im Klartext speichern:** Da das Rätsel im Link steckt, werden Lösungen als SHA-256 gespeichert
  (`crypto.subtle`), mit einem Salt aus Titel und Fragenindex. Freitext wird vorher normalisiert
  (trimmen, Kleinschreibung, Umlaute vereinheitlichen, Mehrfach-Leerzeichen entfernen).
  Das ist kein echter Schutz, aber es verhindert das Spicken mit einem Blick in den Link.
  Zahlenfragen bleiben im Klartext (Toleranzprüfung).
- Kein Solver nötig; „verifiziert“ bedeutet, dass der Ersteller alle Fragen einmal beantwortet hat.
- Bilder erst ab Phase 2.

## Teilen per Link (`core/share.ts`)

```
PuzzleDocument → JSON.stringify → UTF-8 → CompressionStream("deflate-raw") → Base64url
URL: https://<host>/#/p/1.<code>      ("1." = Codec-Version)
```

- Beim Öffnen: dekodieren → `migrate` (falls `typeVersion` alt ist) → `validate` → spielen.
  **Alles aus Links ist untrusted:** strikte Validierung, Größenlimits (z. B. max. 100×100 Raster, max. 200 Fragen),
  keine HTML-Interpretation von Texten (lit-html escapt standardmäßig, kein `unsafeHTML` verwenden).
- Zielgröße: unter etwa 2 000 Zeichen URL, damit Messenger den Link nicht abschneiden. Der Editor zeigt die Linklänge an.
- Teilen-Button nutzt `navigator.share()` und fällt auf `navigator.clipboard.writeText()` zurück.

## Routen

| Hash | View |
|---|---|
| `#/` | Start (Typen-Auswahl, zuletzt gespielt) |
| `#/library` | eigene Rätsel (IndexedDB) |
| `#/p/<code>` | geteiltes Rätsel spielen |
| `#/new/<type>` | neues Rätsel im Editor |
| `#/edit/<localId>` | eigenes Rätsel bearbeiten |
| `#/play/<localId>` | eigenes Rätsel spielen |

## Lokale Speicherung (IndexedDB)

Die Datenbank `raetsel` enthält diese Stores:
- `puzzles` mit `{ id, doc: PuzzleDocument, updatedAt }` für eigene Rätsel.
- `progress` mit `{ key: hash(code), solved, bestMoves, lastState }` für gespielte Rätsel.

## PWA

- `manifest.webmanifest` mit Name, Icons und `display: standalone`.
- `sw.js`: Netzwerk zuerst, Cache als Fallback für App-Dateien. Geteilte Rätsel funktionieren offline,
  weil sie komplett im Link stecken.

## Phase 2: Backend (Entscheidung offen)

Kandidaten, jeweils **ohne SDK**, direkt per `fetch`:
- **Supabase:** gehostetes Postgres mit REST-API (PostgREST), Auth und Storage. Großzügiger Free-Tier.
- **PocketBase:** einzelne Binärdatei zum Selbsthosten, SQLite, Auth und REST eingebaut. Ideal für ein Hobbyprojekt mit eigenem kleinen Server.

Benötigte Funktionen: Rätsel veröffentlichen (nur verifizierte), Galerie mit Filtern (Typ, Schwierigkeit, neu, beliebt),
Likes und Bewertungen, Spielzähler, Melden-Funktion, Accounts optional (anonym spielen soll möglich bleiben).
Rechtliches für die EU beachten: Impressum, Datenschutzerklärung, DSGVO-konforme Auswahl des Anbieters bzw. Serverstandorts.
