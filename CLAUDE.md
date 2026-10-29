# Rätselspiel – Projektkontext für Claude Code

Hobbyprojekt: Eine Web-App (Browser + Handy als PWA), in der man Rätsel verschiedener Typen spielen,
**selbst bauen** und **per Link teilen** kann. Später kommt eine öffentliche Galerie dazu.

Ausführliche Dokumentation:
- `docs/KONZEPT.md` – Vision, Zielgruppe, Rätseltypen-Katalog, Vorbilder
- `docs/ARCHITEKTUR.md` – Technik, Ordnerstruktur, Plugin-Schnittstelle, Datenformate, Teilen per Link
- `docs/ROADMAP.md` – Meilensteine mit Checklisten (hier den aktuellen Stand pflegen)

## Tech-Stack (bewusst minimal)

- **Laufzeit-Abhängigkeit:** nur `lit-html` (Templates, auch SVG via `svg`-Tag).
- **Dev-Abhängigkeiten:** nur `vite` und `typescript`.
- **Tests:** eingebauter Node-Testrunner (`node --test`) mit nativem TypeScript-Type-Stripping (Node ≥ 22.18, besser 24 LTS). Kein Vitest/Jest.
- **Alles andere nativ:** Hash-Router, Store, IndexedDB, `CompressionStream`, `crypto.subtle`, Pointer Events, Service Worker – selbst geschrieben, keine Bibliotheken.
- Kein Backend in Phase 1. Hosting statisch (z. B. GitHub Pages).

## Befehle

```bash
npm run dev        # Vite-Dev-Server
npm run build      # Produktions-Build nach dist/
npm run typecheck  # tsc --noEmit
npm test           # node --test "src/**/*.test.ts"
```

## Regeln für die Arbeit an diesem Projekt

1. **Keine neuen npm-Pakete** ohne ausdrückliche Rückfrage. Erst prüfen, ob es nativ geht.
2. Versionen in `package.json` **exakt pinnen** (kein `^`/`~`).
3. **Nur „erasable“ TypeScript-Syntax** (`erasableSyntaxOnly`): keine `enum`s, keine `namespace`s, keine Parameter-Properties. Stattdessen Union-Typen und `as const`-Objekte. Typ-Importe immer mit `import type`. Relative Importe mit `.ts`-Endung.
4. **Logik ist rein und DOM-frei.** `logic.ts` und `solver.ts` eines Rätseltyps importieren nichts aus `lit-html` oder dem DOM und sind vollständig mit `node --test` getestet. Zustände werden nicht mutiert (Züge liefern neuen Zustand).
5. **Jeder Rätseltyp ist ein eigenständiges Modul** unter `src/puzzles/<typ>/`. Ein neuer Typ darf den Core nur über die Registrierung in `src/puzzles/index.ts` berühren. Wenn der Core erweitert werden muss, ist das eine bewusste, separate Änderung.
6. **Mobile first:** Touch-Bedienung zuerst denken, Pointer Events statt Maus-/Touch-Events, Tap-Ziele ≥ 44 px, Spielfeld skaliert per SVG-`viewBox`.
7. Jede Änderung am Rätsel-Datenformat erhöht die `typeVersion` und bekommt eine `migrate`-Funktion, damit alte geteilte Links weiter funktionieren.
8. Kleine Schritte: einen Punkt aus `docs/ROADMAP.md` umsetzen, testen, abhaken.

## Konventionen

- Code, Bezeichner und Code-Kommentare auf **Englisch**.
- UI-Texte auf **Deutsch**, aber zentral in `src/i18n/de.ts` (damit später andere Sprachen möglich sind).
- Dokumentation auf **Deutsch**.
- Dateinamen: `kebab-case.ts`, Tests daneben als `*.test.ts`.
