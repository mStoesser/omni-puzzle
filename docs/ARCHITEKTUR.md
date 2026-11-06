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
    difficulty.ts         # gemeinsame Schwierigkeitsskala 1–3 (aus minMoves bzw. Bewertungen)
  server/
    publish-handler.ts    # Request-Handler der Edge Function „publish“ (laufzeitneutral, mit node --test getestet)
    cleanup-handler.ts    # Request-Handler der Edge Function „cleanup-images“
  ui/
    views/                # home.ts, library.ts, play.ts, editor.ts
    components/           # dialog, share-dialog, grid-editor, tap, swipe …
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
  templates/              # deutsche Mail-Vorlagen
  functions/publish/      # Edge Function (Deno), importiert src/server/publish-handler.ts
  functions/cleanup-images/  # Edge Function (Deno), importiert src/server/cleanup-handler.ts
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
};

type SolveResult<M> =
  | { status: "solved"; moves: M[] }
  | { status: "unsolvable" }
  | { status: "aborted" };          // Suchlimit erreicht

type PlayContext<D, S, M> = {
  data: D; state: S;
  dispatch(move: M): void;          // Core ruft applyMove, speichert History (Undo/Redo), prüft isSolved
  images: ImageSource;              // ab M14: url(key) → Adresse, "loading" oder null (nicht verfügbar)
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
| `#/datenschutz` | Datenschutzerklärung (Einstellungen in `src/privacy.ts`, Texte in `src/i18n/de.ts`) |

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
                                          ├─ Postgres + Row Level Security: profiles, puzzles, likes, ratings, reports
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
| `reports` | `id`, `puzzle_id`, `reporter_id`, `reason`, `comment`, `resolved`, `created_at` | angemeldete Nutzer, eine Meldung pro Rätsel |

Zähler (`like_count`, `rating_*`, `report_count`) pflegen Trigger, sodass die Galerie ohne Aggregation sortieren kann.
Der Spielzähler wird über eine Datenbankfunktion (`register_play`) erhöht, die auch anonym aufrufbar ist.
Ab einer Meldungsschwelle setzt ein Trigger `hidden = true`.

### Neue Routen

| Hash | View |
|---|---|
| `#/gallery?type=…&level=…&sort=…` | Galerie mit Filtern und Sortierung |
| `#/g/<id>` | veröffentlichtes Rätsel spielen (kurzer Teilen-Link) |
| `#/account` | Anmelden/Registrieren bzw. Kontoseite mit „Meine Veröffentlichungen“ |
| `#/moderation` | Moderationsansicht (nur Moderatoren) |

### Rechtliches
Vor dem Livegang mit Backend: Datenschutzerklärung (Hosting, Supabase mit AV-Vertrag, Mailanbieter, gespeicherte Daten,
Löschung), Kontolöschung in der App und ein vollständiges Impressum. Den Text der Datenschutzerklärung muss der Betreiber
selbst verantworten.
