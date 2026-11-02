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
- [x] `logic.ts` mit Tests: Strahlverfolgung, Reflexionstabellen, Schleifenerkennung, mehrere Emitter, `isSolved`.
- [x] `solver.ts` mit Tests: Brute Force über drehbare Spiegel mit Limit.
- [x] `render.ts`: Strahl als animierte Polylinie, getroffene Ziele leuchten, Tippen dreht Spiegel.
- [x] Editor-Palette: Wand, Emitter (Richtung), Ziel, Spiegel fest/drehbar.
- [x] Beispielrätsel.

### M6 – Quiz
- [x] `core/hash.ts` und Normalisierung von Freitext mit Tests (Umlaute, Groß-/Kleinschreibung, Leerzeichen).
- [x] `logic.ts` mit Tests: Auswertung aller vier Fragearten, Bestehensgrenze.
- [x] Spiel-View: eine Frage pro Bildschirm, Fortschrittsanzeige, Ergebnis am Ende.
- [x] Editor: Formular-basiert (kein Raster), Fragen hinzufügen, sortieren, löschen; Fragetyp wählen.
- [x] Beispiel-Quiz.

### M7 – PWA und Veröffentlichung
- [x] `manifest.webmanifest`, Icons, `sw.js`; Installierbarkeit auf Android und iOS testen.
- [x] Startseite polieren: Typ-Kacheln, Beispielrätsel, „Selbst bauen“-Einstieg.
- [x] Barrierefreiheit: Tastaturbedienung für alle Typen, Fokus-Stile, ARIA-Labels, ausreichende Kontraste.
- [x] Deployment auf statisches Hosting (z. B. GitHub Pages per GitHub Action).
- [x] Impressum-Seite (in Deutschland auch für öffentlich erreichbare Hobbyseiten zu prüfen).

---

## Phase 2: Community (Backend)

Entschieden (Details in ARCHITEKTUR.md, Abschnitt „Phase 2: Backend“):
- **Supabase** in der EU-Region (Frankfurt), angesprochen per `fetch` ohne SDK.
- **Accounts** mit E-Mail und Passwort, optional. Spielen, Bauen und Teilen per Link bleiben ohne Account möglich.
- **Moderation:** Rätsel sind sofort sichtbar. Ab mehreren Meldungen werden sie automatisch ausgeblendet, bis ein Moderator sie prüft.
- **Likes und Schwierigkeitsbewertung** nur für angemeldete Nutzer. Den Spielzähler erhöhen auch anonyme Spieler.
- **Veröffentlichte Rätsel sind unveränderlich**; nur Titel und Beschreibung lassen sich ändern, und man kann sie zurückziehen.
  Eine Änderung am Inhalt bedeutet: neues Rätsel veröffentlichen.
- **Keine Synchronisierung** von Bibliothek und Fortschritt; das kommt erst in Phase 3.
- Die App bleibt eine statische Seite auf GitHub Pages. Ohne Backend-Konfiguration läuft sie wie in Phase 1,
  die Community-Funktionen sind dann ausgeblendet.

Strategie wie in Phase 1: erst ein dünner Durchstich (veröffentlichen und per Link öffnen), dann in die Breite.

### M8 – Backend-Grundlage
- [x] Vorab prüfen: aktuelle Free-Tier-Grenzen von Supabase (Pausieren nach Inaktivität, Speicher, Edge-Function-Laufzeit).
  (Stand 11/2026: Pausieren nach 7 Tagen ohne Aktivität, 500 MB Datenbank, 1 GB Storage, 500 000 Function-Aufrufe im Monat,
  2 s CPU-Zeit pro Function-Aufruf. Die alten `anon`-Keys schafft Supabase Ende 2026 ab; wir nutzen die neuen `sb_publishable_…`-Keys.)
- [x] Zwei Supabase-Projekte in Frankfurt anlegen: `dev` und `prod`. Der Free-Tier erlaubt zwei aktive Projekte.
- [x] Datenbankschema als SQL-Migrationen im Repo (`supabase/migrations/*.sql`), von Hand auf beide Projekte angewendet:
  `profiles`, `puzzles`, `likes`, `ratings`, `reports`. Zähler werden per Trigger gepflegt.
- [x] Row Level Security für jede Tabelle. Clients lesen nur sichtbare Rätsel und schreiben nur eigene Likes, Bewertungen und Meldungen.
  Rätsel selbst legt nur die Edge Function an (M10).
  (Anonymer Zugriff auf `dev` und `prod` geprüft: Lesen von Rätseln und Profilen erlaubt, alle Schreibzugriffe und interne
  Funktionen gesperrt. Die Regeln für angemeldete Nutzer und die Zähler-Trigger werden in M9/M10 geprüft, sobald es Accounts gibt.)
