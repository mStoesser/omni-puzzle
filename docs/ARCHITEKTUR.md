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
| Hashing | eigenes synchrones SHA-256 (`core/hash.ts`) | `crypto.subtle` ist nur asynchron; Plugins und Editoren hashen so ohne Async-Umwege. Im Test gegen `crypto.subtle` geprüft |
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
    editor-session.ts     # Editor-Session (rein): Titel, Undo/Redo, readiness (probespielen/teilen)
    document.ts           # Hülle prüfen, loadDocument: Hülle → Typ → migrate → validate
    share.ts              # encode/decode PuzzleDocument <-> URL-Code
    storage.ts            # IndexedDB-Wrapper (+ In-Memory-Variante für Tests/Fallback), Fortschritt
    grid.ts               # Richtungen, Koordinaten, Raster-Hilfen (rein)
    hash.ts               # synchrones SHA-256, Normalisierung von Freitext-Antworten
    test-fixtures.ts      # Mini-Rätseltyp „counter“ nur für Core-Tests
  ui/
    views/                # home.ts, library.ts, play.ts, editor.ts
    components/           # dialog, share-dialog, grid-editor, tap …
    styles.css
  puzzles/
    index.ts              # registriert alle Typen
    rushhour/  { index.ts, logic.ts, solver.ts, edit.ts, render.ts, editor.ts, examples.ts, *.test.ts }
    laser/     { index.ts, logic.ts, solver.ts, edit.ts, render.ts, editor.ts, examples.ts, *.test.ts }
    quiz/      { index.ts, logic.ts, edit.ts, render.ts, editor.ts, examples.ts, *.test.ts }
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
  description: string;              // i18n-Key, ein Satz für die Startseite
  icon: string;                     // Emoji oder SVG
  controls?: { undo?: boolean; moves?: boolean };  // Core-Bedienelemente abschalten (Quiz: kein Undo, kein Zugzähler)

  // --- Daten ---
  createDefault(): D;               // Startpunkt für den Editor
  validate(data: unknown): D;       // wirft bei ungültigen Daten (Links sind nicht vertrauenswürdig!)
  migrate?(data: unknown, fromVersion: number): unknown;
  parseDraft?(data: unknown): D;    // nur Struktur prüfen: Editor-Entwürfe mit Problemen laden
  problems?(data: D): string[];     // lokalisierte Fehlermeldungen für die Live-Validierung im Editor

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
- Optional ein Randring aus Zellen um das Spielfeld (x/y = −1 bzw. Breite/Höhe), z. B. für Ausgänge.
- Das gewählte Werkzeug steckt in nativen Radio-Buttons (kein App-Zustand nötig).
- Antippen = `pointerdown` + `pointerup` auf demselben Element (`ui/components/tap.ts`, auch beim Spielen genutzt);
  kein `click`, weil Touch-Browser Klicks verzögern oder verschlucken.
- `applyTool`/`resize` liegen rein und getestet in `edit.ts`; `editor.ts` enthält nur die Darstellung.
- Tastatur: Nur ein Feld ist in der Tab-Reihenfolge („roving tabindex“), Pfeiltasten bewegen den Fokus, Enter/Leertaste
  wendet das Werkzeug an. Über `describe(x, y)` sagt das Plugin Screenreadern, was auf einem Feld liegt.

### Editor-Ablauf

- Jede Änderung landet in der Undo-Historie des Editors (Core). Kurz nach der letzten Änderung läuft der Solver
  (Ergebnisse pro Datenobjekt zwischengespeichert, Undo ist also sofort geprüft).
- „Probespielen“ geht nur ohne Probleme. Wer dabei löst, verifiziert genau diesen Datenstand;
  jede weitere Änderung hebt das auf, Undo stellt es wieder her.
- Teilen nur, wenn verifiziert und der Solver das Rätsel nicht als unlösbar erkannt hat (`readiness()`).
- **Automatisches Speichern:** Ein neues Rätsel (`#/new/<typ>`) bekommt sofort eine ID, wird aber erst bei der
  ersten Änderung gespeichert; dann wird die Adresse per `replaceState` zu `#/edit/<id>`. Danach wird jede Änderung
  kurz verzögert (400 ms) gespeichert, beim Verlassen der Route oder Verstecken der Seite sofort.
  Gespeichert werden auch unfertige Entwürfe; geladen werden sie über `loadDocument(…, { draft: true })`,
  das statt `validate` die rein strukturelle Prüfung `parseDraft` nutzt. `meta.verified` und `meta.minMoves`
  werden beim Speichern aus dem aktuellen Stand abgeleitet.
