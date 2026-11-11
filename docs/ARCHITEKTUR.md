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
  i18n/de.ts              # alle UI-Texte (Deutsch, legt die Schlüssel fest)
  i18n/en.ts              # dieselben Schlüssel auf Englisch (M28)
  i18n/t.ts               # aktive Sprache, t(key, params) mit {platzhalter}, tn() für Mehrzahl, perLocale()
  core/
    types.ts              # PuzzleDocument, PuzzleType-Interface, Hilfstypen
    registry.ts           # Registrierung und Lookup der Rätseltypen
    store.ts              # Mini-Store
    router.ts             # Hash-Router
    session.ts            # Spiel-Session (rein): Historie, Zugfolge (path), Undo/Redo, Neustart, Zugzähler, gelöst
    timer.ts              # Spielzeit eines Versuchs (rein, Zeitstempel von außen), Anzeige m:ss (M25)
    editor-session.ts     # Editor-Session (rein): Titel, Undo/Redo, readiness (probespielen/teilen)
    document.ts           # Hülle prüfen, loadDocument: Hülle → Typ → migrate → validate
    share.ts              # encode/decode PuzzleDocument <-> URL-Code
    storage.ts            # IndexedDB-Wrapper (+ In-Memory-Variante für Tests/Fallback), Fortschritt, Sync-Markierungen
    grid.ts               # Richtungen, Koordinaten, Raster-Hilfen, Wisch-/Tastenrichtung, Linien (rein)
    search.ts             # generische Breitensuche für Solver (Rush Hour, Eis-Rutschen, Sokoban, Klotski)
    hash.ts               # synchrones SHA-256, Normalisierung von Freitext-Antworten
    test-fixtures.ts      # Mini-Rätseltyp „counter“ nur für Core-Tests
    api.ts, auth.ts, account.ts  # Backend: fetch-Wrapper, Anmeldung, Konto (ab M8/M9)
    publish.ts            # Veröffentlichen prüfen (rein, läuft auch in der Edge Function)
    published.ts          # veröffentlichte Rätsel laden, ändern, zurückziehen, Spielzähler
    images.ts             # Bilder: Grenzen, Schlüssel (SHA-256), Typprüfung, Base64
    moderation.ts         # Melden und Moderationsaktionen
    reactions.ts          # Likes und Bewertungen
    gallery.ts            # Galerie-Abfragen: Filter, Sortierung, Keyset-Pagination, Filter in der Route
    chains.ts             # Rätsel-Ketten: Laden, Fortschritt/Schlösser, Entwurf, Veröffentlichen (M24)
    scores.ts             # Ranglisten: Lösung nachspielen (auch in der Edge Function), laden, Warteschlange (M25)
    daily.ts, day.ts      # Rätsel des Tages: laden, Tagesrangliste, Serie, Planung; Kalendertage rechnen (M26)
    sync.ts               # Bibliothek und Fortschritt mit dem Konto abgleichen: Zusammenführen, Holen, Senden (M27)
    difficulty.ts         # gemeinsame Schwierigkeitsskala 1–3 (aus minMoves bzw. Bewertungen)
    puzzle-theme.ts       # Rätsel-Themes: Rollen, Prüfung, Farbrechnung, Kontrastprüfung (M29)
    theme-presets.ts      # vorgefertigte Themes (M29)
    saved-themes.ts       # eigene Theme-Vorlagen: Liste prüfen, anlegen, umbenennen, löschen (M30)
    icon-catalog.ts       # Icon-Katalog: Icon-Rollen und IDs, auch für den Server (M31)
  server/
    publish-handler.ts    # Request-Handler der Edge Function „publish“ (laufzeitneutral, mit node --test getestet)
    cleanup-handler.ts    # Request-Handler der Edge Function „cleanup-images“ (quiz-images und user-images)
    score-handler.ts      # Request-Handler der Edge Function „submit-score“ (M25)
  ui/
    views/                # home.ts, library.ts, play.ts, editor.ts, chain.ts, chain-editor.ts …
    components/           # dialog, share-dialog, grid-editor, tap, swipe …
    palette.ts            # Rollen-Paletten der Renderer: Standard-CSS und Theme als Inline-Stil (M29)
    piece-icons.ts        # Icons aus src/icons/pieces/ (Vite ?raw) für die Renderer (M31)
  icons/pieces/           # Icon-Dateien <id>.svg, selbst gezeichnet (M31)
    styles.css
  puzzles/
    index.ts              # registriert alle Typen (mit UI)
    rules.ts              # registriert die Regeln aller Typen (ohne UI, für den Server)
    rushhour/  { index.ts, rules.ts, logic.ts, solver.ts, edit.ts, render.ts, editor.ts, examples.ts, *.test.ts }
    laser/     { index.ts, rules.ts, logic.ts, solver.ts, edit.ts, render.ts, editor.ts, examples.ts, *.test.ts }
    quiz/      { index.ts, rules.ts, logic.ts, edit.ts, render.ts, editor.ts, examples.ts, *.test.ts }
    ice/       { index.ts, rules.ts, logic.ts, solver.ts, edit.ts, render.ts, editor.ts, examples.ts, *.test.ts }
    sokoban/   { index.ts, rules.ts, logic.ts, solver.ts, edit.ts, render.ts, editor.ts, examples.ts, *.test.ts }
    klotski/   { index.ts, rules.ts, logic.ts, solver.ts, edit.ts, render.ts, editor.ts, examples.ts, *.test.ts }
    lightsout/ { index.ts, rules.ts, logic.ts, solver.ts, edit.ts, render.ts, editor.ts, examples.ts, *.test.ts }
    pipes/     { index.ts, rules.ts, logic.ts, solver.ts, edit.ts, render.ts, editor.ts, examples.ts, *.test.ts }
    nonogram/  { index.ts, rules.ts, logic.ts, edit.ts, render.ts, editor.ts, examples.ts, *.test.ts }
supabase/
  migrations/             # SQL, von Hand im Dashboard angewendet
  templates/              # Mail-Vorlagen, Sprache nach user_metadata.lang (M28)
  functions/publish/      # Edge Function (Deno), importiert src/server/publish-handler.ts
  functions/cleanup-images/  # Edge Function (Deno), importiert src/server/cleanup-handler.ts
  functions/submit-score/ # Edge Function (Deno), importiert src/server/score-handler.ts
  config.toml             # nur für das Deployment der Functions
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
    lang?: "de" | "en";   // Sprache der Texte (M28); andere Werte werden wie unbekannte Felder verworfen
    theme?: { colors: Record<ThemeRole, string>;    // Farben des Spielfelds (M29); ungültig = still verworfen
              icons?: Partial<Record<IconRole, string>> };  // Icons aus dem Katalog (M31)
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
  icon: SVGTemplateResult;          // Linien-Symbol: Pfade für viewBox 24×24, Strich 2, runde Enden
  color: { dark: string; light: string };  // Typfarbe je Theme, nur für Akzente (Kachel, Badge, Fortschritt)
  controls?: { undo?: boolean; moves?: boolean };  // Core-Bedienelemente abschalten (Quiz: kein Undo, kein Zugzähler)
  themeRoles?: ThemeRole[];         // M29: Rollen, die der Renderer aus einem Theme nimmt; ohne = nicht themebar
  themeFixed?: { light: string; dark: string }[];  // M29: Farben der Regeln auf dem Brett (Laserfarben)
  themeParts?: Record<ThemeRole | "fixed", MessageKey>;  // M30: Namen der Rollen im Typ („Kisten“, „Boden“)
  iconRoles?: IconRole[];           // M31: Teile, die ein Icon aus dem Katalog zeigen können

  // --- Daten ---
  createDefault(): D;               // Startpunkt für den Editor
  validate(data: unknown): D;       // wirft bei ungültigen Daten (Links sind nicht vertrauenswürdig!)
  migrate?(data: unknown, fromVersion: number): unknown;
  minVersion?(data: D): number;     // älteste typeVersion, die diese Daten darstellen kann (seit M23)
  parseDraft?(data: unknown): D;    // nur Struktur prüfen: Editor-Entwürfe mit Problemen laden (darf Editor-Felder behalten)
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
  renderPreview?(data: D, theme: PuzzleTheme | undefined): TemplateResult;  // M32: Startstellung für Karten
};

type SolveResult<M> =
  | { status: "solved"; moves: M[] }
  | { status: "unsolvable" }
  | { status: "aborted" };          // Suchlimit erreicht

type PlayContext<D, S, M> = {
  data: D; state: S;
  dispatch(move: M): void;          // Core ruft applyMove, speichert History (Undo/Redo), prüft isSolved
  images: ImageSource;              // ab M14: url(key) → Adresse, "loading" oder null (nicht verfügbar)
  theme?: PuzzleTheme;              // ab M29: Theme des Rätsels, undefined = Standardfarben (auch im EditorContext)
};

type EditorContext<D> = {
  data: D;
  update(next: D, group?: number): void;  // Core speichert Undo-History; gleiche group (ein Mal-Strich) = ein Undo-Schritt
  images: ImageSource & { add(file: Blob): Promise<string> };  // ab M14: Bild verkleinern, speichern, Schlüssel liefern
};
```

Seit M10 ist die Schnittstelle zweigeteilt: `PuzzleRules<D, S, M>` enthält `id`, `version` und alle Daten-, Spiel- und
Solver-Funktionen (also alles oben ohne Texte, `controls`, `problems` und Darstellung). Jeder Typ exportiert sie aus
`rules.ts` (dazu optional `levels`: Zuggrenzen für leicht/mittel/schwer), `index.ts` ergänzt UI und Texte (`{ ...rules, name, …, renderPlay }`). So kann die Edge Function die Regeln
importieren, ohne lit-html oder das DOM zu laden. `src/puzzles/rules.test.ts` prüft, dass beide Registrierungen übereinstimmen.

**Editor-Felder:** `parseDraft` darf Felder behalten, die nur der Editor braucht (z. B. das Bild hinter den Hinweisen eines
Nonogramms), `validate` gibt nur zurück, was zum Spielen nötig ist. Teilen und Veröffentlichen schicken deshalb das geprüfte
Dokument (`shareableDocument` in `core/document.ts` = `loadDocument(…).doc`), nie den rohen Entwurf. Gespielt wird ohnehin
immer das Ergebnis von `loadDocument`, also hängt auch der Fortschrittsschlüssel nicht an Editor-Feldern. (Seit M22.)

**Versionen und Inhaltsschlüssel:** Der Fortschrittsschlüssel (`progressKey`, in der Galerie `content_key`) hasht `type`,
`typeVersion` und `data`. Damit eine neue `typeVersion`, die alte Daten unverändert lässt, nicht alle Schlüssel ändert
(Fortschritt und „gelöst“-Markierung weg, Duplikate wieder veröffentlichbar), stempelt `loadDocument` das Dokument mit
`minVersion(data)`: der ältesten Version, die diese Daten darstellen kann. Ein Laser-Rätsel ohne Erweiterungen bleibt so
Version 1, auch in Teilen-Links und in der Galerie, und öffnet sich weiter in älteren App-Versionen. Voraussetzung:
`validate` gibt alte Daten Byte für Byte gleich zurück (neue optionale Felder fehlen, statt mit Standardwert dazustehen).
Ohne `minVersion` gilt die aktuelle `version` (so beim Quiz, dessen Schlüssel sich mit Version 2 einmal geändert haben).
(Seit M23, eine bewusste Core-Änderung.)

**Wichtig:** Undo/Redo, Zugzähler, Timer, „Gelöst!“-Dialog und Neustart gehören in den **Core**, nicht in die Plugins.
Ein Plugin liefert nur reine Zugfunktionen und Darstellung.

## Gemeinsame Raster-Bausteine (`core/grid.ts` und `ui/components/grid-editor.ts`)

- Richtungen als `"N" | "E" | "S" | "W"` mit `DELTA = { N: [0,-1], E: [1,0], S: [0,1], W: [-1,0] } as const` (y wächst nach unten).
- Generischer **Grid-Editor**: Rastergröße einstellen, Werkzeug-Palette, Tippen platziert, erneutes Tippen dreht, Radierer-Werkzeug.
  Plugins liefern nur ihre Palette und eine Funktion `applyTool(data, tool, x, y) → D`.
- Optional ein Randring aus Zellen um das Spielfeld (x/y = −1 bzw. Breite/Höhe), z. B. für Ausgänge.
- Das gewählte Werkzeug steckt in nativen Radio-Buttons (kein App-Zustand nötig).
- **Malen durch Ziehen** (seit M16): Werkzeuge mit `paint: true` in der Palette (z. B. Wand, Radierer) wirken schon beim
  Drücken und dann auf jedes Feld, über das der Finger zieht. Lücken zwischen zwei Pointer-Events füllt `lineCells`,
  jedes Feld zählt einmal pro Strich, der Rand nimmt keine Farbe an. Das Plugin bekommt die Felder über `onPaint(tool,
  cells, group)` und gibt `group` an `ctx.update` weiter: Der Core ersetzt dann den neuesten Verlaufseintrag, statt einen
  neuen anzulegen (`updateData` in `editor-session.ts`), sodass ein Strich ein Undo-Schritt ist. Undo/Redo beendet eine Gruppe.
  Per Tastatur (Enter) wirken auch Mal-Werkzeuge über `onTap` auf ein einzelnes Feld.
- Antippen = `pointerdown` + `pointerup` auf demselben Element (`ui/components/tap.ts`, auch beim Spielen genutzt);
  kein `click`, weil Touch-Browser Klicks verzögern oder verschlucken.
- `applyTool`/`resize` liegen rein und getestet in `edit.ts`; `editor.ts` enthält nur die Darstellung.
- Tastatur: Nur ein Feld ist in der Tab-Reihenfolge („roving tabindex“), Pfeiltasten bewegen den Fokus, Enter/Leertaste
  wendet das Werkzeug an. Über `describe(x, y)` sagt das Plugin Screenreadern, was auf einem Feld liegt.

### Spielfiguren steuern (`ui/components/swipe.ts`, seit M16)

Für Typen mit einer Figur (Eis-Rutschen, Sokoban): `swipeStart`/`swipeEnd`/`swipeCancel` auf dem Spielfeld liefern die
Wischrichtung (dominante Achse, mindestens 24 px; kürzer liefert `"tap"`, z. B. um auf ein Feld zu tippen, siehe Eis-Rutschen und Sokoban), `directionKey` übersetzt Pfeiltasten und WASD
(Tastenkombinationen wie Strg+Z bleiben frei) und `directionPad` zeigt vier 44-px-Knöpfe als Alternative. Die reine
Logik dazu (`swipeDir`, `keyDir`) liegt getestet in `core/grid.ts`.

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
type Color = "red" | "green" | "blue";
type LaserCell =
  | { kind: "wall" }
  | { kind: "emitter"; dir: Dir; color?: Color }      // ohne Farbe: rot (Rot wird nie gespeichert)
  | { kind: "target"; color?: Color }                 // ohne Farbe: jeder Strahl
  | { kind: "mirror"; orientation: "/" | "\\"; rotatable: boolean }
  | { kind: "splitter"; orientation: "/" | "\\"; rotatable: boolean }  // seit Version 3
  | { kind: "filter"; color: Color };                 // seit Version 4
type LaserData = { width: number; height: number;
                   cells: { x: number; y: number; cell: LaserCell }[];
                   inventory?: number };                // 1–3 Spiegel zum Setzen, seit Version 2
type LaserState = { orientations: Record<string, "/" | "\\">;  // drehbare Spiegel und Teiler, Key "x,y"
                    placed: Record<string, "/" | "\\"> };      // gesetzte Inventar-Spiegel
type LaserMove = { x: number; y: number };                       // ein Antippen
```