- [x] Konfiguration in `src/backend.ts` (Projekt-URL und Publishable Key aus `.env.development` bzw. `.env.production`).
  Fehlt sie, sind alle Community-Funktionen ausgeblendet.
  (`.env.production` kam mit M9, damit die Live-Seite das Backend erst nutzt, wenn die Accounts fertig sind.)
- [x] `core/api.ts`: kleiner `fetch`-Wrapper für PostgREST, Auth und Functions mit Timeout, einheitlichen Fehlertypen und
  deutschen Fehlermeldungen. Er ist mit gefälschtem `fetch` per `node --test` getestet.
- [x] Gegen das Pausieren: GitHub-Action-Cron (`keep-alive.yml`), die alle konfigurierten Projekte alle drei Tage mit einer leichten Abfrage weckt.
- [x] Service Worker: Anfragen an das Backend nie cachen. Offline zeigen Community-Seiten einen verständlichen Hinweis
  (Fehlertext `apiOffline`; die Seiten selbst kommen ab M9).
- [x] **Datenschutzerklärung** (`#/datenschutz`, Link im Footer neben dem Impressum): GitHub Pages, Supabase (AV-Vertrag, Region),
  Mailanbieter, Login-Token im `localStorage`, welche Daten gespeichert werden, Löschung und Betroffenenrechte.
  Wie beim Impressum bricht das Deployment ab, solange sie unvollständig ist. Rechtlich solltest du den Text selbst prüfen
  (z. B. mit einem Generator); ich kann nur einen Entwurf liefern.
  (Texte in `src/i18n/de.ts` unter `privacy…`, geprüft. Mailanbieter seit M9 in `src/privacy.ts`.)

### M9 – Accounts
- [x] **Entscheidung:** SMTP-Anbieter für Bestätigungs- und Reset-Mails (siehe „Offene Entscheidungen“) und in Supabase einrichten.
  (Brevo über `smtp-relay.brevo.com`, nur in `prod`; Microsoft 365 verworfen, siehe ARCHITEKTUR. Deutsche Vorlagen in `supabase/templates/`.)
- [x] Registrieren (Anzeigename, E-Mail, Passwort), E-Mail bestätigen, anmelden, abmelden, Passwort vergessen.
  (Bestätigung in `prod` Pflicht, in `dev` aus. Mail-Links werden vor dem Router ausgewertet, siehe ARCHITEKTUR.)
- [x] Sitzung: Tokens im `localStorage`, automatisches Erneuern des Access-Tokens; abgelaufene Sitzungen führen sauber zur Anmeldung.
- [x] Anzeigename: eindeutig, 3–20 Zeichen, kein HTML. Er wird bei Rätseln als Autor angezeigt.
  (Konten ohne Namen, z. B. per Einladung aus dem Dashboard, heißen erst `spieler_…`; Migration `0003_default_username.sql`.)
- [x] Kontoseite (`#/account`): Anzeigename ändern, Passwort ändern, **Konto löschen** (DSGVO).
  Das Löschen entfernt Profil, Likes, Bewertungen und eigene Rätsel.
  (Statt einer Edge Function eine Datenbankfunktion `delete_account()` mit `on delete cascade`, Migration `0002_accounts.sql`;
  so braucht es keinen Service-Role-Key.)
- [x] Anmeldestatus in der Kopfzeile; die Anmelde-Dialoge sind per Tastatur bedienbar und haben Labels.
- [x] Auf dem Handy testen: Ein Bestätigungslink aus der Mail öffnet die Seite, auch wenn die PWA installiert ist.
  (Getestet: Registrieren, Bestätigungslink und Passwort zurücksetzen auf der Live-Seite.)

(Live gegen `dev` geprüft: Registrieren, Anmelden, Erneuern, Umbenennen inkl. vergebener Namen, fremde Profile und
Moderator-Flag nicht änderbar, Passwort ändern, Abmelden, Konto löschen. Die Regeln für Likes, Bewertungen und Meldungen
folgen mit M10, wenn es veröffentlichte Rätsel gibt.)

### M10 – Veröffentlichen (Durchstich)
- [x] Edge Function `publish`: Sie nutzt denselben TypeScript-Code wie die App (`loadDocument`, `validate`, Solver)
  und prüft damit Format, Größenlimits und, wo ein Solver existiert, Lösbarkeit und `minMoves` selbst.
  Ein Quiz kann nicht serverseitig geprüft werden (die Lösungen sind gehasht); dort zählt „vom Ersteller gelöst“.
  (Logik in `src/core/publish.ts` und `src/server/publish-handler.ts`, getestet mit `node --test`. Dafür hat jeder Typ jetzt
  eine DOM-freie `rules.ts`. Serverseitiges Solver-Limit 40 000 Knoten wegen 2 s CPU; Deployment per GitHub Action.)