- „In meine Bibliothek kopieren“ (bei Beispielen und geteilten Rätseln) legt einen neuen, unverifizierten Entwurf an.

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
- Strahlverfolgung ab jedem Emitter, bis Wand, Emitter, Rand oder Schleife erreicht ist. Schleifen werden über ein Set besuchter `(x, y, dir)` erkannt.
  Mit reinen Spiegeln kann es keine Schleife geben (die Bewegung ist umkehrbar, und der Strahl kommt nie in seinen Emitter zurück);
  die Erkennung ist ein Sicherheitsnetz für spätere Erweiterungen wie Strahlteiler.
- **Ziele lassen den Strahl durch** (wie ein Sensor), damit ein Strahl mehrere Ziele nacheinander treffen kann.
- Gelöst, wenn alle Ziele getroffen sind. Der Strahlverlauf wird live als animierte SVG-Polylinie gezeichnet
  (ohne Animation bei `prefers-reduced-motion`). Spiegel werden als „/“ gezeichnet und für „\“ um 90° gedreht, so animiert das Umklappen.
- Ein Zug klappt einen drehbaren Spiegel um; zweimal umklappen hebt sich auf. Eine Lösung ist also eine Menge umzuklappender Spiegel.
- Solver: Mengen drehbarer Spiegel nach steigender Größe durchprobieren (höchstens 2ⁿ, mit Limit); der erste Treffer
  braucht die wenigsten Züge. Später mit Pruning (nur Spiegel, die der Strahl erreicht).
- Editor: Laser, Ziel, Spiegel drehbar/fest, Wand, Radierer. Erneutes Tippen dreht Laser (im Uhrzeigersinn) und Spiegel;
  ein neuer Laser zeigt in die Richtung mit dem meisten Platz. Der Editor zeigt den Strahl der Startstellung.
- Beispielrätsel sind per Skript erzeugt: genau ein Strahlweg löst sie, die Startstellung ist um `minMoves` Spiegel verdreht.
- Erweiterungen (später): Spiegel aus einem Inventar platzieren, Strahlteiler, Farben, „Bomben“-Felder, die nicht getroffen werden dürfen.

### Quiz (`quiz`)

```ts
type QuizQuestion =
  | { kind: "single"; id: string; text: string; options: string[]; answer: string }  // answer = Hash, "" = nicht gesetzt
  | { kind: "multi";  id: string; text: string; options: string[]; answer: string }
  | { kind: "text";   id: string; text: string; answers: string[] }                  // Hashes normalisierter Antworten
  | { kind: "number"; id: string; text: string; value: number; tolerance: number };
type QuizData = { questions: QuizQuestion[]; passPercent: number };
type QuizState = { index: number; answers: (QuizAnswer | null)[]; finished: boolean };
type QuizMove = { type: "answer"; answer: QuizAnswer } | { type: "next" };
```

- **Antworten nicht im Klartext speichern:** Da das Rätsel im Link steckt, werden Lösungen gehasht
  (SHA-256, davon 128 Bit = 32 Hex-Zeichen, das hält Links kurz). Salt ist eine zufällige **Fragen-ID**
  (statt Titel und Fragenindex), damit Umbenennen und Umsortieren die Hashes nicht ungültig machen.
  Fragen-IDs dürfen deshalb nichts über die Antwort verraten.
  - Auswahlfragen: Hash über die Menge der richtigen **Options-Indizes** (`choiceHash`). Textänderungen an Optionen
    lassen die Markierung gültig; beim Löschen einer Option wird neu kodiert. Der Editor (und das Feedback nach dem Antworten)
    findet die richtigen Optionen durch Ausprobieren (höchstens 2⁸ Mengen, zwischengespeichert).
  - Freitext: Hash über die normalisierte Antwort (`normalizeAnswer`: trimmen, Kleinschreibung, ä→ae, ö→oe, ü→ue, ß→ss,
    andere Akzente entfernen, Mehrfach-Leerzeichen zusammenfassen). Nach dem Neuladen zeigt der Editor diese Antworten
    nur noch als „verdeckt“ (nur im laufenden Editor-Durchgang sind sie im Speicher lesbar).
  - Zahlenfragen bleiben im Klartext (Toleranzprüfung).
  Das ist kein echter Schutz, aber es verhindert das Spicken mit einem Blick in den Link.
- Ablauf: eine Frage pro Bildschirm mit Fortschrittsanzeige; „Antworten“ zeigt sofort richtig/falsch (bei Auswahl- und
  Zahlenfragen mit Lösung), „Weiter“ geht zur nächsten Frage, am Ende eine Auswertung. **Kein Undo** (sonst könnte man nach
  dem Feedback umentscheiden) und kein Zugzähler (`controls`).