- **Versionen:** 1 Spiegel, Wände, Ziele, rote Laser; 2 Inventar; 3 Strahlteiler; 4 Farben. Jede Version liest die älteren
  Daten unverändert (`migrate` gibt sie durch), und `minVersion` liefert die älteste Version, die ein Rätsel darstellen kann.
  Optionale Felder fehlen, statt mit Standardwert dazustehen (`inventory: 0` und `color: "red"` werden beim Prüfen entfernt),
  damit gleiche Rätsel gleich aussehen und alte Inhaltsschlüssel bleiben (siehe „Versionen und Inhaltsschlüssel“).
- Reflexion: `/` = `{ N→E, E→N, S→W, W→S }`, `\` = `{ N→W, W→N, S→E, E→S }`. Ein **Teiler** lässt den Strahl weiterlaufen
  und erzeugt zusätzlich den gespiegelten Strahl.
- **Strahlverfolgung** (`traceBoard` auf einem kompakten `Board` mit einem Code pro Feld): Laser nacheinander, der gespiegelte
  Teil eines Teilers kommt nach dem aktuellen Strahl dran. Ein Strahl endet am Rand, an Wand, Laser oder einem Filter anderer
  Farbe, oder wenn er ein Feld in einer Richtung und Farbe betritt, die schon verfolgt wurde (Schleife oder Einmündung).
  Die Verfolgung liest ein Feld erst, wenn ein Strahl es betritt, und liefert die Felder in der Reihenfolge des ersten
  Betretens (`order`). Eine Änderung an einem Feld ändert also nur, was danach kommt; darauf baut der Solver.
- **Ziele lassen den Strahl durch** (wie ein Sensor). Ein Ziel mit Farbe leuchtet nur bei einem Strahl dieser Farbe.
  Gelöst, wenn alle Ziele getroffen sind. Strahlen werden als animierte SVG-Polylinien gezeichnet (ohne Animation bei
  `prefers-reduced-motion`). Spiegel werden als „/“ gezeichnet und für „\“ um 90° gedreht, so animiert das Umklappen;
  Teiler gestrichelt, gesetzte Spiegel mit gestrichelter Basis.
- **Farben** sind zusätzlich durch Symbole erkennbar (Rot ▲, Grün ■, Blau ◆ auf Laser, Ziel und Filter) und grüne bzw. blaue
  Strahlen durch ein eigenes Strichmuster. Symbole erscheinen nur in Rätseln mit Farben, alte Rätsel sehen aus wie vorher.
- **Züge:** Antippen klappt einen drehbaren Spiegel oder Teiler um. Mit Inventar setzt Antippen eines leeren Feldes einen
  Spiegel „/“, nochmal klappt ihn auf „\“, ein drittes Mal nimmt ihn zurück; ist der Vorrat leer, ist es kein Zug.
- **Solver:** iterative Vertiefung über die Zahl der Antipper. Eine Änderung ist: drehbares Teil umklappen (1), Spiegel „/“
  setzen (1) oder „\“ setzen (2). Eine kürzeste Lösung ändert nur Felder, die ein Strahl betritt (sonst wäre sie ohne diese
  Änderung kürzer). Die Suche wählt Änderungen daher nur aus `order` und nur hinter der vorigen Änderung; so entsteht jede
  Menge von Änderungen genau einmal. Jede Verfolgung zählt als ein Knoten. Gegen Brute Force auf zufälligen 4×4-Brettern getestet.
- **Bedienung:** Ohne Inventar sind nur drehbare Teile antippbar und per Tab erreichbar. Mit Inventar ist jedes Feld antippbar,
  die Tastatur nutzt einen roving tabindex (Pfeiltasten, Enter); der Vorrat steht als Zeile über dem Spielfeld.
- **Editor:** Palette in Gruppen (Grundlagen: Laser, Ziel, Spiegel drehbar/fest, Wand, Radierer; Teiler: drehbar/fest;
  Farben: Filter, „Farbe“). Erneutes Tippen mit demselben Werkzeug dreht Laser (im Uhrzeigersinn), Spiegel und Teiler und
  färbt Filter um; „Farbe“ färbt Laser und Filter rot → grün → blau, Ziele jede → rot → grün → blau. Die Zahl der Spiegel zum
  Setzen steht unter „Einstellungen“. Ein neuer Laser zeigt in die Richtung mit dem meisten Platz. Der Editor zeigt den Strahl
  der Startstellung. Problem „Ziel in einer Farbe, die kein Laser hat“.
- **Beispielrätsel** sind per Skript erzeugt: Lösungsstellung bauen, Ziele auf den Strahl legen, Teile verdrehen. Je
  Erweiterung ein Beispiel, das ohne sie unlösbar bzw. deutlich leichter ist.
- Erweiterungen (später): Portale, „Bomben“-Felder, die nicht getroffen werden dürfen.

### Eis-Rutschen (`ice`, seit M17)

```ts
type IceCell = { x: number; y: number; kind: "wall" | "sand" | "goal" | "start" };
type IceData = { width: number; height: number; cells: IceCell[] };  // 3–14 Felder je Seite, leeres Eis nicht gelistet
type IceState = { x: number; y: number };                            // Position der Figur
type IceMove = "N" | "E" | "S" | "W";                                 // ein Rutschen
```

- Die Figur rutscht, bis ein Fels oder der Rand sie stoppt; auf **Sand** bleibt sie auf dem Sandfeld stehen und kann von dort
  weiterrutschen. Ein Zug, bei dem sie sich nicht bewegt (Fels oder Rand direkt davor), ist ungültig und zählt nicht.
- **Gelöst**, wenn die Figur auf einem Ziel **stehen bleibt**; darüberrutschen zählt nicht. Mehrere Ziele sind erlaubt,
  eines reicht. Genau ein Start, mindestens ein Ziel.
- Solver: Breitensuche über die Position (`core/search.ts`), höchstens 196 Zustände, also auch serverseitig sofort fertig.
  Stufen: bis 4 Züge leicht, bis 9 mittel.
- Bedienung: Wischen, Tippen auf ein Feld in derselben Reihe oder Spalte (rutscht in diese Richtung), Pfeiltasten/WASD auf
  dem fokussierten Spielfeld, Richtungsknöpfe darunter. Die Figur ist eine Gruppe mit CSS-`transform`, so animiert das
  Rutschen (ohne bei `prefers-reduced-motion`). Eine Live-Region sagt Position, Sand und Ziel an.
- Editor: Fels, Sand und Radierer lassen sich ziehen; Start (versetzt den einzigen Start) und Ziel per Tippen.
  Die Figur zeigt im Editor den Start.
- Beispiele sind per Skript erzeugt: Zufallsbretter mit genau dieser minimalen Zugzahl, ausgewählt nach vielen erreichbaren
  Positionen und Sackgassen.

### Sokoban (`sokoban`, seit M18)

```ts
type SokobanData = { rows: string[] };  // XSB-Format: "#" Wand, " " Boden, "." Ziel, "$" Kiste, "*" Kiste auf Ziel,
                                        // "@" Figur, "+" Figur auf Ziel; 3–20 Felder je Seite, alle Zeilen gleich lang
type SokobanState = { player: number; boxes: readonly number[] };  // Zellindizes y · Breite + x
type SokobanMove = "N" | "E" | "S" | "W";                         // ein Schritt; Schieben ist auch ein Schritt
```

- Das XSB-Textformat ist unter Sokoban-Programmen verbreitet und hält Links kurz (etwa 230 Zeichen für die Beispiele).
- Genau eine Figur, mindestens eine Kiste und gleich viele Ziele wie Kisten. Gelöst, wenn alle Kisten auf Zielen stehen.
- Die Kisten behalten im Zustand ihre Reihenfolge, damit jede Kiste dasselbe SVG-Element bleibt und animiert verschoben wird;
  nur der Solver vergleicht sie als Menge.
- **Solver:** Breitensuche nach Schritten über (Figur, Kisten), Kisten sortiert im Schlüssel. Pruning über **tote Felder**
  (`liveCells`: Felder, von denen eine Kiste nie mehr auf ein Ziel kommt, berechnet durch „Ziehen“ von jedem Ziel aus);
  ein Test vergleicht mit einer Suche ohne Pruning. Große, offene Lager brechen ab (im Editor nach etwa 0,5 s am Desktop);
  dann wird ohne `minMoves` veröffentlicht, und die Stufe kommt aus Bewertungen. Stufen: bis 20 Schritte leicht, bis 50 mittel.
- **Bedienung:** Wischen, Pfeiltasten/WASD, Richtungsknöpfe; Tippen auf ein erreichbares Feld läuft dorthin (`walkPath`,
  ohne zu schieben). Die Schritte werden einzeln im Abstand von 90 ms ausgeführt, zählen also einzeln und lassen sich einzeln
  zurücknehmen. Der Lauf stoppt bei jeder anderen Eingabe und sobald die Figur nicht dort steht, wo der nächste Schritt sie
  erwartet (Undo, Neustart, anderes Rätsel). Tippen auf eine Kiste direkt neben der Figur schiebt sie.
- Boden außerhalb der Mauern (für die Figur nicht erreichbar) wird blass gezeichnet.
- **Editor:** Wand und Radierer ziehend; Kiste, Ziel und Figur per Tippen. Kiste und Ziel auf einem Feld ergeben „Kiste auf
  Ziel“, die Figur gibt es nur einmal. Beim Vergrößern kommt Boden dazu.
- Beispiele sind per Skript erzeugt (Zufallsräume, gelöst innerhalb des Server-Limits, ausgewählt nach vielen Schüben).

### Klotski (`klotski`, seit M19)

```ts
type Block = { id: string; x: number; y: number; w: number; h: number; target?: true };  // w, h: 1 oder 2
type KlotskiData = { width: number; height: number; blocks: Block[];                     // 3–10 Felder je Seite
                     exit: { side: "N" | "E" | "S" | "W"; index: number } };             // Startfeld des Ausgangs