- [x] Doppelte Rätsel verhindern: eindeutiger Inhaltsschlüssel (der gleiche Hash wie `progressKey`).
- [x] Limit: höchstens N Veröffentlichungen pro Nutzer und Tag. (N = 10, in `publish_puzzle`, Migration `0004_publish.sql`.)
- [x] Im Editor: „Veröffentlichen“ neben „Teilen“. Der Knopf ist nur aktiv, wenn man angemeldet und das Rätsel verifiziert ist.
  Vorher kommt ein Bestätigungsdialog („Veröffentlicht = unveränderlich“).
- [x] Neue Route `#/g/<id>`: ein veröffentlichtes Rätsel spielen. Das gibt auch einen kurzen Teilen-Link.
  Fortschritt und Bestwert funktionieren automatisch über `progressKey`. „In Bibliothek kopieren“ geht wie bei geteilten Links.
- [x] „Meine Veröffentlichungen“ auf der Kontoseite: Titel und Beschreibung ändern, zurückziehen (löschen).
- [x] Spielzähler: eine Datenbankfunktion zählt einen Aufruf pro Gerät und Rätsel (im Browser gemerkt). Bewusst einfach und nicht fälschungssicher.
- [x] Live testen: veröffentlichen, doppelt veröffentlichen, Tageslimit, `#/g/<id>` auf dem Handy, ändern und zurückziehen.
  (Gegen `dev` automatisch geprüft, inkl. gefälschter Tokens und direktem Aufruf von `publish_puzzle`; Handy-Test erfolgreich.)

### M11 – Galerie
- [x] Route `#/gallery`, verlinkt von der Startseite und von jeder Typ-Kachel.
  (Filter stehen in der Route: `#/gallery?type=laser&level=2&sort=likes`.)
- [x] Filter: Typ, Schwierigkeit (bei Typen mit Solver Stufen aus `minMoves`, sonst aus Spielerbewertungen).
  (3 Stufen; Grenzen je Typ in `rules.ts` → `levels`. Quiz-Stufen kommen mit den Bewertungen in M12. Migration `0005_gallery.sql`.)
- [x] Sortierung: neu, beliebt (Likes), meistgespielt, schwierigste.
- [x] Seitenweises Nachladen (Keyset-Pagination, „Mehr laden“-Knopf statt Endlos-Scrollen).
- [x] Karten zeigen Titel, Autor, Typ, Schwierigkeit, Likes, und ob man das Rätsel schon gelöst hat (lokaler Fortschritt).
- [x] Startseite: Bereich „Neu in der Galerie“ mit den neuesten Rätseln.
- [x] Ladezustände, Fehler und Offline-Hinweis; Barrierefreiheit wie in M7 (Fokus, Labels, Live-Region beim Nachladen).
- [x] Name des Spiels: **Knobelkiste** (Titel, PWA-Manifest, Mail-Vorlagen).
- [x] Live testen: Galerie mit echten Rätseln (Filter, Sortierung, Nachladen), auch auf dem Handy.
  (Gegen `dev` geprüft: alle Sortierungen über mehrere Seiten, Typ- und Stufenfilter, „Schwierigste“-Reihenfolge,
  Spielzähler, Autor. Handy-Test erfolgreich.)

### M12 – Likes und Bewertungen
- [x] Like-Knopf (Herz) auf `#/g/<id>` und auf dem Gelöst-Bildschirm; ohne Anmeldung kommt ein Hinweis mit Anmelde-Link.
- [x] Schwierigkeitsbewertung (1–5) erst nach dem Lösen; man kann sie ändern.
  („Gelöst“ heißt: auf diesem Gerät gelöst, laut lokalem Fortschritt. Der Server kann das nicht prüfen.)
- [x] Durchschnitt und Anzahl der Bewertungen auf Karte und Spielseite, erst ab einer Mindestzahl an Stimmen.
  (Ab 3 Bewertungen. Für Rätsel ohne Zugzahl, also das Quiz, setzt ein Trigger daraus die Stufe; Migration `0006_ratings.sql`.)