- Gelöst = alle Fragen beantwortet und Bestehensgrenze erreicht. „Verifiziert“ heißt also: Der Ersteller hat sein Quiz bestanden.
- Kein Solver nötig.
- Editor formularbasiert (kein Raster): Fragen hinzufügen, verschieben, löschen, Fragetyp wechseln (zwischen Einfach- und
  Mehrfachauswahl bleiben Optionen erhalten). Textfelder übernehmen Änderungen bei `change` (nicht bei jedem Tastendruck),
  damit die Undo-Historie nicht pro Zeichen wächst.
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
- Teilen-Dialog: Link als markierbares Feld, Linklänge (Warnung über 2 000 Zeichen), „Link kopieren“
  (`navigator.clipboard.writeText()`, Fallback `execCommand("copy")` für unsichere Kontexte wie den Dev-Server im LAN)
  und „Teilen“ per `navigator.share()`, wenn vorhanden (nur in sicheren Kontexten, also https).
- Kaputte Links führen zu einer Fehlerseite mit verständlicher Meldung je Fehlerart (beschädigt, zu groß, neuere Version, unbekannter Typ).

## Routen

| Hash | View |
|---|---|
| `#/` | Start (Typen-Auswahl, zuletzt gespielt) |
| `#/library` | eigene Rätsel (IndexedDB) |
| `#/p/<code>` | geteiltes Rätsel spielen |
| `#/new/<type>` | neues Rätsel im Editor |
| `#/edit/<localId>` | eigenes Rätsel bearbeiten |
| `#/play/<localId>` | eigenes Rätsel oder eingebautes Beispiel spielen |
| `#/impressum` | Impressum (Angaben in `src/imprint.ts`) |

## Lokale Speicherung (IndexedDB)

Die Datenbank `raetsel` enthält diese Stores:
- `puzzles` mit `{ id, doc: PuzzleDocument, updatedAt }` für eigene Rätsel (`id` = `crypto.randomUUID()`).
- `progress` mit `{ key, solved, bestMoves }` für gespielte Rätsel.
  `key` = SHA-256 über `[type, typeVersion, data]`, also über den Inhalt statt über den Link-Code:
  Dasselbe Rätsel als Beispiel, per Link oder als Bibliothekskopie teilt sich den Fortschritt; Titeländerungen
  ändern ihn nicht, jede Änderung am Rätsel selbst schon. Einen Spielstand zum Fortsetzen (`lastState`) gibt es noch nicht.
- Ist IndexedDB nicht verfügbar (manche privaten Modi), läuft die App mit einem In-Memory-Speicher weiter.
- Auch Einträge aus IndexedDB gehen beim Öffnen durch `loadDocument` (Daten können aus älteren App-Versionen stammen).

## PWA

- `public/manifest.webmanifest` mit Name, Icons (192, 512, maskable 512, SVG) und `display: standalone`;
  `apple-touch-icon` und Meta-Tags für iOS in `index.html`. Alle Pfade relativ (`vite build --base=./`),
  damit die App auch in einem Unterordner läuft (GitHub Pages: `https://<user>.github.io/<repo>/`).
- `public/sw.js`: Netzwerk zuerst, Cache als Fallback. Beim Installieren werden App-Shell und die gebauten
  Bundles (aus `index.html` gelesen) gecacht, also funktioniert die App schon nach dem ersten Besuch offline.
  Offline-Navigation (auch geteilte Links) bekommt die App-Shell. Geteilte Rätsel funktionieren offline,
  weil sie komplett im Link stecken. Registriert wird der Service Worker nur im Produktions-Build.

## Barrierefreiheit

- Alles ist per Tastatur bedienbar, mit einem einheitlichen Fokusrahmen (`:focus-visible`, in SVG als Kontur).
- Ausparken: Tab wählt einen Block, Pfeiltasten schieben ihn (Vorschau wie beim Ziehen), Enter/Leertaste oder
  Verlassen des Blocks setzt ihn ab, Esc bricht ab. Ein Absetzen ist ein Zug, so zählt die Tastatur wie das Ziehen.
- Laser: Tab wählt einen drehbaren Spiegel, Enter/Leertaste klappt ihn um; eine Live-Region sagt an, wie viele Ziele getroffen sind.
- Spielfelder sind `role="group"` mit Bedienhinweis im Label; Spielsteine haben `role="button"` und beschreibende Labels.
- Jede Seite setzt `document.title`.
- Kontraste nach WCAG geprüft: Text mindestens 4,5:1, Bedienelemente und Spielsteine mindestens 3:1
  (eigenes Token `--control-border` für Eingabefelder).
- Animationen respektieren `prefers-reduced-motion`.

## Deployment

- `.github/workflows/deploy.yml`: bei jedem Push auf `main` testen, bauen und auf GitHub Pages veröffentlichen.
  Einmalig in GitHub einstellen: Settings → Pages → Source „GitHub Actions“.
- Der Workflow bricht ab, solange `src/imprint.ts` nicht ausgefüllt ist.

## Phase 2: Backend (Supabase)