type KlotskiState = { pos: readonly number[] };      // linkes oberes Feld jedes Blocks als y · Breite + x
type KlotskiMove = { block: number; x: number; y: number };  // Block an diese Stelle schieben
```

- Eigenes Modul: Teile von Rush Hour (Ausgang im Randring, Blöcke, Ziehen, Tastatur) sind bewusst kopiert und angepasst.
- Der Ausgang ist so breit wie der Zielblock entlang der Seite (2×2: zwei Felder); er hat keine eigene Breite.
  Gelöst, wenn der Zielblock die Kante am Ausgang berührt und mit ihm bündig steht. Genau ein Zielblock.
- **Ein Zug** schiebt einen Block beliebig weit über freie Felder, auch um Ecken (klassische Zählweise). `reachable`
  sucht alle erreichbaren Positionen eines Blocks per Breitensuche in Einzelschritten.
- **Solver:** Breitensuche über `core/search.ts`. Gleich große Blöcke sind austauschbar: Der Zustandsschlüssel listet je
  Größe die sortierten Positionen (der Zielblock ist eine eigene Gruppe). Huarong Dao (81 Züge) braucht so etwa 24 000
  Zustände und 0,2 s, passt also ins Server-Limit. Stufen: bis 12 Züge leicht, bis 35 mittel.
- **Bedienung:** Ziehen mit Pointer Capture. Der Klotz springt auf die erreichbare Position, die dem Finger am nächsten ist,
  und gleitet bis zu einem halben Feld zur nächsten erreichbaren, so lässt er sich um Ecken führen; Loslassen ist ein Zug.
  Tastatur wie bei Rush Hour: Tab wählt einen Klotz, Pfeiltasten schieben ihn feldweise über freie Felder (Vorschau),
  Enter/Leertaste oder Verlassen setzt ab, Esc bricht ab. Klötze sind Gruppen mit CSS-`transform`, Absetzen und Undo
  animieren (ohne bei `prefers-reduced-motion`).
- **Editor:** Klötze 1×1, 2×1, 1×2, 2×2, roter Block, Ausgang (im Randring) und Radierer (ziehend). Ein Größen-Werkzeug auf
  einem Klotz ändert dessen Größe; ein neuer Klotz, der am getippten Feld nicht passt, wird nach links/oben versetzt.
  Der rote Block wird auf einem freien Feld so groß wie möglich (2×2 zuerst). Passt der Ausgang nach einer Änderung am
  Zielblock oder am Brett nicht mehr, rückt er zurück.
- Beispiele: drei per Skript erzeugt (Zufallsbretter mit zwei bis sechs freien Feldern, ausgewählt nach Zugzahl), dazu der
  traditionelle Aufbau Huarong Dao.

### Lights Out (`lightsout`, seit M20)

```ts
type LightsOutData = { rows: string[] };          // "." Licht aus, "*" Licht an, "#" Loch; 3–10 Felder je Seite
type LightsOutState = { on: readonly boolean[] }; // je Zelle (y · Breite + x), Löcher immer false
type LightsOutMove = { x: number; y: number };    // ein Feld antippen
```

- Ein Tipp schaltet das Feld und seine bis zu vier Nachbarn um (nicht über Löcher und den Rand). Gelöst, wenn alle Lichter
  aus sind. Mindestens ein Feld; ein Muster ohne Lichter meldet nur der Editor („schon gelöst“).
- **Solver:** Die Reihenfolge der Tipps ist egal und zweimal tippen hebt sich auf, eine Lösung ist also eine Menge x mit
  A·x = b über GF(2). Gauß-Elimination (Bitsets mit 32 Feldern pro Wort) findet eine Lösung oder beweist, dass es keine gibt.
  Alle Lösungen unterscheiden sich um Vektoren des Nullraums; die 2^k Kombinationen der k Basisvektoren werden per Gray-Code
  durchprobiert (ein XOR pro Schritt), die mit den wenigsten Tipps gewinnt. 2^k zählt als Knotenzahl: Ist sie größer als das
  Limit, bricht der Solver ab. Rechteckige Bretter bis 10×10 haben höchstens k = 8 (9×9). Stufen: bis 4 Tipps leicht, bis 9 mittel.
- **Bedienung:** Antippen (`ui/components/tap.ts`); Tastatur per roving tabindex: Pfeiltasten springen zum nächsten Feld
  in dieser Richtung und überspringen Löcher, Enter/Leertaste schaltet. Eine Live-Region sagt, wie viele Lichter noch an sind.
  Umschalten ist per CSS-Übergang animiert (ohne bei `prefers-reduced-motion`). Lichter heben sich durch Helligkeit,
  Glühen und einen hellen Punkt ab.
- **Editor:** „Rückwärts tippen“ wendet einen Spielzug auf das Muster an; nur so gebaute Rätsel sind immer lösbar.
  „Licht“ schaltet ein einzelnes Licht (auf einem Loch entsteht ein Feld), dann prüft der Solver. „Loch“ und Radierer
  (Feld mit Licht aus) formen das Brett; Licht, Loch und Radierer wirken ziehend. Löcher sind im Editor gestrichelt umrandet.
- Beispiele sind per Skript erzeugt: zufällig rückwärts getippt auf vorgegebenen Formen, ausgewählt nach Zahl der Tipps
  und vielen Lichtern.

### Rohre (`pipes`, seit M21)

```ts
type PipesData = {
  rows: string[];                  // je Zelle eine Hex-Ziffer: Rohrenden N = 1, E = 2, S = 4, W = 8 (Startdrehung); 0 = leer
  source: { x: number; y: number };
  fixed: number[];                 // Zellindizes (y · Breite + x) fester Kacheln, aufsteigend
};
type PipesState = { turns: readonly number[] };  // Vierteldrehungen je Zelle (Zahl der Tipps; die Form zählt modulo 4)
type PipesMove = { x: number; y: number };       // eine Kachel im Uhrzeigersinn drehen
```

- Die Form folgt aus der Maske: Ende (1 Ende), Gerade, Kurve, T, Kreuz. Kreuze und leere Felder drehen nicht.
  Der Zustand zählt die Drehungen ungekürzt, damit die Animation immer im Uhrzeigersinn läuft.
- **Gelöst**, wenn jedes Rohrende auf ein Rohrende der Nachbarkachel trifft (keines zeigt auf den Rand oder ins Leere)
  und alle Kacheln mit der Quelle verbunden sind. Schleifen sind erlaubt.
- **Solver:** Backtracking über die Drehung jeder Kachel. Der Wertebereich einer Zelle ist die Menge der Masken, die sie noch
  annehmen kann (16-Bit-Menge). Propagation: Nachbarn müssen sich über das Rohrende zwischen ihnen einig sein, am Rand ist
  keines erlaubt. Verzweigt wird auf der Zelle mit den wenigsten Masken, billigste Drehung zuerst. Ein Knoten fällt weg, wenn
  die Summe der billigsten Drehungen das bisher beste Ergebnis nicht schlagen kann (Branch & Bound) oder ein Rohr die Quelle
  nicht mehr erreichen kann. Kosten je Kachel = Vierteldrehungen im Uhrzeigersinn (0–3), also ergibt sich die minimale
  Zahl an Tipps. Zufällige 10×10-Netze, auch mit vielen Schleifen, brauchen nur Millisekunden.
  Stufen: bis 12 Drehungen leicht, bis 30 mittel.
- **Bedienung:** Antippen dreht (`ui/components/tap.ts`), per CSS animiert. Verbundene Rohre füllen sich mit Wasser,
  gestaffelt nach dem Abstand zur Quelle (`transition-delay`), abgetrennte leeren sich sofort; ohne Animation bei
  `prefers-reduced-motion`. Feste Kacheln haben Nieten. Tastatur per roving tabindex wie bei Lights Out
  (leere Felder werden übersprungen); eine Live-Region sagt, wie viele Rohre verbunden sind.
- **Editor:** Mit „Rohr“ zieht man von Feld zu Feld; zwischen aufeinanderfolgenden Nachbarfeldern entsteht ein Rohr
  (`drawPath`, die Formen ergeben sich daraus). Weil ein Strich in mehreren `onPaint`-Aufrufen ankommt, merkt sich der
  Editor die letzte Zelle des Strichs. Per Tastatur verbindet Enter auf zwei Nachbarfeldern nacheinander. Weitere Werkzeuge:
  Quelle, Drehen (eine Kachel), Fest, Radierer (entfernt auch die Rohrenden der Nachbarn, die hineinführen). Der Knopf
  „Verdrehen“ dreht alle drehbaren Kacheln zufällig. Gebaut wird also in gelöster Stellung, dann gemischt.
- Beispiele sind per Skript erzeugt: von der Quelle aus gewachsene Zufallsnetze (eines mit Schleife, zwei mit festen Kacheln),
  zufällig verdreht, ausgewählt nach Zahl der Drehungen.

### Nonogramm (`nonogram`, seit M22)

```ts
type NonogramData = {
  width: number; height: number;   // 3–15
  rows: number[][]; cols: number[][];  // Hinweise: Längen der gefüllten Blöcke je Zeile bzw. Spalte, [] = leer
  image?: string[];                // nur in Entwürfen: das gemalte Bild ("#"/"."); validate lässt es weg
};
type NonogramState = { cells: string };              // je Zelle "." offen, "#" gefüllt, "x" gekreuzt
type NonogramMove = { cells: number[]; mark: "#" | "x" | "." };  // ein Strich über eine Zeile oder Spalte
```

- **Nur die Hinweise** stecken im Link. Gelöst ist, wenn jede Zeile und Spalte genau ihre Hinweise zeigt (Kreuze zählen als leer).
- **Analyse** (`analyze`, Teil von `validate`): Ein Zeilenlöser bestimmt, welche Zellen alle Platzierungen eines Hinweises
  gemeinsam haben. Der Hinweis ist dabei ein kleiner Automat (Lückenzustand vor jedem Block, ein Zustand je Blockzelle);
  vorwärts und rückwärts erreichbare Zustände (Bitmasken, höchstens 17 Zustände) zeigen, welche Werte eine Zelle annehmen
  kann. Zeilen und Spalten werden bis zum Stillstand propagiert; bleibt etwas offen, wird geraten (Zelle mit den wenigsten
  offenen Nachbarn in Zeile und Spalte) und weitergesucht, bis zwei Lösungen gefunden sind oder 2 000 Rateschritte erreicht
  sind. Ergebnis: eindeutig (mit „geraten ja/nein“), mehrdeutig (mit zwei Lösungen), unlösbar oder abgebrochen.
  `validate` verlangt „eindeutig“; die Grenze ist fest, also urteilen Editor, App und Server gleich. Pro Datenobjekt gecacht.
- Kein `solve` und keine `levels`: Es gibt keinen Zugzähler (`controls.moves: false`), die Stufe kommt aus Bewertungen.
- **Bedienung:** Modus „Füllen“/„Kreuzen“ als native Radiobuttons (kein Neuzeichnen nötig). Das erste Feld eines Strichs
  entscheidet: Hat es schon die Markierung des Modus, wird geleert, sonst markiert. Der Strich rastet auf die Zeile oder
  Spalte ein, in der er das erste Feld verlässt; Vorschau per `data-preview`, beim Loslassen ein Zug (ein Undo-Schritt).
  Erfüllte Hinweise werden grau. Nach dem Lösen verschwinden Kreuze und Linien, das Bild erscheint in der Typfarbe.
  Tastatur per roving tabindex; das Label jeder Zelle nennt auch die Hinweise ihrer Zeile und Spalte.
- **Layout und Zoom:** Hinweise oben und links sind eigene SVGs in einem CSS-Grid, die Hinweiszellen sind schmaler als
  Spielfelder. Ohne Zoom passt sich die Zellgröße per Container-Query der Breite an, mit dem Zoom-Knopf (Checkbox, `:has`)
  sind es 44 px. Der Bereich scrollt dann, die Hinweise bleiben stehen (`position: sticky`) und lassen sich per Wischen
  scrollen (`touch-action: pan-x pan-y`), auf dem Raster malt der Finger.
- **Editor:** Malen und Radierer ziehend im Grid-Editor, die Hinweise folgen jeder Änderung (`fromImage`). Bei Mehrdeutigkeit
  markiert der Editor die Felder, in denen zwei Lösungen abweichen. Ein Rätsel ohne Bild (Kopie aus einem Link) bekommt
  sein Bild aus der eindeutigen Lösung zurück (`editorImage`). Die aufklappbare Vorschau zeigt die Hinweise neben dem Bild;
  sie ist nur zum Ansehen, ihre SVGs lassen Wischgesten durch (`touch-action: auto`), damit die Seite darüber scrollt.
- Beispiele sind selbst gezeichnete Pixelbilder; der Test prüft Eindeutigkeit und dass kein Bild in den Daten steckt.

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
- Bilder erst ab Phase 2 (M14, siehe „Bilder in Quizfragen“).

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
  Bei „neuere Version“ und „unbekannter Typ“ hilft eine neuere App, deshalb bietet die Seite „Neu laden“ an (offline mit dem
  Hinweis, dass dafür Internet nötig ist). Weil der Service Worker zuerst das Netz fragt, holt ein Neuladen die neueste
  Version. Das betrifft vor allem PWAs, die schon vor einem Deployment im Hintergrund offen waren.

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
| `#/datenschutz` | Datenschutzerklärung (Einstellungen in `src/privacy.ts`, Texte in `src/i18n/de.ts` und `en.ts`) |

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
- Der Workflow bricht ab, solange `src/imprint.ts` nicht ausgefüllt oder die Datenschutzerklärung nicht freigegeben ist
  (`scripts/check-legal.ts`; mit Backend in `.env.production` muss zusätzlich der Mailanbieter eingetragen sein).