- [x] Eigene Rätsel kann man nicht liken oder bewerten (über RLS geprüft).
- [x] Live testen: Stufe aus Bewertungen nach Migration 0006, Handy-Test.
  (Gegen `dev` geprüft: eigene/fremde/anonyme Likes und Bewertungen, doppelte Likes, Zähler, Bewertung ändern,
  Stufe aus Bewertungen (ab 3, folgt Änderungen, gemessene Stufen bleiben); in der Oberfläche Liken, Entliken und
  Bewerten als angemeldeter Nutzer. Handy-Test erfolgreich.)

### M13 – Melden und Moderation
- [x] Melden-Knopf mit Grund (unangemessen, Spam, nicht lösbar, Sonstiges) und optionalem Kommentar; eine Meldung pro Nutzer und Rätsel.
- [x] Ab der Schwelle (z. B. 3 Meldungen verschiedener Nutzer) wird ein Rätsel automatisch ausgeblendet (per Trigger).
  (`report_count` zählt jetzt offene Meldungen: Freigeben oder Ausblenden schließt sie und setzt den Zähler zurück.)
- [x] Moderatoren-Rolle (`profiles.is_moderator`, nur direkt in der Datenbank setzbar).
- [x] Moderationsansicht `#/moderation`: gemeldete und ausgeblendete Rätsel, Rätsel wieder freigeben, löschen, Meldungen schließen,
  Nutzer sperren und anstößige Anzeigenamen zurücksetzen.
  (Aktionen als Datenbankfunktionen `mod_…`, die selbst `is_moderator()` prüfen; Migration `0007_moderation.sql`.
  Moderatoren können so nicht gesperrt werden. Link von der Kontoseite, nur für Moderatoren sichtbar.)
- [x] Gesperrte Nutzer können nichts mehr veröffentlichen, liken oder melden.
- [x] Live testen (Skript mit einem Test-Moderator auf `dev`) und auf dem Handy.
  (Gegen `dev` geprüft: 26 Fälle zu Melden, Ausblenden, Freigeben, Sperren, Namen zurücksetzen, Löschen und den Rechten;
  Meldedialog und Moderationsseite im Browser; Handy-Test erfolgreich.)

### M14 – Bilder für Quizfragen
- [x] **Entscheidung im Meilenstein:** wie Quizze mit Bildern per Link geteilt werden.
  (Der Link funktioniert immer und zeigt statt der Bilder den Alternativtext; der Teilen-Dialog verweist auf „Veröffentlichen“.
  Der Kurzlink `#/g/<id>` eines veröffentlichten Quiz zeigt die Bilder.)
- [x] Quiz-Datenformat um optionales Bild pro Frage erweitern: `typeVersion` 2 mit `migrate` (CLAUDE.md, Regel 7).
- [x] Bild im Editor wählen; im Browser auf max. 1024 px verkleinern und als WebP kodieren, Limit z. B. 200 KB.
  Bis zum Veröffentlichen liegt das Bild lokal in IndexedDB.
  (WebP, wo der Browser es nicht kann JPEG; höchstens 10 Bilder pro Quiz.)
- [x] Upload nach Supabase Storage beim Veröffentlichen. Die Edge Function prüft Dateityp und Größe.
  (Und den Hash; scheitert der Upload, wird das Rätsel zurückgenommen. Migration `0008_images.sql`.)
- [x] Alternativtext pro Bild ist Pflicht (Barrierefreiheit).
- [x] Moderation: Bilder erscheinen in der Moderationsansicht; beim Löschen eines Rätsels werden seine Bilder mitgelöscht.
  (Täglicher Aufräumjob `cleanup-images`, weil Storage-Dateien nicht per SQL gelöscht werden können.)
- [ ] Live testen: Quiz mit Bildern veröffentlichen, spielen, kopieren, zurückziehen und Aufräumjob; Handy-Test.

## Phase 3: Ausbau
- [ ] Geräteübergreifende Synchronisierung von Bibliothek und Fortschritt mit dem Account.
- [ ] Weitere Typen: Sokoban, Rohre, Lights Out, Nonogramm, Klotski (als Rush-Hour-Variante), Eis-Rutschen …
- [ ] Laser-Erweiterungen (Inventar, Strahlteiler, Farben).
- [ ] Rätsel-Ketten bzw. Escape-Modus.
- [ ] Ranglisten (wenigste Züge, schnellste Zeit), tägliches Rätsel.
- [ ] Optional: App-Store-Versionen via Capacitor.

---

## Offene Entscheidungen
- [x] Name des Spiels: **Knobelkiste**.
- [ ] Visueller Stil (Farbpalette, flach oder verspielt).
- [x] Backend für Phase 2: Supabase (EU-Region).
- [x] SMTP-Anbieter für Account-Mails: Brevo (Absender-Domain `stits.dev`).
- [ ] Wird Englisch als zweite Sprache schon in Phase 1 benötigt?
