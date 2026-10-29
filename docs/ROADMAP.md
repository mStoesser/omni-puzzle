# Roadmap

Arbeitsweise: Meilensteine der Reihe nach abarbeiten, Punkte abhaken (`[x]`).
Jeder Meilenstein endet mit grünen Tests (`npm test`), einem fehlerfreien `npm run typecheck` und einem Test auf einem echten Handy.

Strategie: Zuerst **einen** Typ (Rush Hour) als vollständigen Durchstich (Spielen, Bauen, Teilen), dann die anderen Typen.

---

## Phase 1: MVP (ohne Backend)

### M0 – Projekt-Setup
- [x] `package.json` von Hand anlegen: Dependencies `lit-html`; DevDependencies `vite`, `typescript`. Versionen exakt pinnen (aktuelle stabile Version, nicht jünger als 14 Tage).
- [x] Scripts: `dev`, `build`, `preview`, `typecheck`, `test` (siehe CLAUDE.md).
- [x] `tsconfig.json` laut ARCHITEKTUR.md.
- [x] `index.html`, `src/main.ts` mit einem „Hallo“-Template, `src/ui/styles.css` (CSS-Variablen, Hell- und Dunkelmodus, mobile Basis).
- [x] `.gitignore`, `README.md` (kurz, verweist auf docs/).
- [x] Prüfen: `node --test` führt eine Beispiel-`.test.ts` ohne Build aus.

### M1 – Core
- [x] `core/types.ts`: `PuzzleDocument`, `PuzzleType`, `SolveResult`, Kontext-Typen.
- [x] `core/grid.ts` mit Tests: Richtungen, Deltas, Rotation, In-Bounds-Prüfung.
- [x] `core/store.ts` mit Tests.
- [x] `core/router.ts`: Hash-Routen laut ARCHITEKTUR.md, unbekannte Route führt zum Start.
- [x] `core/registry.ts` und `puzzles/index.ts`.
- [x] `core/share.ts` mit Tests: Roundtrip encode/decode, kaputte und zu große Codes werden sauber abgelehnt.
- [x] Play-View-Gerüst im Core: Undo/Redo, Neustart, Zugzähler, „Gelöst!“-Dialog.
- [x] `i18n/de.ts` anlegen; alle UI-Texte von Anfang an darüber.

### M2 – Rush Hour (vertikaler Durchstich)
- [x] `logic.ts` mit Tests: Kollision, Ränder, Züge, `isSolved`, `validate` (überlappende Blöcke, fehlender Zielblock, falsche Ausgangsachse).
- [x] `solver.ts` mit Tests: Breitensuche, bekannte Beispielrätsel mit bekannter minimaler Zuganzahl, unlösbares Rätsel wird erkannt.
- [x] `render.ts`: SVG-Spielfeld, Ziehen per Pointer Events mit Einrasten, Ausgang markiert, Zielblock hervorgehoben.
- [x] 3–5 eingebaute Beispielrätsel.
- [x] Spielbar über `#/play/...`.

### M3 – Editor-Grundlagen (am Beispiel Rush Hour)
- [x] Generischer Grid-Editor (`ui/components/grid-editor.ts`): Größe, Palette, Platzieren, Drehen, Radieren, Editor-Undo.
- [x] Rush-Hour-Editor: Blöcke der Länge 2 und 3, horizontal und vertikal, Zielblock, Ausgang setzen.
- [x] Live-Validierung mit verständlichen Fehlermeldungen.
- [x] Button „Probespielen“; erfolgreiches Lösen setzt `meta.verified`.
- [x] Solver-Prüfung: Bei „unlösbar“ ist kein Teilen möglich; bei Erfolg wird `minMoves` angezeigt.

### M4 – Speichern und Teilen
- [x] `core/storage.ts` (IndexedDB) mit Stores `puzzles` und `progress`.
- [x] Bibliothek-View: eigene Rätsel auflisten, öffnen, duplizieren, löschen.
- [x] Teilen-Dialog: Link erzeugen (nur wenn verifiziert), Linklänge anzeigen, `navigator.share` bzw. Zwischenablage.
- [x] `#/p/<code>` öffnen: decode → migrate → validate → spielen; Fehlerseite bei kaputtem Link.
- [x] „In meine Bibliothek kopieren“ für fremde Rätsel (zum Remixen).

### M5 – Laser & Spiegel
- [ ] `logic.ts` mit Tests: Strahlverfolgung, Reflexionstabellen, Schleifenerkennung, mehrere Emitter, `isSolved`.
- [ ] `solver.ts` mit Tests: Brute Force über drehbare Spiegel mit Limit.
- [ ] `render.ts`: Strahl als animierte Polylinie, getroffene Ziele leuchten, Tippen dreht Spiegel.
- [ ] Editor-Palette: Wand, Emitter (Richtung), Ziel, Spiegel fest/drehbar.
- [ ] Beispielrätsel.

### M6 – Quiz
- [ ] `core/hash.ts` und Normalisierung von Freitext mit Tests (Umlaute, Groß-/Kleinschreibung, Leerzeichen).
- [ ] `logic.ts` mit Tests: Auswertung aller vier Fragearten, Bestehensgrenze.
- [ ] Spiel-View: eine Frage pro Bildschirm, Fortschrittsanzeige, Ergebnis am Ende.
- [ ] Editor: Formular-basiert (kein Raster), Fragen hinzufügen, sortieren, löschen; Fragetyp wählen.
- [ ] Beispiel-Quiz.

### M7 – PWA und Veröffentlichung
- [ ] `manifest.webmanifest`, Icons, `sw.js`; Installierbarkeit auf Android und iOS testen.
- [ ] Startseite polieren: Typ-Kacheln, Beispielrätsel, „Selbst bauen“-Einstieg.
- [ ] Barrierefreiheit: Tastaturbedienung für alle Typen, Fokus-Stile, ARIA-Labels, ausreichende Kontraste.
- [ ] Deployment auf statisches Hosting (z. B. GitHub Pages per GitHub Action).
- [ ] Impressum-Seite (in Deutschland auch für öffentlich erreichbare Hobbyseiten zu prüfen).

---

## Phase 2: Community (Backend)
- [ ] Backend wählen (Supabase oder PocketBase, siehe ARCHITEKTUR.md).
- [ ] Optionale Accounts; anonymes Spielen bleibt möglich.
- [ ] Veröffentlichen (nur verifizierte Rätsel), Galerie mit Filtern und Sortierung.
- [ ] Likes, Schwierigkeitsbewertung durch Spieler, Spielzähler.
- [ ] Melden-Funktion und einfache Moderationsansicht.
- [ ] Bilder für Quizfragen (Upload, Größenlimit).
- [ ] Datenschutzerklärung.

## Phase 3: Ausbau
- [ ] Weitere Typen: Sokoban, Rohre, Lights Out, Nonogramm, Klotski (als Rush-Hour-Variante), Eis-Rutschen …
- [ ] Laser-Erweiterungen (Inventar, Strahlteiler, Farben).
- [ ] Rätsel-Ketten bzw. Escape-Modus.
- [ ] Ranglisten (wenigste Züge, schnellste Zeit), tägliches Rätsel.
- [ ] Optional: App-Store-Versionen via Capacitor.

---

## Offene Entscheidungen
- [ ] Name des Spiels.
- [ ] Visueller Stil (Farbpalette, flach oder verspielt).
- [ ] Backend für Phase 2.
- [ ] Wird Englisch als zweite Sprache schon in Phase 1 benötigt?