- `.github/workflows/keep-alive.yml` fragt alle drei Tage jedes konfigurierte Supabase-Projekt ab, damit es nicht pausiert.
  GitHub deaktiviert geplante Workflows nach 60 Tagen ohne Aktivität im Repository; dann muss man sie neu aktivieren.

## Phase 2: Backend (Supabase)

**Entscheidung:** Supabase in der EU-Region (Frankfurt), angesprochen **ohne SDK** direkt per `fetch`
(PostgREST unter `/rest/v1`, Auth unter `/auth/v1`, Storage unter `/storage/v1`, Edge Functions unter `/functions/v1`).
Verworfen wurden PocketBase (eigener Server mit Betriebsaufwand), Cloudflare Workers + D1 (Auth und API selbst schreiben)
und Firebase (Zähler nur mit kostenpflichtigen Functions, umständlich ohne SDK, proprietär).

```
GitHub Pages (statische App) ──fetch──▶ Supabase (Frankfurt)
                                          ├─ Auth: E-Mail + Passwort
                                          ├─ Postgres + Row Level Security: profiles, puzzles, chains, likes, ratings, reports
                                          ├─ Edge Function (Deno): publish
                                          └─ Storage: Quizbilder (M14)
```

### Konfiguration und API-Zugriff
- `src/backend.ts` liest `VITE_SUPABASE_URL` und `VITE_SUPABASE_KEY` aus `.env.development` (Dev-Server, Projekt `dev`)
  bzw. `.env.production` (Build, Projekt `prod`). Beide Dateien sind eingecheckt, denn URL und Publishable Key sind öffentlich.
  Lokale Abweichungen gehören in `.env.*.local` (ignoriert).
- `core/api.ts` (`createApi`) kapselt `fetch`: Der Key steht nur im Header `apikey`; `Authorization: Bearer` trägt nur das
  Token eines angemeldeten Nutzers. Fehler werden zu `ApiError` mit einer Art (`offline`, `timeout`, `unauthorized`, `forbidden`,
  `not-found`, `conflict`, `rate-limited`, `invalid`, `server`), `apiErrorText` liefert den deutschen Text dazu.
- Migrationen liegen in `supabase/migrations/` und werden von Hand im SQL-Editor angewendet, erst auf `dev`, dann auf `prod`.
  Supabase gibt neuen Tabellen standardmäßig alle Rechte für `anon` und `authenticated`; jede Migration entzieht sie und
  vergibt nur die nötigen Rechte (bis auf Spaltenebene, z. B. darf ein Autor nur Titel und Beschreibung ändern).

### Accounts (M9)
- `core/auth.ts` (`createAuth`) spricht GoTrue unter `/auth/v1` an: Registrieren (Anzeigename als `data.username`, daraus legt
  der Trigger `handle_new_user` das Profil an; ohne Namen, z. B. bei einer Einladung aus dem Dashboard, heißt es
  `spieler_<12 Zeichen der ID>`, siehe `0003_default_username.sql`), Anmelden per Passwort, Abmelden, Passwort vergessen/ändern.
- Die Sitzung (Access- und Refresh-Token, Ablaufzeit, Nutzer) liegt im `localStorage` unter `raetsel-session`.
  `accessToken()` erneuert das Token 60 s vor Ablauf; parallele Anfragen teilen sich eine Erneuerung. Lehnt der Server den
  Refresh-Token ab, ist man abgemeldet; bei Netzfehlern bleibt die Sitzung erhalten. Andere Tabs übernehmen Änderungen über
  das `storage`-Event.
- **Mail-Links:** Bestätigungs- und Reset-Mails führen per `redirect_to` zurück auf die App-Adresse, die Tokens stehen im
  Fragment (`#access_token=…&type=signup|recovery` bzw. `#error=…&error_code=otp_expired`). `main.ts` wertet das Fragment
  **vor** dem Start des Hash-Routers aus und ersetzt es durch `#/account` (bei `recovery` mit dem Formular „Neues Passwort“).
- `core/account.ts`: Profil laden, Anzeigename prüfen (`username_available`, gleiche Regel wie der Check-Constraint) und ändern,
  Konto löschen, deutsche Fehlertexte für Auth-Fehlercodes.
- **Konto löschen** läuft über die Datenbankfunktion `delete_account()` (security definer, Migration `0002_accounts.sql`),
  nicht über eine Edge Function: Sie löscht `auth.users` für `auth.uid()`, Profil, Rätsel, Likes, Bewertungen und Meldungen
  folgen per `on delete cascade`. So braucht es keinen Service-Role-Key.
- Mails verschickt in `prod` Brevo per SMTP (`smtp-relay.brevo.com:587`, Absender-Domain `stits.dev`); in `dev` ist die
  Bestätigung aus. Microsoft 365 wurde verworfen: Die SMTP-Anmeldung per Passwort ist dort meist gesperrt und wird abgeschafft.

### Veröffentlichen (M10)
```
Editor ──POST /functions/v1/publish {doc, title, description} + Nutzer-Token──▶ Edge Function „publish“
  1. Token prüfen: GET /auth/v1/user
  2. preparePublication (src/core/publish.ts): loadDocument, „vom Ersteller gelöst“, Solver (Limit 40 000 Knoten),
     Titel/Beschreibung/Größe; minMoves und content_key (= progressKey) berechnet der Server selbst
  3. rpc publish_puzzle mit dem Secret Key: Sperre, Tageslimit (10), Insert; doppelter content_key → 409
```
- Fehler kommen als `{ error: "<code>" }` zurück (`not-verified`, `unsolvable`, `daily-limit`, `duplicate`, …);
  `publishErrorText` macht deutsche Texte daraus. Bei `duplicate` sucht die App das vorhandene Rätsel über den
  Inhaltsschlüssel und verlinkt es.
- `publish_puzzle` (Migration `0004_publish.sql`) ist nur für `service_role` ausführbar; die Tabelle selbst hat für Nutzer
  kein Insert-Recht. Der Secret Key steht der Function als Umgebungsvariable zur Verfügung und verlässt sie nie.
- Der Solver läuft serverseitig mit niedrigerem Limit als im Editor (2 s CPU pro Aufruf). Bricht er ab, wird
  trotzdem veröffentlicht, nur ohne `minMoves`.
- **Deployment:** `.github/workflows/deploy-functions.yml` deployt bei Änderungen an `src/core`, `src/puzzles`, `src/server`
  oder `supabase/functions` mit der Supabase-CLI (`--use-api`, damit Importe außerhalb von `supabase/` funktionieren) in
  alle konfigurierten Projekte. Nötig ist das GitHub-Secret `SUPABASE_ACCESS_TOKEN`.
- `#/g/<id>` lädt das Rätsel per PostgREST (mit Autor), prüft es mit `loadDocument` und spielt es wie einen geteilten Link.
  Der Spielzähler (`register_play`) wird einmal pro Gerät und Rätsel aufgerufen (`localStorage` `raetsel-plays`).
- Auf der Kontoseite listet „Meine Veröffentlichungen“ die eigenen Rätsel; Titel und Beschreibung lassen sich ändern,
  zurückziehen heißt löschen.

### Galerie (M11)
- **Schwierigkeit:** eine gemeinsame Skala 1–3 (leicht, mittel, schwer) in `puzzles.difficulty`. Typen mit Solver bekommen
  sie beim Veröffentlichen aus `minMoves` und den `levels` ihrer `rules.ts` (Rush Hour ≤ 8 / ≤ 20, Laser ≤ 3 / ≤ 7),
  das Quiz später aus den Bewertungen (M12, 1–2 leicht, 3 mittel, 4–5 schwer). Für „Schwierigste zuerst“ gibt es die
  generierte Spalte `hardness` = Stufe · 100 000 + Züge (Migration `0005_gallery.sql`).
- **Route** `#/gallery?type=laser&level=2&sort=likes`: Filter stehen in der Route (Standardwerte weggelassen), damit
  Zurück und Links sie behalten. Filterwechsel ersetzen den Verlaufseintrag. Zurück von einem Rätsel behält die geladene Liste.
- **Keyset-Pagination** (`core/gallery.ts`): sortiert nach `<spalte> desc, id desc`, die nächste Seite filtert per
  `or=(<spalte>.lt.<wert>,and(<spalte>.eq.<wert>,id.lt.<id>))`. Eine Zeile mehr als die Seitengröße verrät, ob es weitergeht.
  Pro Sortierung gibt es einen Index (nur sichtbare Rätsel).
- **Gelöst-Markierung:** Die Karten laden `content_key` mit; er ist gleich dem `progressKey`, also reicht ein Blick in den
  lokalen Fortschritt.
- Startseite: „Neu in der Galerie“ (die drei neuesten) und je Typ ein Link auf die gefilterte Galerie.

### Likes und Bewertungen (M12)
- `core/reactions.ts`: eigenes Like und eigene Bewertung laden, setzen und ändern. Likes per Insert/Delete, Bewertungen
  per Insert bzw. Patch nur von `value` (kein PostgREST-Upsert, weil Nutzer die Schlüsselspalten nicht ändern dürfen).
- Die Spielseite ändert Zähler sofort (optimistisch) und nimmt die Änderung zurück, wenn der Server ablehnt.
- Wer darf: angemeldet, nicht der Autor, Rätsel nicht ausgeblendet, Konto nicht gesperrt. Das prüft RLS (Migration 0001),
  die App blendet die Knöpfe nur passend aus. Bewerten erst nach dem Lösen (lokaler Fortschritt).
- Durchschnitt ab 3 Bewertungen (`MIN_RATINGS`). Für Rätsel ohne `min_moves` setzt `count_rating` (Migration 0006)
  daraus `difficulty`: Ø < 2,5 leicht, < 3,5 mittel, sonst schwer.

### Melden und Moderation (M13)
- Melden: Insert in `reports` (Grund, Kommentar ≤ 500 Zeichen), eine Meldung pro Nutzer und Rätsel (eindeutiger Schlüssel,
  auch nach dem Schließen). Ob man schon gemeldet hat, lädt `fetchMyReaction` mit.
- `report_count` = offene Meldungen. Der Trigger `count_report` blendet ab 3 aus. `mod_release_puzzle` (sichtbar,
  Meldungen schließen) und `mod_hide_puzzle` (ausgeblendet, Meldungen schließen) setzen den Zähler auf 0.
- Moderatoren (`is_moderator`, nur per SQL) sehen über RLS alle Meldungen und ausgeblendete Rätsel und dürfen löschen.
  Sperren und Namen zurücksetzen laufen über `mod_set_banned` und `mod_reset_username`; jede `mod_…`-Funktion prüft
  `is_moderator()` selbst. Moderatoren lassen sich nicht sperren.
- `#/moderation` lädt ausgeblendete Rätsel und solche mit offenen Meldungen (höchstens 100), mit eingebetteten offenen
  Meldungen und Autor. Kommentare sind nicht vertrauenswürdig und werden nur als Text gerendert.
- Live-Tests mit einem Test-Moderator auf `dev`: Zugangsdaten nur lokal in `.env.development.local`.

### Bilder in Quizfragen (M14)
- **Format:** Quiz `typeVersion` 2 mit optionalem `image: { key, alt }` pro Frage; `migrate` übernimmt Version 1 unverändert.
  `key` ist der SHA-256 der Bilddatei (`core/images.ts`, synchron über `sha256Bytes`), der Alternativtext ist Pflicht.
  Höchstens 10 verschiedene Bilder pro Quiz. Der Typ meldet seine Bilder über `rules.imageKeys(data)`.
