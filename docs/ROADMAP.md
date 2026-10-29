# Roadmap

Arbeitsweise: Meilensteine der Reihe nach abarbeiten, Punkte abhaken (`[x]`).
Jeder Meilenstein endet mit grünen Tests (`npm test`), einem fehlerfreien `npm run typecheck` und einem Test auf einem echten Handy.

Strategie: Zuerst **einen** Typ (Rush Hour) als vollständigen Durchstich (Spielen, Bauen, Teilen), dann die anderen Typen.

---

## Phase 1: MVP (ohne Backend)

### M0 – Projekt-Setup
- [ ] `package.json` von Hand anlegen: Dependencies `lit-html`; DevDependencies `vite`, `typescript`. Versionen exakt pinnen (aktuelle stabile Version, nicht jünger als 14 Tage).
- [ ] Scripts: `dev`, `build`, `preview`, `typecheck`, `test` (siehe CLAUDE.md).
- [ ] `tsconfig.json` laut ARCHITEKTUR.md.
- [ ] `index.html`, `src/main.ts` mit einem „Hallo“-Template, `src/ui/styles.css` (CSS-Variablen, Hell- und Dunkelmodus, mobile Basis).
- [ ] `.gitignore`, `README.md` (kurz, verweist auf docs/).
- [ ] Prüfen: `node --test` führt eine Beispiel-`.test.ts` ohne Build aus.

### M1 – Core
- [ ] `core/types.ts`: `PuzzleDocument`, `PuzzleType`, `SolveResult`, Kontext-Typen.
- [ ] `core/grid.ts` mit Tests: Richtungen, Deltas, Rotation, In-Bounds-Prüfung.
- [ ] `core/store.ts` mit Tests.
- [ ] `core/router.ts`: Hash-Routen laut ARCHITEKTUR.md, unbekannte Route führt zum Start.
- [ ] `core/registry.ts` und `puzzles/index.ts`.
- [ ] `core/share.ts` mit Tests: Roundtrip encode/decode, kaputte und zu große Codes werden sauber abgelehnt.
- [ ] Play-View-Gerüst im Core: Undo/Redo, Neustart, Zugzähler, „Gelöst!“-Dialog.
- [ ] `i18n/de.ts` anlegen; alle UI-Texte von Anfang an darüber.

### M2 – Rush Hour (vertikaler Durchstich)
- [ ] `logic.ts` mit Tests: Kollision, Ränder, Züge, `isSolved`, `validate` (überlappende Blöcke, fehlender Zielblock, falsche Ausgangsachse).
- [ ] `solver.ts` mit Tests: Breitensuche, bekannte Beispielrätsel mit bekannter minimaler Zuganzahl, unlösbares Rätsel wird erkannt.
- [ ] `render.ts`: SVG-Spielfeld, Ziehen per Pointer Events mit Einrasten, Ausgang markiert, Zielblock hervorgehoben.
- [ ] 3–5 eingebaute Beispielrätsel.
- [ ] Spielbar über `#/play/...`.

### M3 – Editor-Grundlagen (am Beispiel Rush Hour)
- [ ] Generischer Grid-Editor (`ui/components/grid-editor.ts`): Größe, Palette, Platzieren, Drehen, Radieren, Editor-Undo.
- [ ] Rush-Hour-Editor: Blöcke der Länge 2 und 3, horizontal und vertikal, Zielblock, Ausgang setzen.
- [ ] Live-Validierung mit verständlichen Fehlermeldungen.
- [ ] Button „Probespielen“; erfolgreiches Lösen setzt `meta.verified`.
- [ ] Solver-Prüfung: Bei „unlösbar“ ist kein Teilen möglich; bei Erfolg wird `minMoves` angezeigt.

### M4 – Speichern und Teilen
- [ ] `core/storage.ts` (IndexedDB) mit Stores `puzzles` und `progress`.
- [ ] Bibliothek-View: eigene Rätsel auflisten, öffnen, duplizieren, löschen.
- [ ] Teilen-Dialog: Link erzeugen (nur wenn verifiziert), Linklänge anzeigen, `navigator.share` bzw. Zwischenablage.
- [ ] `#/p/<code>` öffnen: decode → migrate → validate → spielen; Fehlerseite bei kaputtem Link.
- [ ] „In meine Bibliothek kopieren“ für fremde Rätsel (zum Remixen).

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