**Entscheidung:** Supabase in der EU-Region (Frankfurt), angesprochen **ohne SDK** direkt per `fetch`
(PostgREST unter `/rest/v1`, Auth unter `/auth/v1`, Storage unter `/storage/v1`, Edge Functions unter `/functions/v1`).
Verworfen wurden PocketBase (eigener Server mit Betriebsaufwand), Cloudflare Workers + D1 (Auth und API selbst schreiben)
und Firebase (Zähler nur mit kostenpflichtigen Functions, umständlich ohne SDK, proprietär).

```
GitHub Pages (statische App) ──fetch──▶ Supabase (Frankfurt)
                                          ├─ Auth: E-Mail + Passwort
                                          ├─ Postgres + Row Level Security: profiles, puzzles, likes, ratings, reports
                                          ├─ Edge Functions (Deno): publish, delete-account
                                          └─ Storage: Quizbilder (M14)
```

### Grundsätze
- **Optional:** Ohne Konfiguration in `src/backend.ts` läuft die App wie in Phase 1. Spielen, Bauen und Teilen per Link
  brauchen nie einen Account und nie das Backend.
- **Der öffentliche Anon-Key steckt im Client**, das ist bei Supabase so vorgesehen. Sicherheit kommt ausschließlich aus
  Row Level Security und den Edge Functions. Der Service-Role-Key liegt nur in den Edge Functions.
- **Der Server vertraut dem Client nicht:** Veröffentlicht wird nur über die Edge Function `publish`. Sie führt denselben
  TypeScript-Code wie die App aus (Deno kann `.ts`-Importe und erasable Syntax direkt), also `loadDocument`, `validate`
  und den Solver. Deshalb müssen `logic.ts` und `solver.ts` DOM-frei bleiben. Rechenzeit-Limit beachten: Bei zu großen
  Suchräumen lehnt die Funktion ab, statt abzubrechen.
- **Veröffentlichte Rätsel sind unveränderlich** (nur Titel und Beschreibung lassen sich ändern). Likes, Bewertungen und Bestwerte
  beziehen sich damit immer auf genau diesen Inhalt. Der Inhaltsschlüssel (`progressKey`) ist eindeutig, sodass dasselbe
  Rätsel nicht doppelt veröffentlicht werden kann und lokaler Fortschritt automatisch passt.
- **Alles aus dem Backend ist untrusted** wie Links: Dokumente gehen durch `loadDocument`, Texte werden nie als HTML gerendert.
- **Kein Caching im Service Worker** für Backend-Anfragen; offline zeigen Community-Seiten einen Hinweis.

### Datenmodell (Entwurf)

| Tabelle | Inhalt | Schreiben durch |
|---|---|---|
| `profiles` | `id` (= Auth-User), `username` (eindeutig), `is_moderator`, `banned`, `created_at` | Nutzer (nur `username`) |
| `puzzles` | `id`, `author_id`, `type`, `type_version`, `doc` (jsonb), `content_key` (eindeutig), `title`, `description`, `min_moves`, `hidden`, `like_count`, `play_count`, `rating_sum`, `rating_count`, `report_count`, `published_at` | Edge Function `publish`; Autor nur Titel/Beschreibung/Löschen |
| `likes` | `user_id`, `puzzle_id` (Primärschlüssel aus beiden) | angemeldete Nutzer, nicht für eigene Rätsel |
| `ratings` | `user_id`, `puzzle_id`, `value` 1–5 | angemeldete Nutzer, nicht für eigene Rätsel |
| `reports` | `id`, `puzzle_id`, `reporter_id`, `reason`, `comment`, `resolved`, `created_at` | angemeldete Nutzer, eine Meldung pro Rätsel |

Zähler (`like_count`, `rating_*`, `report_count`) pflegen Trigger, sodass die Galerie ohne Aggregation sortieren kann.
Der Spielzähler wird über eine Datenbankfunktion (`register_play`) erhöht, die auch anonym aufrufbar ist.
Ab einer Meldungsschwelle setzt ein Trigger `hidden = true`.

### Neue Routen

| Hash | View |
|---|---|
| `#/gallery` | Galerie mit Filtern und Sortierung |
| `#/g/<id>` | veröffentlichtes Rätsel spielen (kurzer Teilen-Link) |
| `#/account` | Anmelden/Registrieren bzw. Kontoseite mit „Meine Veröffentlichungen“ |
| `#/moderation` | Moderationsansicht (nur Moderatoren) |
| `#/datenschutz` | Datenschutzerklärung |

### Rechtliches
Vor dem Livegang mit Backend: Datenschutzerklärung (Hosting, Supabase mit AV-Vertrag, Mailanbieter, gespeicherte Daten,
Löschung), Kontolöschung in der App und ein vollständiges Impressum. Den Text der Datenschutzerklärung muss der Betreiber
selbst verantworten.