- **Im Browser** (`ui/image-encode.ts`): auf höchstens 1024 px verkleinern, als WebP (sonst JPEG) mit sinkender Qualität,
  bis ≤ 200 KB. Gespeichert in IndexedDB (Store `images`, DB-Version 2). Nicht mehr benutzte Bilder löscht die Bibliothek beim Laden.
- **Bildquelle:** Spiel und Editor bekommen eine `ImageSource`: eigene Rätsel aus IndexedDB (Object-URLs), veröffentlichte
  aus Supabase Storage (`quiz-images/<rätsel-id>/<key>`, öffentlicher Bucket, Migration `0008_images.sql`). Fehlt ein Bild
  (Teilen-Link), zeigt das Quiz den Alternativtext; der Teilen-Dialog weist darauf hin.
- **Veröffentlichen:** Die App schickt die Bilder als Base64 mit. `prepareImages` prüft für jeden Schlüssel im Dokument
  Größe, Typ (WebP/JPEG anhand der Datei-Signatur) und Hash. Die Function lädt sie nach dem Insert hoch; scheitert ein Upload,
  löscht sie das Rätsel wieder. „In Bibliothek kopieren“ lädt die Bilder eines veröffentlichten Quiz nach IndexedDB.
- **Löschen:** Storage-Dateien lassen sich nicht per SQL löschen. Die Edge Function `cleanup-images` entfernt einmal täglich
  die Ordner von Rätseln, die es nicht mehr gibt (`.github/workflows/cleanup-images.yml`, geschützt mit `CLEANUP_SECRET`).
- **Moderation:** Die Moderationsansicht zeigt Vorschaubilder der Bilder eines Rätsels.

### Rätsel-Ketten (M24)
- **Datenmodell** (Migration `0009_chains.sql`): Tabelle `chains` mit Titel, Beschreibung, Abschlusstext (`outro`) und
  `steps` als jsonb-Liste `[{ puzzle, key, text }]` (2–20 Einträge). `key` ist der `content_key` des Rätsels zum Zeitpunkt
  des Veröffentlichens; er ändert sich nie, also zeigen Galerie-Karten den eigenen Fortschritt ohne weitere Abfrage.
  Es gibt keinen Fremdschlüssel auf `puzzles`: Ein zurückgezogenes Rätsel bleibt in der Liste stehen und gilt als
  „nicht mehr verfügbar“.
- **Veröffentlichen** über die Datenbankfunktion `publish_chain(title, description, steps, outro)` (security definer,
  aufrufbar für `authenticated`, keine Edge Function nötig): Sperre, Tageslimit 5, Längen, Format der Schritte, keine
  doppelten Rätsel, jedes Rätsel muss existieren und sichtbar sein. Sie baut die Schritte selbst neu auf (nur `puzzle`,
  `key`, `text`). Fehler kommen mit `PT400`/`PT403`/`PT429` (HTTP-Status), die Meldung ist ein Code
  (`invalid-steps`, `unavailable-puzzle`, …), den `chainErrorText` übersetzt. Tabelle und Funktion haben dieselben
  Grenzen wie `CHAIN` in `core/chains.ts`.
- Autoren dürfen nur Titel und Beschreibung ändern und löschen (zurückziehen); Moderatoren dürfen löschen. Spielzähler
  über `register_chain_play` wie bei Rätseln.
- **Melden:** `reports` hat jetzt `puzzle_id` *oder* `chain_id` (Check-Constraint), eine Meldung pro Nutzer und Kette.
  `count_report` blendet Ketten wie Rätsel ab 3 offenen Meldungen aus; `mod_release_chain` und `mod_hide_chain`
  entsprechen den Funktionen für Rätsel. Die Moderationsansicht lädt Rätsel und Ketten und sortiert sie gemeinsam.
- **Fortschritt** bleibt lokal: `chainProgress` (rein, getestet) markiert jeden Schritt als gelöst, offen, gesperrt oder
  nicht verfügbar. Ein Schritt ist frei, wenn alle davor gelöst oder nicht verfügbar sind. Verfügbar heißt: Das Rätsel
  kommt bei `id=in.(…)&hidden=is.false` zurück (ausgeblendete gelten auch für Autor und Moderation als nicht verfügbar).
- **App:** `#/c/<id>` zeigt die Übersicht, `#/c/<id>/<n>` spielt Schritt n wie ein veröffentlichtes Rätsel (Likes,
  Bewertung, Melden des Rätsels wie gewohnt), mit dem Text vor dem Rätsel über dem Spielfeld und „Weiter“ im
  Gelöst-Dialog. Die Übersicht lädt immer neu, Schritte nutzen die geladene Kette. `#/chain/new` ist der Editor;
  der Entwurf liegt nur im App-Zustand.

### Zeitmessung und Ranglisten (M25)
- **Zeit** (`core/timer.ts`, rein): Sie startet mit dem ersten Zug, pausiert bei verdeckter Seite (`visibilitychange`) und
  stoppt beim Lösen. Rückgängig nach dem Lösen setzt denselben Versuch fort, „Neustart“ beginnt einen neuen. Gemessen wird
  mit `performance.now()`; solange sie läuft, rendert die App einmal pro Sekunde. Die Bestzeit steht als `bestTimeMs` im
  Fortschritt, unabhängig vom Bestwert der Züge. Das Feld ist optional, deshalb braucht IndexedDB keine neue Version.
- **Zugfolge:** Die Spiel-Session merkt sich zu jedem Zustand den Zug davor; `path(session)` liefert die Züge vom Start
  bis zum aktuellen Stand ohne zurückgenommene. Züge sind schlichtes JSON.
- **Rangliste je Typ:** `PuzzleRules.ranking` ist `"moves"` (wenigste Züge, bei Gleichstand die Zeit) oder `"time"`
  (Nonogramm). Ohne `ranking` (Quiz) gibt es keine Rangliste.
- **Eintragen** über die Edge Function `submit-score`: Token prüfen, Rätsel mit dem Service-Key laden (unsichtbare und
  eigene werden abgelehnt), `loadDocument`, dann `checkSolution` (höchstens 5 000 Züge, jeder muss von `applyMove`
  angenommen werden, keiner nach dem lösenden, am Ende gelöst; Züge zählt der Server). Die Zeit wird nur auf
  Plausibilität geprüft (1 ms bis 24 h), sie lässt sich also fälschen – die Züge nicht. 5 000 Züge nachzuspielen kostet
  bei allen Typen unter 40 ms.
- **Datenmodell** (`0010_scores.sql`): `scores` mit einer Zeile je Spieler und Rätsel (bestes Ergebnis). Nur
  `submit_score` (Service-Role) schreibt; die Tabelle selbst ist nicht lesbar. `leaderboard(puzzle)` (anonym aufrufbar)
  liefert die Top 10 und den eigenen Platz, gleiche Ergebnisse teilen sich einen Platz. Gesperrte Spieler und der Autor
  fehlen in der Liste, auch mit älteren Einträgen. `mod_clear_scores(user)` entfernt einen Spieler aus allen Ranglisten
  (in der Rangliste und in der Moderationsansicht).
- **Offline:** Scheitert das Senden ohne Verbindung (oder mit Serverfehler), wartet das Ergebnis im `localStorage`
  (`raetsel-score-queue`, höchstens 10) und wird beim Start, bei `online` und nach der Anmeldung gesendet – nur für das
  Konto, mit dem gelöst wurde.

### Rätsel des Tages (M26)
- **Welcher Tag:** Der Tag wechselt um Mitternacht deutscher Zeit (`daily_today()`, Europe/Berlin), für alle gleich. Die
  App rechnet nie mit der Uhr des Geräts, sondern übernimmt den Tag aus der Antwort des Servers.
- **Auswahl ohne Cron-Job** (`0011_daily.sql`): `daily_puzzle()` (anonym aufrufbar, per POST, weil sie schreibt) liefert
  das Rätsel des heutigen Tags und wählt beim ersten Aufruf des Tages eins (`pick_daily`): sichtbar, Autor nicht gesperrt,
  ein Typ mit Rangliste (die Typen ohne stehen als Liste im SQL, ein Test vergleicht sie mit `rules.ts`). Zuerst Rätsel,
  die noch nie dran waren, dann solche eines anderen Typs als gestern, dann die meistgelikten und meistgespielten. Sind
  alle schon dran gewesen, kommt das zurück, dessen Tag am längsten her ist. Gleichzeitige erste Aufrufe sind über den
  Primärschlüssel `day` abgesichert (`on conflict do nothing`). Ist das heutige Rätsel ausgeblendet oder zurückgezogen
  (`puzzle_id` wird dann `null`), wählt der nächste Aufruf neu; ersetzt wird nur, wenn niemand dazwischen ersetzt hat.
  In einer leeren Galerie liefert die Funktion eine Zeile ohne Rätsel.
- **Tagesrangliste:** Lösungen unter `#/daily` schickt die App mit `daily: <Tag>` an `submit-score`. Die Function spielt
  sie wie in M25 nach und ruft zusätzlich `submit_daily` auf: Nur die erste Lösung des Tages zählt (`repeat` danach). Der
  Vortag zählt noch, damit wer kurz vor Mitternacht anfängt, nicht leer ausgeht; älter oder ein inzwischen ersetztes
  Rätsel gibt `expired`. Das Ergebnis geht außerdem in die normale Rangliste. Autoren bekommen bei ihrem eigenen Rätsel
  des Tages keinen Ranglisten-Eintrag, die Serie zählt aber. `daily_leaderboard(day)` wie `leaderboard()`, nur für die
  Ergebnisse zum aktuellen Rätsel des Tages.
- **Serie:** Tage am Stück mit Eintrag in `daily_scores`, bis heute oder – solange heute noch offen ist – bis gestern
  (`daily_streak`, mitgeliefert von `daily_puzzle()`). Ohne Konto zählen die auf dem Gerät gelösten Tage
  (`localStorage` `raetsel-daily-days`, höchstens 400). Angemeldet zählt der Server; eine heutige Lösung, die noch in der
  Warteschlange steckt, rechnet `dailyStatus` dazu.
- **Ansichten:** Karte „Rätsel des Tages“ auf der Startseite (Typ, Stufe, gelöst, Serie). `#/daily` spielt das heutige
  Rätsel an Ort und Stelle (die Route bleibt, ein Neuladen holt das Rätsel des Tages neu) mit der Tagesrangliste daneben
  und der Serie im Gelöst-Dialog.
- **Moderation:** Oben in der Moderationsansicht heute und die nächsten 14 Tage (`mod_daily_plan`). Ein Galerie-Link
  plant ein Rätsel für einen Tag (`mod_plan_daily`); heute zu planen ersetzt das heutige Rätsel. Ergebnisse zum alten
  bleiben für die Serie erhalten, verschwinden aber aus der Tagesrangliste. Geplante künftige Tage lassen sich entfernen
  (`mod_unplan_daily`). Künftige Pläne sind nicht öffentlich: Beide Tabellen sind nur über die Funktionen erreichbar.
  `mod_clear_scores` leert jetzt auch die Tagesranglisten eines Spielers.

### Synchronisierung von Bibliothek und Fortschritt (M27)
- **Was:** eigene Rätsel und Entwürfe (mit Löschungen), deren Bilder und der Fortschritt (gelöst, beste Züge, beste
  Zeit je `progressKey`). Nicht: Teilen-Warteschlange, Serie ohne Konto, Einstellungen.
- **Zusammenführen** (`core/sync.ts`, rein und getestet) Eintrag für Eintrag: Bei Rätseln gewinnt die neuere Änderung
  (`updatedAt`, gesetzt vom Gerät, das geändert hat; bei Gleichstand bleibt die lokale). Löschen hinterlässt lokal einen
  Grabstein mit Zeitpunkt, der wie eine Änderung zählt: Eine spätere Bearbeitung auf einem anderen Gerät holt das Rätsel
  zurück. Beim Fortschritt zählt „irgendwo gelöst“ und, unabhängig voneinander, die wenigsten Züge und die beste Zeit.
- **Ablauf eines Syncs** (`syncOnce`): erst alles holen, was sich seit dem Cursor geändert hat (`sync_pull`, Seiten zu
  100), dann die eigenen Änderungen senden (`sync_push`, je 50 Rätsel und 500 Fortschritte, Löschungen zuerst). Vorher
  lädt er die Bilder der Rätsel hoch, die noch nicht im Konto sind; scheitert ein Upload, wartet das Rätsel auf den
  nächsten Sync.
- **Cursor:** Statt `changed_at` vergibt der Server eine Änderungsnummer pro Konto (`sync_state.rev`, `rev` in jeder
  Zeile). Zeitstempel kommen bei gleichzeitigen Transaktionen nicht in Commit-Reihenfolge an, eine Nummer unter
  Zeilensperre schon; falsch gehende Geräte-Uhren spielen für den Cursor keine Rolle. `sync_push(known, …)` liefert die
  neue Nummer als Cursor zurück, wenn das Gerät vorher alles kannte (`known`), sonst `known` – dann holt der nächste Sync
  auch die eigenen Änderungen noch einmal (ohne Wirkung).
- **Server** (`0012_sync.sql`): `sync_push` (security definer) setzt nur neuere Stände durch, kappt `updated_at` auf die
  Server-Zeit (eine vorgehende Uhr gewinnt sonst für immer), überspringt unveränderte Dokumente und unbekannte Löschungen
  und prüft die Grenzen. Rätsel über einer Grenze kommen als `rejected` zurück und bleiben auf dem Gerät markiert. Lesen
  nur die eigenen Zeilen (RLS), schreiben nur über die Funktion. Konto löschen entfernt alles per `on delete cascade`.
- **IndexedDB-Version 3:** Stores `tombstones`, `dirty` („geändert seit dem letzten Sync“, Schlüssel `p:<id>` bzw.
  `g:<key>` mit einem Stempel) und `meta` (Cursor, letzter Sync und hochgeladene Bilder je Konto unter `sync:<uid>`,
  dazu `owner`). Lokale Änderungen setzen die Markierung in derselben Transaktion; `clearDirty` entfernt nur
  Markierungen, deren Stempel sich seit dem Senden nicht geändert hat. Was vom Server kommt, geht durch `applyRemote`
  (eine Transaktion, ohne Markierung) und vorher durch `loadDocument(…, { draft: true })`; Dokumente einer neueren
  App-Version werden gespeichert und nach dem Update angezeigt.
- **Wann:** beim Start, nach der Anmeldung, beim Sichtbarwerden der Seite, bei `online`, 3 s nach dem Speichern und mit
  „Jetzt synchronisieren“ im Profil (dort auch „zuletzt synchronisiert“, Fehler und abgelehnte Rätsel). Es läuft immer
  nur ein Sync; Anfragen währenddessen führen zu genau einem weiteren.
- **Welche Daten zu welchem Konto gehören** (`ownerDecision`): Das Gerät merkt sich das Konto des letzten Syncs. Beim
  Abmelden bleibt alles auf dem Gerät. Dasselbe Konto synchronisiert einfach weiter; ein Gerät ohne Sync (oder nach dem
  Löschen des Kontos) übernimmt seine Daten ohne Rückfrage ins Konto. Meldet sich ein anderes Konto an und liegen Daten
  auf dem Gerät, fragt das Profil: „In mein Konto übernehmen“ oder „Vom Gerät entfernen“ (dann wird das Konto geladen).
  Bis zur Antwort wird nicht synchronisiert.
- **Bilder** liegen privat in `user-images/<uid>/<key>` (Storage-Policies: nur der eigene Ordner, lesen, hochladen,
  ersetzen; höchstens 100 Dateien über `user_image_count()`). Hochgeladen wird mit `x-upsert`, weil gleicher Schlüssel
  gleiche Bytes heißt. Geladen wird ein Bild erst, wenn es angezeigt wird und lokal fehlt. `cleanup-images` löscht
  täglich die Ordner gelöschter Konten und Bilder, die keins der synchronisierten Rätsel mehr benutzt und die älter als
  ein Tag sind. Lässt sich ein Dokument dabei nicht lesen, bleiben alle Bilder dieses Kontos.
- **Free-Tier** (500 MB Datenbank, 1 GB Storage): Ein Rätsel ist meist 0,5–5 KB groß, ein Fortschritt etwa 150 Byte. Mit
  typisch 20 Rätseln und 200 Fortschritten sind das rund 100 KB pro Konto, also Platz für einige Tausend Konten. Die
  Grenzen deckeln den schlimmsten Fall pro Konto: 500 Rätsel × 64 KB = 32 MB Datenbank (2 000 Zeilen mit Grabsteinen,
  5 000 Fortschritte) und 100 Bilder × 200 KB = 20 MB Storage. Ein Dutzend Konten am Limit würde den Free-Tier sprengen;
  dann im Dashboard nachsehen (`sync_puzzles` nach Nutzer summieren) und die Grenzen senken.

### Englisch und Sprache pro Rätsel (M28)

- **Texte:** `i18n/de.ts` legt die Schlüssel fest, `i18n/en.ts` hat den Typ `Record<MessageKey, string>`; `t.test.ts`
  prüft dieselben Schlüssel und Platzhalter. Mehrzahl über `tn(key, count)`: Sagt `Intl.PluralRules` „one“, wird
  `<key>One` genommen, falls es ihn gibt. Die Zahl steht als `{count}` im Text.
- **Aktive Sprache** (`ui/language.ts`): „Automatisch“ (Standard) nimmt die erste Sprache aus `navigator.languages`, die
  die App kann, sonst Englisch. Unter Profil › Darstellung › Sprache fest wählbar, gespeichert im `localStorage`
  (`knobelkiste-lang`). `main.ts` setzt sie vor dem ersten Rendern; ein Wechsel rendert neu ohne Neuladen,
  `<html lang>`, `document.title` und die Seitenbeschreibung folgen. Das Manifest bleibt deutsch.
- **Formate:** Datum, relative Zeiten und Zahlen nutzen die aktive Locale. Zur Sprache passende Browser-Locales werden
  übernommen (z. B. `en-GB`), sonst `de-DE` bzw. `en-US`. Formatter werden mit `perLocale()` gecacht und nach einem
  Wechsel neu gebaut. Ausnahme: Die Normalisierung von Quiz-Antworten (`core/hash.ts`) bleibt fest `de-DE`, sonst
  ändern sich die Hashes.
- **Beispiele:** Rätsel ohne Text haben einen Titel je Sprache (`title: { de, en }`), das Dokument trägt den deutschen.
  Das Quiz gibt es zweimal, je in einer Sprache (`lang`); Startseite und Levelliste zeigen nur Beispiele, die man lesen
  kann (`examplesIn(lang)`), per Link bleibt jedes spielbar. Der Fortschritt hängt nicht am Titel.
- **Sprache pro Rätsel:** `meta.lang` ist optional, alte App-Versionen verwerfen das Feld, also bleibt `format: 1`.
  Der Inhaltsschlüssel (`progressKey`) ignoriert `meta`, ändert sich also nicht. Neue Rätsel bekommen die
  Oberflächensprache, alte ohne Sprache ebenso beim nächsten Speichern; im Editor ist sie unter „Sprache und Aussehen“ (seit M34 „Beschreibung, Sprache und Aussehen“) änderbar.
  Ein Remix übernimmt die Sprache.
- **Galerie** (Migration `0013_lang.sql`): Spalte `puzzles.lang` (`de`, `en` oder null), `publish_puzzle` übernimmt
  `meta.lang` (neuer Parameter mit Default, die alte Edge Function läuft weiter). Filter `lang` in der Route
  (`#/gallery?lang=en`, Standard: alle, auch ohne Sprache); die Karte zeigt ein Kürzel-Badge („DE“), vorgelesen als
  „Sprache: Deutsch“. Dasselbe Rätsel in zwei Sprachen ist ein Duplikat, weil der Inhaltsschlüssel gleich ist.
- **Entscheidung Mails:** je nach `user_metadata.lang`. Die App schickt die Sprache beim Registrieren mit und
  aktualisiert sie (`PUT /auth/v1/user`), wenn sie sich bei einer Sitzung vom Token unterscheidet oder gewechselt
  wird. Die Vorlagen in `supabase/templates/` wählen mit `{{ if eq .Data.lang "en" }}` den Text; Konten ohne Sprache
  bekommen Deutsch.
- **Entscheidung Impressum und Datenschutz:** übersetzt. Weil `en.ts` alle Schlüssel haben muss, gibt es die Texte
  ohnehin; über der englischen Datenschutzerklärung steht, dass nur die deutsche Fassung verbindlich ist
  (`legalTranslation`, im Deutschen leer).

### Rätsel-Themes (M29)

Der Autor wählt pro Rätsel ein Theme (Farben des Spielfelds); ein geteiltes Rätsel sieht bei allen gleich aus.
Nicht zu verwechseln mit dem App-Farbschema hell/dunkel (`ui/theme.ts`). Themes sind reine Darstellung: Logik,
Solver und Daten bleiben unberührt.

- **Rollen** (`core/puzzle-theme.ts`): Jeder Typ ordnet seine Teile gemeinsamen Rollen zu und nutzt nur die, die er
  hat. So passt jedes Theme auf jeden Typ.

  | Rolle | Bedeutung | Ausparken | Klotski | Sokoban | Eis | Laser | Lights Out | Rohre | Nonogramm |
  |---|---|---|---|---|---|---|---|---|---|
  | `board` | Brett, Untergrund | Brett | Brett | Boden | Eis | Brett | Brett (neu) | Kachel | Papier |
  | `line` | Raster, dezente Linien | Linien | Linien | Fugen | Linien | Linien | Loch-Umriss | Spalt | Linien |
  | `wall` | Hindernis | – | – | Wand | Fels | Wand, fester Spiegel | – | feste Kachel, Nieten | – |
  | `figure` | Spielfigur | – | – | Figur | Figur | Laser | – | Quelle | – |
  | `piece` | bewegliches Teil | Autos waagrecht | 1×1 (2×1 gemischt) | Kiste | – | Spiegel | Licht aus | Rohr | Füllung, Zahlen |
  | `accent` | zweites Teil, Sonderfeld | Autos senkrecht | 2×2 (2×1 gemischt) | – | Sand | – | – | – | – |
  | `target` | Ziel | Zielauto, Ausgang | Zielblock, Ausgang | Zielfeld | Ziel | Ziel | – | – | – |
  | `done` | erledigt | – | – | Kiste auf Ziel | erreichtes Ziel | getroffenes Ziel | Licht an | Wasser | Lösungsbild |

  Abgeleitete Farben (Kanten, Glanzlichter, Gesicht der Figur, Mittellinien) rechnet die Palette aus den Rollen
  (`mix`, `detailOn`). Das **Quiz** hat kein Spielfeld und ist nicht themebar; `loadDocument` verwirft dort `meta.theme`.
- **Paletten** (`ui/palette.ts`): Jeder Renderer listet seine CSS-Variablen einmal mit Standardfarbe hell/dunkel
  (unverändert gegenüber vorher) und der Quelle im Theme. `paletteCss` erzeugt daraus das `<style>` (hell, dunkel per
  `data-theme`, dunkel per Systemeinstellung), statt es dreimal auszuschreiben. Mit Theme bekommt das Wurzelelement
  des Bretts die Werte als Inline-Stil (`paletteStyle`); der schlägt die Standardwerte, also sieht ein Brett mit Theme
  im hellen und dunklen Modus gleich aus, nur die App drumherum wechselt. Weil es ein Inline-Stil ist, können
  mehrere Bretter mit verschiedenen Themes auf einer Seite stehen. Ein Test prüft, dass jede Palette genau die
  `themeRoles` des Typs nutzt.
- **Format:** `meta.theme = { colors: { <rolle>: "#rrggbb", … } }` mit allen Rollen, nicht nur eine ID, damit eigene
  Themes (M30) ohne Formatwechsel dazukommen. `parseTheme` verlangt jede bekannte Rolle als Hex-Farbe, verwirft
  unbekannte Rollen und Felder, höchstens 32 Farbschlüssel und 1 KB. Ungültiges fällt still auf den Standard zurück;
  `format` und `typeVersion` bleiben. Der Inhaltsschlüssel ignoriert `meta`: dasselbe Rätsel in anderem Theme ist ein
  Duplikat, der Fortschritt bleibt. Ein Remix behält das Theme.
- **Kontrast** (`contrastProblems`): Nur Paare von Rollen, die der Typ hat. Teile auf dem Brett (`piece`, `wall`,
  `figure`, `target`, `done`, `accent` gegen `board`) brauchen 3:1, `figure` auf `accent` (Figur auf Sand) 2:1,
  `done` neben `piece` 1,5:1, Linien 1,2:1. Die Laserfarben gehören zu den Regeln (`LASER_COLORS` in `laser/rules.ts`,
  `themeFixed`): Ein Theme wählt nur über die Helligkeit des Bretts die helle oder dunkle Variante, die mindestens 2:1
  zum Brett haben muss. `preparePublication` lehnt zu wenig Kontrast mit `theme-contrast` ab; ein Test prüft alle
  vorgefertigten Themes auf allen Typen.
- **Farbe ist nie der einzige Unterschied:** Dafür kamen Formmerkmale dazu: ein Pfeil zum Ausgang auf dem Zielblock
  (Ausparken, Klotski), ein Häkchen statt der Latten auf Kisten im Ziel (Sokoban), breitere Rohre, wenn Wasser fließt
  (Rohre). Lights Out (Glühbirne), Laser (gefülltes Ziel) und Eis (Figur auf dem Ziel) hatten schon eins.
- **Vorgefertigte Themes** (`core/theme-presets.ts`): Garten, Meer, Pastell, Nacht, Weltraum. Gespeichert werden die
  Farben; der Editor erkennt ein Preset an ihnen, sonst zeigt er „Eigenes“.
- **Ansichten:** Auswahl „Theme“ mit Farbvorschau im Editor-Abschnitt „Sprache und Aussehen“ (seit M34 „Beschreibung, Sprache und Aussehen“; ganz unten, auf dem
  Desktop als Karte unter „Einstellungen“); das Bau-Brett und Probespielen zeigen das
  Theme. Spiel, Ketten und Rätsel des Tages übernehmen es über `loadDocument`. Galerie-Karten laden
  `theme:doc->meta->theme` mit (keine Migration) und färben das Platzhalter-Raster, ebenso „Meine Rätsel“.

### Eigene Themes im Editor (M30)

- **Farben anpassen:** Unter der Theme-Auswahl klappt „Farben anpassen“ ein natives `<input type="color">` je Rolle
  auf, die der Typ nutzt. Jede Änderung (`input`) setzt das Theme sofort, das Bau-Brett ist die Live-Vorschau. Die
  Namen kommen aus `themeParts` des Typs (z. B. Sokoban: Boden, Wände, Kisten, Kisten im Ziel); ein Test verlangt
  für jede Rolle in `themeRoles` (und `fixed`) einen Namen. Englische Namen sind klein geschrieben, damit sie in
  Sätzen passen; Beschriftungen und Satzanfänge werden großgeschrieben. Eine Farbe zu ändern hebt „verifiziert“
  nicht auf, weil das Theme nicht zu den Daten gehört.
- **Kontrastwarnungen live** aus `contrastProblems`, als Sätze („Kisten und Boden sind kaum zu unterscheiden.“), eine
  je Paar (die drei Laserfarben teilen sich eine). Darunter: Veröffentlichen geht so nicht, Teilen per Link schon.
  Im Teilen-Sheet steht dann ein offener Prüfpunkt „Theme gut erkennbar“, der Knopf „Veröffentlichen“ ist gesperrt
  (wie die Edge Function, die `theme-contrast` meldet), beim Link steht nur ein Hinweis.
- **Vorlagen** (`core/saved-themes.ts`, rein und getestet): Liste `{ id, name, theme }` im vorhandenen IndexedDB-Store
  `meta` unter `themes`, also ohne neue Datenbankversion. Höchstens 50 Vorlagen, Namen 1–40 Zeichen; kaputte Einträge
  (z. B. aus einer neueren App) werden beim Laden übersprungen. Die Auswahl zeigt „Vorlagen“ und „Meine Themes“ in
  einer Liste; eine Vorlage wird wie ein Preset an ihren Farben erkannt. Ist sie gewählt, lässt sie sich umbenennen
  und löschen; sonst speichert „Als Theme speichern“ die aktuellen Farben als neue Vorlage. Rätsel verweisen nie auf
  eine Vorlage, Löschen ändert also kein Rätsel. `clearLocal` (Kontowechsel „Vom Gerät entfernen“) lässt sie stehen.
- **Entscheidung:** Vorlagen werden nicht synchronisiert (keine Migration). Das Theme eines Rätsels reist ohnehin in
  `meta.theme` mit dem Rätsel; nachrüsten ließe es sich wie M27 mit einer eigenen Tabelle.

### Icon-Katalog (M31)

- **Katalog:** `core/icon-catalog.ts` listet die Icon-IDs (DOM-frei, also kennt auch die Edge Function den Katalog),
  die Dateien liegen als `src/icons/pieces/<id>.svg`. IDs bleiben stabil, der Katalog wächst nur. Erste 15 Icons:
  Katze, Roboter, Pinguin, Gespenst, Geschenk, Apfel, Fass, Stern, Fahne, Blume, Baum, Kaktus, Stein, Sonne, Mond.
  Sie sind selbst gezeichnet (keine fremde Lizenz, keine Namensnennung nötig).
- **Regeln für Icon-Dateien** (`core/icon-catalog.test.ts` prüft jede Datei und dass Katalog und Ordner gleich sind):
  Wurzel `<svg … viewBox="0 0 100 100">`, nur `path`, `circle`, `ellipse`, `rect`, `polygon` und `g`, nur
  Geometrie-Attribute und `class`, jede Form mit `class="main"` oder `class="detail"`, keine Farben, kein Text, keine
  Skripte, Stile oder Verweise, höchstens 4 KB.
- **Laden** (`ui/piece-icons.ts`): `import.meta.glob(…, { query: "?raw", eager: true })` bündelt die Dateien beim Build,
  sie sind also offline da und brauchen kein Paket. Eingefügt werden sie mit `unsafeSVG`, als Gruppe mit `translate` und
  `scale` (ein verschachteltes `<svg>` würde von Seiten-CSS für `svg` verkleinert). Das ist die einzige Stelle mit
  `unsafe…`; sie ist vertretbar, weil nur Dateien aus dem Repository eingefügt werden, die der Test prüft. Rätsel
  enthalten nur IDs, eigene SVGs lassen sich nicht hochladen. Unter `node --test` gibt es kein Vite, dann ist der
  Katalog leer und die Renderer zeichnen wie ohne Icon.
- **Icon-Rollen** nur, wo die Form keine Spielinformation ist: Figur, Kiste und Ziel (Sokoban), Figur, Fels und Ziel
  (Eis), Lampe (Lights Out). Rohre, Spiegel, Nonogramm, Klotski und Ausparken bekommen nur Farben; die Laser-Ziele
  tragen schon Farbsymbole. Die Farben kommen aus den Farbrollen (Figur → `figure`, Kiste → `piece` bzw. `done` im Ziel,
  Ziel → `target`, Fels → `wall`, Lampe aus/an → abgeleitete Töne von `piece`/`done`), über `--icon-main` und
  `--icon-detail`. Eine Kiste mit Icon im Ziel bekommt eine Plakette mit Häkchen, eine Lampe mit Icon leuchtet, wenn sie
  an ist: Farbe bleibt nie der einzige Unterschied.
- **Format:** `meta.theme.icons` (Icon-Rolle → ID). `parseTheme` verwirft unbekannte Rollen und IDs einzeln, eine ältere
  App zeigt also nur diese Teile wie ohne Icon. App-Versionen vor M31 verwerfen das ganze Feld. Kein Formatwechsel.
- **Editor:** „Figuren und Symbole“ unter der Theme-Auswahl, ein Raster aus 44-px-Radiobuttons je Icon-Rolle
  (Standard + Katalog), in den Farben des Themes. Vorlagen und eigene Themes werden an den Farben erkannt (`sameColors`),
  Icons zu wählen lässt die Auswahl also stehen. Die vorgefertigten Themes bringen passende Icons mit.

### Vorschaubilder auf den Karten (M32)

- **Plugin:** `renderPreview(data, theme)` zeichnet die Startstellung (`initState`) als `<svg>` mit `viewBox`, ohne feste
  Größe, ohne Bedienung und Texte, `aria-hidden` (die Karte nennt Titel und Typ). Die Typen nutzen dafür ihre
  `boardLayers` und `ui/preview.ts` (`previewSvg`); beim Laser fehlt die Inventar-Zeile. Das Nonogramm zeigt das leere
  Gitter mit einem Punkt pro Hinweiszahl, die Zahlen wären auf der Karte unlesbar (und die Daten enthalten keine Lösung).
  Jeder Typ mit `themeRoles` hat eine Vorschau, das Quiz keine; `src/puzzles/rules.test.ts` prüft das und zeichnet alle
  Beispiele mit und ohne Theme.
- **Server:** Die berechnete Spalte `preview_data(puzzles)` (`0014_preview.sql`, in PostgREST `select=preview:preview_data`)
  liefert `{ typeVersion, data }`, aber `null` für Typen ohne Spielfeld (ein Quiz kann bis 128 KB Text haben) und für
  Daten über 16 KB. Galerie, Startseite („Neu in der Galerie“) und Ketten-Schritte laden sie mit; die Karte „Rätsel des
  Tages“ holt Theme und Vorschau mit einer eigenen kleinen Abfrage (`fetchCardPreview`), damit `daily_puzzle()` unverändert
  bleibt und `#/daily` nicht wartet. Gemessen: eine Galerie-Seite mit 18 Rätseln wird um etwa 5 KB größer (gepackt < 1 KB).
- **Prüfung** (`core/preview.ts`, rein): `previewData` schickt die Daten durch `loadDocument` (Migration, `validate`), in
  „Meine Rätsel“ mit `draft: true` (`parseDraft`), damit auch Entwürfe mit Problemen eine Vorschau haben. Das Ergebnis wird
  pro Quellobjekt gecacht. Was sich nicht laden oder zeichnen lässt (neuerer Typ, alte App, kaputte Daten), zeigt still das
  Platzhalter-Raster von vorher.
- **Wo:** Galerie-Karten (Liste und Raster), „Meine Rätsel“, Startseite, Ketten-Übersicht (nur offene und gelöste Schritte;
  gesperrte verraten nichts), Karte „Rätsel des Tages“. Ketten-Karten in der Galerie behalten das Ketten-Symbol.
- **Reihenfolge beim Ausrollen:** Die App fragt `preview_data` ab; ohne die Migration schlägt die Galerie-Abfrage fehl.
  Also erst `0014_preview.sql` auf `dev` und `prod` einspielen, dann pushen.

### Tastenkürzel (M33)

- **Zuordnung** (`core/shortcuts.ts`, rein und getestet): `shortcutFor(taste, kontext, mac)` mit den Kontexten Spiel,
  Editor und Probespielen im Editor. Strg bzw. Cmd + Z rückgängig, Strg Y oder Strg Umschalt Z wiederholen (Mac:
  Cmd Umschalt Z), R Neustart (Spiel), Ziffern 1–9 und 0 Werkzeug (Editor), P Bauen/Probespielen, „?“ Übersicht.
  Mit Alt nie: AltGr meldet auf vielen Tastaturen Strg + Alt.
- **Ein Listener** am `document` (`main.ts`, `onShortcutKey`), aktiv nur in den Fokus-Ansichten mit Spiel oder Editor.
  Er greift nicht, wenn das Spielfeld die Taste schon verarbeitet hat (`defaultPrevented`: Pfeile, WASD, Enter auf einer
  Zelle), in Textfeldern, Auswahllisten und editierbarem Inhalt (`keysStayInTarget`; Textfelder behalten ihr eigenes
  Rückgängig) und solange ein Dialog, Sheet oder Menü offen ist.
- **Neustart per R** fragt nach (`confirm`), der Knopf nicht: Eine Taste ist schnell versehentlich gedrückt, und ein
  Neustart verwirft den Verlauf.
- **Werkzeuge** sind native Radiobuttons im Grid-Editor; die Ziffer setzt den n-ten auf `checked`. Der Quiz-Editor hat
  keine Werkzeuge, dort tun Ziffern nichts.
- **Anzeige:** Die Übersicht (`ui/components/shortcuts-dialog.ts`) listet nur, was im Kontext wirkt, mit „Strg“ bzw. „⌘“
  aus i18n (`keyCtrl`). Knöpfe tragen `aria-keyshortcuts` und das Kürzel im `title`. Der Knopf „Tastenkürzel“ und die
  Ziffern an den Werkzeugen erscheinen nur bei `(hover: hover) and (pointer: fine)` (Klasse `.kbd-only`), also nicht
  auf Handys und Tablets.

### Zeit ausblenden und Beschreibung im Editor (M34)

- **Laufende Zeit:** Einstellung pro Gerät im `localStorage` (`knobelkiste-timer` = `hidden`, sonst angezeigt;
  `ui/play-settings.ts`), unter Profil › Darstellung. Ausgeblendet fehlt nur die Kachel „Zeit“ im Spiel; der Timer läuft
  weiter (Bestzeit, Ranglisten, Gelöst-Dialog), die Seite rendert dann aber nicht mehr jede Sekunde neu.
- **Beschreibung:** `meta.description` gab es in der Hülle schon (höchstens 2 000 Zeichen, gleich `PUBLISH.maxDescription`).
  Der Editor hält sie im `EditorState` (nicht in der Undo-Historie, wie der Titel), `toDocument` übernimmt sie getrimmt
  und lässt sie leer weg. Teilen per Link nimmt sie mit; der Inhaltsschlüssel ignoriert `meta`, sie ändert also weder
  Fortschritt noch Duplikat-Erkennung. Beim Veröffentlichen ist sie die Vorbelegung des Dialogs und landet wie bisher in der
  Spalte `description`; das veröffentlichte Dokument trägt sie nicht. Ein Remix übernimmt die Beschreibung aus dem
  Dokument bzw. aus der Galerie-Spalte.

### Status in „Meine Rätsel“ (M35)

- **Über Inhaltsschlüssel** (`core/library-status.ts`, rein): Ein Status gilt nur, solange der Inhalt dem
  veröffentlichten bzw. geteilten entspricht, also wird er am `progressKey` des geprüften Dokuments festgemacht.
  Titel, Beschreibung und Theme gehören nicht dazu. Entwürfe mit Problemen haben keinen Schlüssel und sind Entwürfe.
- **„In der Galerie“:** `ownPublishedKeys` lädt beim Öffnen der Bibliothek die `content_key`s der eigenen sichtbaren
  Rätsel (ausgeblendete sind nicht in der Galerie). Nach dem Veröffentlichen kommt der Schlüssel sofort dazu. Das gilt
  auf jedem Gerät des Kontos, ohne einen Status zu synchronisieren; abgemeldet gibt es ihn nicht.
- **„Per Link geteilt“:** Kopieren oder Senden des Links (nicht schon das Öffnen des Teilen-Sheets) legt den Schlüssel
  in die Liste `shared-keys` im IndexedDB-Store `meta` (neueste zuerst, höchstens 500). Nur auf diesem Gerät.
- **Reihenfolge:** Galerie vor Link vor „verifiziert“ vor „Entwurf“. Der Filter „Entwürfe“ umfasst alles, was weder in
  der Galerie noch geteilt ist. Er steht in der Route (`#/library?filter=…`), Wechsel ersetzen den Verlaufseintrag.

### Weiterspielen (M36)

- **Ein Eintrag** `resume` im IndexedDB-Store `meta`, nur auf diesem Gerät: Route, Inhaltsschlüssel, Zugfolge
  (`session.path`), bisherige Zeit, dazu Typ, Titel, Daten, `typeVersion` und Theme für die Karte auf der Startseite
  (Vorschau wie M32, `thumb` mit dem Eintrag als Quelle). Kein Spielzustand: `replay` (`core/resume.ts`) spielt die Züge
  mit `dispatch` nach, also mit Undo-Verlauf. Wird ein Zug abgelehnt oder ist das Rätsel danach gelöst, beginnt es frisch
  und der Eintrag wird gelöscht.
- **Fortsetzen:** `startPlay` ruft `continueAttempt` auf. Das wartet, bis der Eintrag geladen ist (sonst ginge das
  Neuladen eines Tabs auf der Rätsel-Adresse verloren), und setzt fort, wenn der Inhaltsschlüssel passt, egal über welche
  Route das Rätsel geöffnet wurde. Der Timer ist dann „gestartet, pausiert“ (`continuedTimer`) und läuft mit dem nächsten
  Zug weiter (`nextTimer` ruft dafür `resumeTimer` auf).
- **Speichern** (`resumeAction`): Nach einer Änderung mit Zügen wird eine Sekunde später gespeichert, beim Verlassen der
  Route und beim Verbergen der Seite sofort (mit der Zeit bis dahin). Gelöst oder ohne Züge (Neustart, alles rückgängig)
  wird der Eintrag dieses Rätsels gelöscht; der eines anderen Rätsels bleibt, bis hier ein Zug fällt. Probespielen im
  Editor und Rätsel ohne Inhaltsschlüssel zählen nicht.
- **Ranglisten:** Der fortgesetzte Versuch schickt beim Lösen die ganze Zugfolge und die Zeit beider Teile; beim
  Tagesrätsel gilt die Route `#/daily`, an einem neuen Tag passt der Inhalt nicht mehr und der Eintrag verfällt.

### Suche (M37)

- **Datenbank** (`0015_search.sql`): PostgREST kann kein `or` über eine eigene Spalte und eine eingebettete Tabelle
  (den Autornamen) bilden, und die Galerie braucht `or` schon für die Keyset-Pagination. Deshalb tragen `puzzles` und
  `chains` den Autornamen selbst (`author_name`, gesetzt per Trigger beim Einfügen und nach jeder Umbenennung in
  `profiles`) und eine generierte Spalte `search_text` = lower(Titel + Autor) mit `pg_trgm`-GIN-Index (nur sichtbare
  Zeilen). Ein geänderter Titel aktualisiert sie von selbst.
- **Abfrage** (`core/gallery.ts`): `normalizeSearch` macht aus der Eingabe höchstens 60 Zeichen aus Buchstaben, Ziffern,
  Leerzeichen, Punkt, Apostroph und Bindestrich (alles andere wird Leerzeichen, auch `_`, ein LIKE-Platzhalter), unter
  2 Zeichen keine Suche. `searchCondition` verlangt jedes Wort (höchstens 5): `and=(search_text.ilike."*wort*",…)`.
  Das kombiniert sich mit Typ, Stufe, Sprache, Sortierung und Cursor; Ketten nutzen dieselbe Bedingung.
- **Route:** `q` im Galerie-Filter, für beide Ansichten; der Wechsel Rätsel/Ketten behält die Suche.
- **Oberfläche** (`ui/components/search-field.ts`): ein Formular mit `role="search"`. Der Wert wird als Attribut gesetzt,
  damit ein Rendern während des Tippens nichts überschreibt. In der Galerie sucht es 400 ms nach dem Tippen (Enter
  sofort) und ersetzt dabei den Verlaufseintrag; Startseite (mobil) und Desktop-Navigation öffnen die Galerie mit der Suche.
- **„Meine Rätsel“:** ein lokaler Titelfilter (`matchesTitle`, jedes Wort, ohne Groß- und Kleinschreibung), nicht in der
  Route; er gilt, bis man die Bibliothek verlässt.

### Teilen aus dem Spiel und QR-Code (M38)

- **Welcher Link** (`openPlayShare` in `main.ts`): Veröffentlichte Rätsel und das Tagesrätsel teilen `#/g/<id>`,
  Schritte einer Kette die Kette (`#/c/<id>`), geteilte Links sich selbst; Beispiele und eigene Rätsel bekommen wie im
  Editor einen Link mit dem ganzen Rätsel (`#/p/<code>`). Eigene Rätsel nur, wenn sie geprüft sind (`meta.verified`),
  und das Teilen zählt für „Per Link geteilt“ (M35). Versteckte Rätsel und das Probespielen haben keinen Teilen-Knopf.
- **Oberfläche:** „Teilen“ im Mehr-Menü des Spiels, auf dem Desktop zusätzlich als Knopf in der Seitenleiste. Das Sheet
  ist dasselbe wie im Editor (`share-dialog.ts`), ohne den Weg „Veröffentlichen“.
- **QR-Encoder** (`core/qr.ts`, rein): Byte-Modus, Versionen 1–40, alle vier Fehlerkorrekturstufen, Reed-Solomon über
  GF(256), acht Masken mit Strafpunkten nach dem Standard. Die kleinste passende Version bei Stufe L, dann die Stufe so
  hoch, wie es in dieser Version noch passt. `qrPath` liefert die dunklen Module als SVG-Pfad (eine Zeile je Lauf).
  Getestet gegen Referenzmatrizen aus segno für alle 40 Versionen; alle ließen sich mit zxing-cpp zurücklesen.
- **Im Sheet** (`ui/components/qr-code.ts`): eingeklappt, auf Knopfdruck schwarz auf Weiß mit 4 Modulen Ruhezone,
  unabhängig vom Theme, höchstens 20rem breit. Über `QR_MAX_LENGTH` = 1 800 Zeichen (Handy-Test: bis dahin zuverlässig
  lesbar, Version 31) steht statt des Codes ein Hinweis.

### Grundsätze
- **Optional:** Ohne Konfiguration in `src/backend.ts` läuft die App wie in Phase 1. Spielen, Bauen und Teilen per Link
  brauchen nie einen Account und nie das Backend.
- **Der öffentliche Anon-Key steckt im Client**, das ist bei Supabase so vorgesehen. Sicherheit kommt ausschließlich aus
  Row Level Security, Datenbankfunktionen und den Edge Functions. Der Service-Role-Key liegt nur in den Edge Functions.
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
| `puzzles` | `id`, `author_id`, `type`, `type_version`, `doc` (jsonb), `content_key` (eindeutig), `title`, `description`, `min_moves`, `difficulty`, `hardness`, `hidden`, `like_count`, `play_count`, `rating_sum`, `rating_count`, `report_count`, `published_at` | Edge Function `publish`; Autor nur Titel/Beschreibung/Löschen |
| `likes` | `user_id`, `puzzle_id` (Primärschlüssel aus beiden) | angemeldete Nutzer, nicht für eigene Rätsel |
| `ratings` | `user_id`, `puzzle_id`, `value` 1–5 | angemeldete Nutzer, nicht für eigene Rätsel |
| `chains` | `id`, `author_id`, `title`, `description`, `steps` (jsonb), `outro`, `hidden`, `play_count`, `report_count`, `published_at` | Funktion `publish_chain`; Autor nur Titel/Beschreibung/Löschen |
| `scores` | `puzzle_id`, `user_id` (Primärschlüssel aus beiden), `moves` (null bei Rangliste nach Zeit), `time_ms`, `achieved_at` | Edge Function `submit-score` über `submit_score`, nur bessere Ergebnisse |
| `daily` | `day` (Primärschlüssel), `puzzle_id` (null nach Zurückziehen), `planned_by` (null = automatisch), `created_at` | `daily_puzzle()` beim ersten Aufruf des Tages, Moderatoren über `mod_plan_daily` |
| `daily_scores` | `day`, `user_id` (Primärschlüssel aus beiden), `puzzle_id`, `moves`, `time_ms`, `achieved_at` | Edge Function `submit-score` über `submit_daily`, nur die erste Lösung des Tages |
| `reports` | `id`, `puzzle_id` oder `chain_id`, `reporter_id`, `reason`, `comment`, `resolved`, `created_at` | angemeldete Nutzer, eine Meldung pro Rätsel bzw. Kette |
| `sync_state` | `user_id` (Primärschlüssel), `rev` (letzte Änderungsnummer des Kontos) | `sync_push` |
| `sync_puzzles` | `user_id`, `id` (Primärschlüssel aus beiden), `doc` (null wenn gelöscht), `updated_at` (vom Gerät), `deleted`, `rev`, `changed_at` | `sync_push`, nur neuere Stände; lesen nur der Nutzer selbst |
| `sync_progress` | `user_id`, `key` (Primärschlüssel aus beiden), `solved`, `best_moves`, `best_time_ms`, `rev`, `changed_at` | `sync_push`, nur bessere Werte; lesen nur der Nutzer selbst |

Zähler (`like_count`, `rating_*`, `report_count`) pflegen Trigger, sodass die Galerie ohne Aggregation sortieren kann.
Der Spielzähler wird über eine Datenbankfunktion (`register_play`) erhöht, die auch anonym aufrufbar ist.
Ab einer Meldungsschwelle setzt ein Trigger `hidden = true`.

### Neue Routen

| Hash | View |
|---|---|
| `#/gallery?type=…&level=…&lang=…&sort=…` | Galerie mit Filtern (Typ, Stufe, Sprache) und Sortierung |
| `#/g/<id>` | veröffentlichtes Rätsel spielen (kurzer Teilen-Link) |
| `#/account` | Anmelden/Registrieren bzw. Kontoseite mit „Meine Veröffentlichungen“ |
| `#/moderation` | Moderationsansicht (nur Moderatoren) |
| `#/gallery?view=chains&sort=…` | Galerie der Ketten (M24) |
| `#/c/<id>` | Kette: Übersicht mit Schritten, Abschluss |
| `#/c/<id>/<n>` | Schritt n einer Kette spielen |
| `#/chain/new` | Ketten-Editor (angemeldet) |
| `#/daily` | das heutige Rätsel des Tages mit Tagesrangliste (M26) |

### Rechtliches
Vor dem Livegang mit Backend: Datenschutzerklärung (Hosting, Supabase mit AV-Vertrag, Mailanbieter, gespeicherte Daten,
Löschung), Kontolöschung in der App und ein vollständiges Impressum. Den Text der Datenschutzerklärung muss der Betreiber
selbst verantworten.
