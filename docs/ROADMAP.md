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
- [x] Live testen: Quiz mit Bildern veröffentlichen, spielen, kopieren, zurückziehen und Aufräumjob; Handy-Test.
  (Gegen `dev` geprüft: fehlende und falsche Bilder abgelehnt, Bild öffentlich als WebP abrufbar, Anzeige auf `#/g/<id>`,
  Kopie in die Bibliothek mit Bild, Aufräumjob löscht Bilder zurückgezogener Rätsel und lässt vorhandene stehen.
  Handy-Test erfolgreich. Die App meldet jetzt, wenn ein altes App-Fenster den Gerätespeicher beim Update blockiert.)

### M15 – Redesign der App-Hülle
Vorlage: `docs/design-handoff/` (Spezifikation, Tokens, Entwürfe). Die Darstellung der Rätsel selbst bleibt unverändert.
- [x] Design-Tokens (`src/ui/tokens.css`), Schriften Inter und Space Grotesk selbst gehostet (OFL), Theme über
  `data-theme` auf `<html>`; Dunkel ist Standard, Hell und System wählbar.
  (Die alten CSS-Variablen bleiben als Aliase, weil die Rätsel-Komponenten sie nutzen. Rushhour und Laser wählen ihre
  dunklen Farben jetzt nach `data-theme` statt nur nach der Systemeinstellung, die Farbwerte sind gleich.)
- [x] Jeder Rätseltyp hat ein Linien-Symbol und eine Typfarbe (`PuzzleType.icon` als SVG, `PuzzleType.color`) statt Emoji.
- [x] Komponenten: eigenes Linien-Icon-Set, Buttons, Icon-Button, Segment, Chips, Badges, Karten, Stat-Kacheln,
  Einstellungs-Listen, Bottom-Sheet, Popover-Menü, Tab-Leiste (mobil) und obere Navigation (Desktop, ab 900 px).
- [x] Start: Begrüßung, Bau-Banner, Typ-Kacheln mit Fortschritt (Level mobil im Sheet, Desktop direkt in der Karte),
  „Neu in der Galerie“.
- [x] Spiel: Kopf mit Typ · Level und Mehr-Menü, Stat-Kacheln, Spielfeld-Container, Steuerleiste; Gelöst als Bottom-Sheet
  (optimal / nicht optimal, Like, Bewertung, nächstes Rätsel, Remixen).
- [x] Galerie: Typ-Chips, Trefferzahl, Schwierigkeit und Sortierung, Rätsel-Karten mit Autor und relativer Zeit.
- [x] Editor: Kopf mit tippbarem Titel, Segment Bauen/Probespielen (Probespielen im Editor-Rahmen), Live-Prüfung als
  Statuszeile, Werkzeug-Raster; Teilen-Sheet mit „Per Link“ und „In der Galerie veröffentlichen“ samt Prüfliste.
- [x] Meine Rätsel: Listenkarten mit Status-Badge und Mehr-Menü (Bearbeiten, Spielen, Duplizieren, Löschen).
- [x] Profil: Stats, Einstellungsgruppen (Anzeigename, Passwort, Veröffentlichungen als Sheets), Darstellung auch ohne Konto,
  Rechtliches, Abmelden, Gefahrenbox.
- [x] Desktop: Spiel mit Seitenleiste (Stats, So geht’s, weitere Level, Remixen), Editor dreispaltig
  (Werkzeuge, Bau-Fläche, Prüfung und Einstellungen).
- [x] Im Browser mit den Entwürfen verglichen (mobil 390 px, Desktop 1280/1440 px, dunkel und hell).
- [x] Live testen auf dem Handy, auch mit einem echten veröffentlichten Rätsel (Like-Zeile im Gelöst-Sheet).
  (Zwei Fehler gefunden und behoben: Das Gelöst-Sheet schloss sich nach dem lösenden Tipp sofort wieder, weil der
  folgende Klick den Sheet-Hintergrund traf; mit Einträgen in „Neu in der Galerie“ wurde die Seite breiter als der
  Bildschirm und die Tab-Leiste verrutschte. Danach Handy-Test erfolgreich.)

## Phase 3: Ausbau

Entschieden (11/2026):
- **Reihenfolge:** erst Inhalte (neue Typen, Laser-Erweiterungen), dann Community-Funktionen (Ketten, Ranglisten,
  tägliches Rätsel), zuletzt Infrastruktur (Synchronisierung, Englisch).
- **Neue Typen:** Eis-Rutschen, Sokoban, Klotski, Lights Out, Rohre, Nonogramm. Die übrigen Typen aus dem Katalog bleiben „später“.
- **Rätsel-Ketten** bestehen aus veröffentlichten Galerie-Rätseln. Eine Kette ist ein eigener Datensatz im Backend, der auf
  `#/g/<id>` verweist; ohne Backend gibt es keine Ketten.
- **Ranglisten:** Die Zugfolge wird mitgeschickt, und der Server spielt sie mit `rules.ts` nach. So sind „gelöst“ und die
  Zugzahl geprüft. Die Zeit kommt ungeprüft vom Client. Für das Quiz gibt es keine Rangliste.
- **Tägliches Rätsel:** wird automatisch aus der Galerie gewählt; Moderatoren können Tage vorausplanen und überschreiben.
- **Synchronisierung:** Einträge werden einzeln zusammengeführt. Beim Fortschritt zählt „irgendwo gelöst“ und der beste Wert,
  bei Rätseln gewinnt die neuere Änderung. Löschungen werden als Grabstein gespeichert. Bilder werden mitsynchronisiert.
- **Sprachen:** Englisch als zweite Oberflächensprache. Rätsel bekommen zusätzlich eine optionale Sprache (`meta.lang`),
  nach der die Galerie filtern kann.
- **Capacitor** ist aus Phase 3 herausgenommen (siehe „Irgendwann“ unten).

Strategie wie bisher: kleine Meilensteine, jeder endet mit Tests, Typecheck und Handy-Test. Vor jedem Meilenstein, der das
Backend ändert: Migration erst auf `dev`, live prüfen, dann `prod`.

#### Checkliste für jeden neuen Rätseltyp
Sie gilt für M17–M22 zusätzlich zu den dort genannten Punkten:
- Eigenes Modul `src/puzzles/<typ>/` mit `rules.ts`, `logic.ts`, `solver.ts` (falls sinnvoll), `edit.ts`, `render.ts`,
  `editor.ts`, `examples.ts`; Logik, Solver und Editor-Funktionen vollständig mit `node --test` getestet.
- Registrierung in `src/puzzles/index.ts` und `src/puzzles/rules.ts`; `levels` (Zuggrenzen leicht/mittel) an den Beispielen kalibriert.
- Linien-Symbol, Typfarbe (dunkel/hell, Kontrast geprüft), Name und Beschreibung in `i18n/de.ts`.
- Tastaturbedienung, ARIA-Labels, `describe(x, y)` im Editor, `prefers-reduced-motion`.
- Größenlimits in `validate`; Solver-Laufzeit gegen das Server-Limit (40 000 Knoten, 2 s CPU) gemessen.
- 3–5 Beispielrätsel mit bekannter minimaler Zugzahl.
- Linklänge typischer Rätsel unter 2 000 Zeichen.
- Live testen: bauen, probespielen, per Link teilen, veröffentlichen (Edge Function nach dem Deployment), in der Galerie
  filtern; Handy-Test.
- ARCHITEKTUR.md: Abschnitt zum Typ (Datenformat, Regeln, Solver, Bedienung).

### M16 – Core-Vorbereitung für neue Typen
Eine bewusste Änderung am Core (CLAUDE.md, Regel 5), bevor die Typen kommen.
- [x] `core/search.ts`: generische Breitensuche (Zustandsschlüssel, Nachfolger, Ziel, `maxNodes`) mit Tests; der
  Rush-Hour-Solver nutzt sie ohne Verhaltensänderung (bestehende Solver-Tests bleiben grün).
- [x] Richtungs-Eingabe für Spielfiguren (`ui/components/swipe.ts`): Wischen per Pointer Events mit Mindestweg,
  Pfeiltasten und WASD; vier Schaltflächen als Alternative für Bedienhilfen.
  (Reine Logik `swipeDir`/`keyDir` in `core/grid.ts`. Im Browser mit einem vorübergehenden Platzhalter-Typ geprüft;
  der erste echte Nutzer ist M17.)
- [x] Grid-Editor: Malen durch Ziehen (ein Zug malt mehrere Felder, ergibt einen Undo-Schritt), z. B. für Wände und Nonogramm-Pixel.
  (Palette `paint: true`, `onPaint`, `ctx.update(data, group)`. Schon genutzt: Wand und Radierer im Laser-Editor,
  Radierer bei Rush Hour.)
- [x] Bei 9 Typen müssen die Typ-Kacheln auf der Startseite, die Typ-Chips der Galerie und das Typ-Auswahl-Sheet „Neu bauen“
  mitwachsen (Raster bzw. waagrecht scrollbar, mobil und Desktop prüfen).
  (Mit 6 Platzhalter-Typen bei 390 px und 1280 px geprüft: kein waagrechter Überlauf, Chips scrollen mobil, das Sheet
  scrollt. Es war keine Änderung nötig. Der Text „Weitere Typen folgen: Sokoban, Nonogramm …“ muss angepasst werden,
  sobald diese Typen da sind.)
- [x] Prüfen, ob die alte, gecachte PWA bei einem unbekannten Typ (Link auf einen neuen Typ) sauber die Fehlerseite
  „unbekannter Typ“ zeigt und auf ein Update hinweist.
  (Die Fehlerseite bietet bei „unbekannter Typ“ und „neuere Version“ jetzt „Neu laden“ an, offline mit Hinweis; das gilt auch
  für eigene Rätsel.)
- [x] Handy-Test: im Laser-Editor Wände ziehen und mit einmal Rückgängig entfernen, Radierer ziehen; Seite beim Ziehen
  scrollt nicht.
  (Erfolgreich, auch Radierer bei Ausparken und die Fehlerseite „unbekannter Typ“ mit „Neu laden“. Dabei gefunden und behoben: Über den Dev-Server im LAN (http, kein sicherer Kontext) fehlt `crypto.randomUUID`, neue
  Rätsel ließen sich dort nicht anlegen („Diesen Rätseltyp gibt es nicht“). `newPuzzleId` nutzt jetzt `getRandomValues`.)

### M17 – Eis-Rutschen (`ice`)
Der einfachste Typ mit Spielfigur. Er testet die Richtungs-Eingabe aus M16.
- [x] Datenformat: Raster mit Wand, Ziel und Start, dazu optional **Sandfeld**, auf dem die Figur anhält.
  Ein Zug ist eine Richtung; die Figur rutscht, bis eine Wand oder der Rand sie stoppt.
  (Wand heißt im Spiel „Fels“; 3–14 Felder je Seite.)
- [x] Gelöst, wenn die Figur **auf** dem Ziel stehen bleibt. Wer nur darüber hinwegrutscht, hat nicht gelöst.
- [x] Solver: Breitensuche über die Position (`core/search.ts`), liefert `minMoves`.
  (Stufen: bis 4 Züge leicht, bis 9 mittel. Vier Beispiele mit 3, 5, 8 und 12 Zügen, per Skript erzeugt.)
- [x] Darstellung: Rutschen animiert; Wischen oder Pfeiltasten; Tippen auf ein Feld in gerader Linie rutscht dorthin.
  (Dazu die Richtungsknöpfe aus M16. `swipeEnd` meldet jetzt auch `"tap"`.)
- [x] Editor: Wand (ziehend malen), Sand, Start, Ziel, Radierer; Validierung: genau ein Start und mindestens ein Ziel.
- [x] Checkliste für neue Typen: Tests (Logik, Solver, Editor, Beispiele; ein neuer Test prüft alle Beispiele gegen die
  Server-Prüfung `preparePublication`), Registrierung, Symbol und Farbe, Barrierefreiheit, Linklänge (Beispiele unter
  350 Zeichen, ein halb gefülltes 14×14-Feld etwa 650), ARCHITEKTUR.md.
  Im Browser über die LAN-Adresse geprüft: Spielen mit Wischen, Tippen, Tasten und Richtungsknöpfen, Gelöst-Sheet,
  Editor (malen, Start versetzen, probespielen, teilen), hell und dunkel, mobil und Desktop.
- [x] Handy-Test (Spielen mit Wischen, Tippen und Richtungsknöpfen; Editor) erfolgreich.
- [x] Live testen: veröffentlichen (Edge Function wird erst beim Push deployt), in der Galerie nach Typ filtern.

### M18 – Sokoban (`sokoban`)
- [x] Datenformat: Raster mit Wand, Boden, Ziel, Kiste, Kiste auf Ziel und Spielfigur; höchstens z. B. 20×20.
  Ein Zug ist ein Schritt; ein Schritt, der eine Kiste schiebt, zählt ebenfalls als ein Zug.
  (Im XSB-Textformat, eine Zeichenkette pro Zeile; Links um 230 Zeichen.)
- [x] Validierung: genau eine Figur, gleich viele Kisten wie Ziele (mindestens eine).
- [x] Solver: Breitensuche nach Schritten über (Figur, Kisten), Kisten sortiert im Zustandsschlüssel; Pruning über tote
  Felder (Ecken ohne Ziel). Bricht er ab (auch serverseitig), wird ohne `minMoves` veröffentlicht, und die Stufe kommt aus
  Bewertungen wie beim Quiz.
  (Tote Felder allgemein: von dort kann eine Kiste nie mehr auf ein Ziel. Stufen bis 20 / bis 50 Schritte. Vier Beispiele mit
  12, 29, 42 und 53 Schritten, alle innerhalb des Server-Limits lösbar.)
- [x] Bedienung: Wischen, Pfeiltasten, Tippen auf ein erreichbares Feld läuft dorthin (Wegsuche ohne Schieben,
  zählt als mehrere Schritte); Undo pro Schritt.
  (Dazu: Tippen auf eine Kiste neben der Figur schiebt sie. Der Laufweg stoppt bei Undo und jeder anderen Eingabe.)
- [x] Editor: Wände ziehend malen, Kiste, Ziel, Figur, Radierer.
- [x] Entscheidung im Meilenstein: Sollen in der Rangliste Schritte oder Schiebe-Züge zählen? (Standard: Schritte, wie der Zugzähler.)
  (Schritte, wie vorgeschlagen; bei Bedarf in M25 nochmal ansehen.)
- [x] Checkliste für neue Typen. Im Browser über die LAN-Adresse geprüft: Spielen mit Wischen, Tasten, Richtungsknöpfen,
  Laufen und Schieben per Tippen, Undo während eines Laufwegs, Gelöst-Sheet; Editor (Kisten/Ziele-Prüfung, tote Ecke,
  Wand-Strich mit Undo, Probespielen), hell und dunkel, mobil und Desktop.
- [x] Handy-Test, dabei auch: Wie lange friert der Editor bei einem großen, offenen Lager ein (Solver-Abbruch nach 200 000
  Knoten)? Falls störend: Solver-Limit pro Typ.
- [x] Live testen: veröffentlichen (nach dem Push), in der Galerie nach Typ filtern.

### M19 – Klotski (`klotski`)
Eine Variante von Rush Hour, aber als eigenes Modul (Regel 5): Gemeinsames kommt in den Core oder wird bewusst kopiert.
- [x] Datenformat: rechteckige Blöcke 1×1, 1×2, 2×1, 2×2 (größere später), genau ein Zielblock, Ausgang an einer Kante
  in Breite des Zielblocks.
  (Ausgang als Seite und Startfeld; seine Breite ergibt sich aus dem Zielblock. 3–10 Felder je Seite, höchstens 50 Blöcke.
  Rush-Hour-Code bewusst kopiert und angepasst, kein neuer Core-Code nötig.)
- [x] Ein Zug verschiebt einen Block beliebig weit über freie Felder, auch um Ecken (klassische Zählweise).
  Gelöst, wenn der Zielblock am Ausgang steht.
- [x] Solver: Breitensuche; im Zustandsschlüssel sind gleich große Blöcke austauschbar (Kanonisierung), sonst explodiert
  der Suchraum. Test mit dem klassischen „Huarong Dao“-Aufbau, bekannte Lösung 81 Züge.
  (81 Züge in etwa 0,2 s, innerhalb des Server-Limits von 40 000 Knoten. Stufen: bis 12 Züge leicht, bis 35 mittel.
  Vier Beispiele mit 5, 17, 37 und 81 Zügen; die ersten drei per Skript erzeugt, das letzte ist Huarong Dao.)
- [x] Darstellung: Ziehen mit Einrasten in alle Richtungen (Pointer Capture), Tastatur wie bei Rush Hour.
  (Der Klotz springt beim Ziehen auf die erreichbare Position, die dem Finger am nächsten ist, und gleitet zur nächsten;
  so lässt er sich um Ecken führen. Absetzen und Undo sind animiert, außer bei `prefers-reduced-motion`.)
- [x] Editor: Blockgrößen als Werkzeuge, Zielblock, Ausgang am Randring.
  (Ein Größen-Werkzeug auf einem Klotz ändert seine Größe; passt ein neuer Klotz nicht, wird er nach links/oben versetzt.
  Der Ausgang rückt zurück, wenn er für einen breiteren Zielblock nicht mehr passt.)
- [x] Checkliste für neue Typen: Tests (Logik, Solver, Editor, Beispiele samt Server-Prüfung), Registrierung, Symbol und
  Farbe, Barrierefreiheit, Linklänge (Beispiele um 350 Zeichen, ein 10×10-Brett mit 50 Klötzen etwa 520), ARCHITEKTUR.md.
  Solver im Editor bei einem großen, offenen Brett: Abbruch nach 200 000 Knoten in etwa 0,6 s am Desktop.
  Im Browser über die LAN-Adresse geprüft (Headless Chrome, 390 px): zwei Beispiele per Ziehen optimal gelöst,
  Tastatur (Pfeile, Enter = ein Zug), blockierter Klotz bleibt stehen, Editor, hell und dunkel, Startseite.
- [x] Handy-Test (Ziehen um Ecken, Tastatur; Editor) erfolgreich.
- [x] Live testen: veröffentlichen (nach dem Push), in der Galerie nach Typ filtern.

### M20 – Lights Out (`lightsout`)
- [x] Datenformat: Raster (höchstens z. B. 10×10) mit aktiven Feldern (Löcher für unregelmäßige Formen) und Startmuster der Lichter.
  Tippen schaltet das Feld und seine vier Nachbarn um; gelöst, wenn alle Lichter aus sind.
  (Textzeilen wie bei Sokoban: `.` aus, `*` an, `#` Loch; 3–10 Felder je Seite; Links um 210 Zeichen.)
- [x] Solver: Gauß-Elimination über GF(2), danach den Nullraum durchprobieren (mit Limit) für die minimale Zahl an Tipps.
  Erkennt unlösbare Muster sofort.
  (Bitsets, Nullraum per Gray-Code; 2^k Kombinationen zählen als Knoten, darüber „abgebrochen“. 10×10 in etwa 1 ms.
  Test gegen Brute Force auf kleinen Brettern mit Löchern; 5×5 ganz an braucht 15 Tipps.
  Stufen: bis 4 Tipps leicht, bis 9 mittel. Vier Beispiele mit 3, 6, 10 und 14 Tipps, per Skript erzeugt.)
- [x] Editor mit zwei Modi: „Lichter setzen“ (direkt, der Solver prüft) und „Rückwärts tippen“ (Züge auf dem leeren Feld,
  ergibt immer ein lösbares Rätsel).
  (Als Werkzeuge im Raster: „Rückwärts tippen“, „Licht“, dazu „Loch“ und Radierer; Licht, Loch und Radierer ziehend.)
- [x] Darstellung: Umschalten animiert, Zugzähler, Tastatur per roving tabindex.
  (Pfeiltasten überspringen Löcher, Enter/Leertaste schaltet. Lichter sind gelb mit Glühen und Punkt, aus ist dunkelgrau,
  in beiden Themes.)
- [x] Checkliste für neue Typen: Tests (Logik, Solver, Editor, Beispiele samt Server-Prüfung), Registrierung, Symbol und
  Farbe, Barrierefreiheit, Linklänge (ein zufälliges 10×10-Brett etwa 240 Zeichen), ARCHITEKTUR.md.
  Im Browser über die LAN-Adresse geprüft (Headless Chrome, 390 px): zwei Beispiele per Antippen optimal gelöst, Tastatur
  (Löcher übersprungen, Enter = ein Zug), Editor, hell und dunkel.
- [x] Handy-Test (Antippen, Editor mit beiden Modi) erfolgreich.
- [x] Live testen: veröffentlichen (nach dem Push), in der Galerie nach Typ filtern.

### M21 – Rohre (`pipes`)
- [x] Datenformat: Kacheln Ende, Gerade, Kurve, T, Kreuz, Quelle; je Kachel eine Drehung und „drehbar/fest“.
  Tippen dreht drehbare Kacheln um 90° im Uhrzeigersinn.
  (Je Zelle eine Hex-Ziffer als Bitmaske der Rohrenden in der Startdrehung, die Form ergibt sich daraus; Quelle als Position,
  feste Kacheln als Liste von Zellindizes. 3–10 Felder je Seite; Links um 250 Zeichen.)
- [x] Gelöst, wenn alle Rohre mit der Quelle verbunden sind und kein Rohrende offen ist. Schleifen sind erlaubt,
  damit Bauen einfach bleibt.
- [x] Solver: Backtracking mit Constraint-Propagation über die Drehungen; Kosten = nötige Drehungen im Uhrzeigersinn
  (0–3 pro Kachel), Branch & Bound für `minMoves`.
  (Wertebereich je Zelle als 16-Bit-Menge möglicher Masken; Pruning über Kosten-Untergrenze und Erreichbarkeit von der
  Quelle. Zufällige 10×10-Netze, auch mit vielen Schleifen, in wenigen Millisekunden. Test gegen Brute Force.
  Stufen: bis 12 Drehungen leicht, bis 30 mittel. Vier Beispiele mit 10, 20, 33 und 58 Drehungen, per Skript erzeugt.)
- [x] Editor: Rohre durch Ziehen von Feld zu Feld verlegen (die Kachelformen ergeben sich daraus), Quelle setzen,
  Knopf „Verdrehen“ dreht zufällig; Kacheln als fest markieren.
  (Dazu „Drehen“ für einzelne Kacheln und ein Radierer. Per Tastatur verbindet Enter auf zwei Nachbarfeldern nacheinander.
  Innerhalb eines Strichs zählt jedes Feld nur einmal (Grid-Editor); eine Schleife schließt man mit einem zweiten Strich.)
- [x] Darstellung: verbundene Rohre füllen sich farbig vom Ziel aus (Animation nur ohne `prefers-reduced-motion`).
  (Von der Quelle aus, gestaffelt nach Abstand; Drehen animiert. Feste Kacheln mit Nieten; Tastatur per roving tabindex.)
- [x] Checkliste für neue Typen: Tests (Logik, Solver, Editor, Beispiele samt Server-Prüfung), Registrierung, Symbol und
  Farbe, Barrierefreiheit, Linklänge (10×10 mit 20 festen Kacheln etwa 360 Zeichen), ARCHITEKTUR.md.
  Im Browser über die LAN-Adresse geprüft (Headless Chrome, 390 px): zwei Beispiele per Antippen optimal gelöst, feste Kachel
  dreht nicht, Tastatur, Rohr ziehen im Editor, hell und dunkel.
- [x] Handy-Test (Drehen, Rohre ziehen im Editor, Verdrehen) erfolgreich.
- [x] Live testen: veröffentlichen (nach dem Push), in der Galerie nach Typ filtern.

### M22 – Nonogramm (`nonogram`)
- [x] Datenformat: Breite, Höhe und **nur die Hinweiszahlen** je Zeile und Spalte, nicht das Lösungsbild. So lässt sich
  im Link nicht spicken, und gelöst heißt: Alle Zeilen und Spalten erfüllen ihre Hinweise.
  (Entwürfe tragen zusätzlich das gemalte Bild; `validate` lässt es weg, und Teilen und Veröffentlichen schicken seit M22
  das geprüfte Dokument (`shareableDocument`, eine bewusste Core-Änderung). Links um 210–280 Zeichen.)
- [x] Solver: Zeilenlöser (dynamische Programmierung) mit Propagation, bei Bedarf Backtracking; prüft auch die
  **Eindeutigkeit**. Ein mehrdeutiges Rätsel ist ein Problem im Editor und kann nicht geteilt werden.
  (Zeilenlöser als kleiner Automat über Bitmasken, gegen Brute Force getestet. Die Analyse zählt bis zu zwei Lösungen,
  höchstens 2 000 Rateschritte; 15×15 meist unter 1 ms, im schlechtesten Fall etwa 70 ms. Sie ist Teil von `validate`,
  also prüft auch der Server. Kein `solve` im Sinne des Core, weil es keinen Zugzähler gibt.)
- [x] Bedienung: Modus Füllen/Kreuzen, Ziehen füllt eine Reihe (ein Undo-Schritt), erledigte Hinweiszahlen ausgegraut,
  kein Zugzähler (`controls.moves: false`). Nach dem Lösen wird das Bild gezeigt.
  (Ein Zug ist eine Menge Zellen mit Markierung; das erste Feld entscheidet: setzen oder leeren. Modus als native
  Radiobuttons, damit kein Neuzeichnen nötig ist.)
- [x] Editor: Pixel malen (ziehen), Größe einstellen, die Hinweise werden beim Speichern berechnet.
  (Die Hinweise folgen jeder Änderung. Bei Mehrdeutigkeit sind die Felder markiert, in denen zwei Lösungen abweichen.
  „Vorschau mit Hinweiszahlen“ zeigt die Zahlen neben dem Bild, wie Spieler sie sehen; die Seite scrollt darüber.
  Kopien aus Links bekommen ihr Bild aus der eindeutigen Lösung zurück.)
- [x] Entscheidung im Meilenstein: maximale Größe auf dem Handy (Tap-Ziele ≥ 44 px gegen 15×15 und mehr; eventuell Zoom).
  (Entschieden: bis 15×15 mit Zoom-Knopf. Ohne Zoom passt sich die Zellgröße der Breite an (15×15 auf 390 px etwa 18 px),
  mit Zoom 44 px; die Hinweise bleiben beim Scrollen stehen (`position: sticky`), Wischen auf ihnen scrollt.)
- [x] Entscheidung im Meilenstein: Schwierigkeit messen, z. B. „nur Zeilenlogik“ gegen „braucht Raten“, oder wie beim Quiz
  aus Bewertungen.
  (Entschieden: aus Bewertungen wie beim Quiz. Eine gemessene Stufe bräuchte eine Core-Erweiterung und eine Migration,
  weil der Bewertungs-Trigger sonst überschreibt; die Analyse meldet „geraten“ schon, falls es später kommt.)
- [x] Checkliste für neue Typen: Tests (Logik, Editor, Beispiele samt Server-Prüfung), Registrierung, Symbol und Farbe,
  Barrierefreiheit, Linklänge, ARCHITEKTUR.md. Vier Beispiele (5×5, 8×8, 10×10, 15×15), alle mit reiner Zeilenlogik.
  Im Browser über die LAN-Adresse geprüft (Headless Chrome, 390 px): Katze per Ziehen gelöst (Bild in der Typfarbe,
  Gelöst-Sheet ohne Zugzahl), Kreuzen und Undo eines Strichs, Zoom mit stehenden Hinweisen, Tastatur, Editor mit
  Mehrdeutigkeits-Markierung.
- [x] Handy-Test (Ziehen über Zeilen, Zoom und Scrollen auf den Hinweisen, Editor) erfolgreich. Dabei gefunden und
  behoben: In der Editor-Vorschau waren die Zahlen schwarz auf dunklem Grund, und über ihr ließ sich nicht hochscrollen.
- [x] Live testen: veröffentlichen (nach dem Push), in der Galerie nach Typ filtern, Stufe aus Bewertungen.

### M23 – Laser-Erweiterungen
Jede Erweiterung erhöht `typeVersion` des Lasers und bekommt ein `migrate` (CLAUDE.md, Regel 7), auch wenn das alte
Format unverändert gültig bleibt.
- [x] **Inventar** (`typeVersion` 2): Das Rätsel gibt eine Zahl Spiegel vor, die man auf freie Felder setzt. Tippen auf ein
  freies Feld setzt einen Spiegel, erneutes Tippen klappt ihn um und dann wieder weg. Solver: Platzierungen nur auf Feldern,
  die ein Strahl erreicht, höchstens z. B. 3 Inventar-Spiegel.
  (`inventory` 1–3. Jedes Antippen ist ein Zug: „/“ kostet einen, „\“ zwei. Der Solver ist neu: Er ändert nur Felder, die ein
  Strahl betritt, in der Reihenfolge, in der der Strahl sie zuerst betritt, und vertieft schrittweise nach Zügen. Das gilt auch
  für drehbare Spiegel (das alte „später mit Pruning“) und ist gegen Brute Force getestet. Mit Inventar ist jedes Feld
  antippbar, die Tastatur nutzt dann einen roving tabindex; der Vorrat steht über dem Spielfeld.)
- [x] **Strahlteiler** (`typeVersion` 3): ein halbdurchlässiger Spiegel, der Strahl verzweigt sich. Die Schleifenerkennung
  wird damit wirklich gebraucht; die Darstellung zeichnet mehrere Polylinien.
  (Fest oder drehbar, gestrichelt gezeichnet. Besucht wird global nach Feld, Richtung und Farbe, also enden auch Strahlen,
  die in einen schon verfolgten Strahl einmünden.)
- [x] **Farben** (`typeVersion` 4): Laser in Rot, Grün und Blau, Ziele verlangen eine Farbe, Farbfilter lassen nur ihre
  Farbe durch (ohne Farbmischung). Farben sind zusätzlich mit Symbolen unterscheidbar (Farbsehschwäche).
  (Ohne Farbe ist ein Laser rot und ein Ziel nimmt jede Farbe, so bleiben alte Daten gültig. Symbole: Rot ▲, Grün ■, Blau ◆;
  grüne und blaue Strahlen haben zusätzlich ein eigenes Strichmuster. Neues Editor-Problem: Ziel in einer Farbe ohne Laser.)
- [x] Editor-Palette in Gruppen (Grundlagen, Inventar, Teiler, Farben), damit das Werkzeug-Raster auf dem Handy übersichtlich bleibt.
  (Gruppen-Überschriften im Grid-Editor, `PaletteItem.group`. Das Inventar ist kein Werkzeug, sondern eine Zahl unter
  „Einstellungen“ neben Breite und Höhe (`settings` im Grid-Editor). Werkzeuge: Teiler fest/drehbar, Filter, „Farbe“ färbt
  Laser, Ziele und Filter reihum um.)
- [x] Je Erweiterung Beispielrätsel (Generator-Skript erweitern); alte Links und veröffentlichte Version-1-Rätsel spielen weiter.
  („Selbst gesetzt“, „Geteiltes Licht“, „Farbenspiel“, je 6 Züge; der Generator baut eine Lösungsstellung, legt Ziele auf den
  Strahl und verdreht dann Teile. Jedes Beispiel ist ohne seine Erweiterung unlösbar bzw. viel leichter. Damit Versions-Sprünge
  keine Inhaltsschlüssel ändern, gibt es im Core `minVersion` (eine bewusste Core-Änderung): Ein Rätsel ohne Erweiterungen
  bleibt Version 1, Fortschritt und Galerie-Markierungen bleiben erhalten. Im Browser geprüft (Headless Chrome, 390 px und
  1280 px): Beispiel mit Inventar per Tastatur optimal gelöst, Editor mit allen neuen Werkzeugen, hell und dunkel.)
- [x] Handy-Test (Spiegel setzen, Teiler und Farben; Editor mit Gruppen und Inventar).
- [x] Live testen: Rätsel mit Erweiterungen veröffentlichen (nach dem Push), altes Laser-Rätsel in der Galerie weiter als gelöst markiert.

### M24 – Rätsel-Ketten
- [x] **Entscheidung im Meilenstein:** Dürfen Ketten fremde Galerie-Rätsel enthalten? (Vorschlag: ja, als kuratierte
  Sammlung.) Wie lang darf eine Kette sein (Vorschlag: 2–20)? Gibt es Likes für Ketten?
  (Entschieden: fremde sichtbare Rätsel ja, 2–20 Rätsel, keine Likes für Ketten (die Rätsel darin lassen sich weiter liken).
  Tageslimit 5 Ketten, Text vor einem Rätsel höchstens 500 Zeichen, Abschlusstext höchstens 2000.)
- [x] Migration: Tabelle `chains` (Autor, Titel, Beschreibung, Schritte als geordnete Liste aus `puzzle_id` und optionalem
  Text vor dem Rätsel, Abschlusstext, `hidden`, Zähler, `published_at`), RLS wie bei `puzzles`.
  Angelegt wird nur über die Funktion `publish_chain`: Alle Rätsel müssen existieren und sichtbar sein, Tageslimit, gesperrte Nutzer nicht.
  (`0009_chains.sql`. Die Schritte liegen als jsonb-Liste vor und tragen zusätzlich den `content_key` jedes Rätsels, damit
  Galerie-Karten den eigenen Fortschritt ohne weitere Abfrage zeigen. Lokal in einem Wegwerf-Postgres mit nachgebauten
  Supabase-Rollen geprüft: Rechte, ungültige Schritte, doppelte und ausgeblendete Rätsel, Tageslimit, Sperre, Melden,
  Moderation, Kontolöschung.)
- [x] Ketten sind wie Rätsel unveränderlich (nur Titel und Beschreibung lassen sich ändern) und lassen sich zurückziehen.
  (Profil → „Meine Ketten“.)
- [x] Ketten-Editor (`#/chain/new`): Rätsel aus „Meine Veröffentlichungen“ wählen oder einen `#/g/<id>`-Link einfügen,
  sortieren, Texte pro Schritt (für den Escape-Charakter).
  (Kein Formular: Enter in einem Feld veröffentlicht nicht versehentlich. Der Entwurf bleibt beim Navigieren erhalten,
  wird aber nicht gespeichert.)
- [x] Route `#/c/<id>`: Übersicht mit Schritten und Schlössern. Ein Schritt gilt als gelöst, wenn der lokale Fortschritt
  (`content_key`) gelöst ist; das schaltet den nächsten frei. Am Ende kommt ein Abschluss-Bildschirm.
  (Gespielt wird unter `#/c/<id>/<n>`: Text vor dem Rätsel über dem Spielfeld, nach dem Lösen „Weiter: Schritt n“ bzw.
  „Zum Abschluss“. Gesperrte Schritte führen mit Hinweis zur Übersicht zurück.)
- [x] Zurückgezogene oder ausgeblendete Rätsel werden in der Kette als „nicht mehr verfügbar“ angezeigt und gelten als übersprungen.
- [x] Galerie: Umschalter „Rätsel | Ketten“ (Filter in der Route); Karten mit Schrittzahl und eigenem Fortschritt.
  (`#/gallery?view=chains`, sortiert nach „Neueste“ oder „Meistgespielt“.)
- [x] Melden und Moderation auch für Ketten (gleiche Schwelle, Moderationsansicht, Löschen); beim Löschen des Kontos
  verschwinden auch die Ketten.
  (`reports` hat jetzt `puzzle_id` oder `chain_id`. Im Browser gegen ein nachgebautes Backend geprüft (Headless Chrome,
  390 px und 1280 px, hell und dunkel): Galerie, Übersicht, Schritt lösen und weiter, Sperre, Abschluss, Melden,
  Editor, „Meine Ketten“, Moderation.)
- [x] Migration `0009_chains.sql` auf `dev` und `prod` einspielen.
- [x] Live testen gegen `dev` (Rechte, ungültige Rätsel-IDs, Zurückziehen eines enthaltenen Rätsels), Handy-Test.

### M25 – Zeitmessung und Ranglisten
- [x] Zeitmessung im Core (vorgezogen aus Phase 4): Sie startet mit dem ersten Zug, pausiert bei verdeckter Seite und
  endet beim Lösen. Stat-Kachel „Zeit“, die Bestzeit steht im Fortschritt (`bestTimeMs`, IndexedDB-Version anheben).
  (`core/timer.ts`. Rückgängig nach dem Lösen setzt den Versuch fort, „Neustart“ beginnt einen neuen. Abweichung: keine neue
  IndexedDB-Version, weil `bestTimeMs` ein optionales Feld im vorhandenen Speicher ist; eine neue Version hätte nur andere
  offene Tabs zum Neuladen gezwungen. Die Spiel-Session merkt sich dafür die Zugfolge (`path`), ein eigener Core-Commit.)
- [x] `rules.ts` je Typ: `ranking?: "moves" | "time"` (Rush Hour, Laser, Sokoban …: Züge, bei Gleichstand die Zeit;
  Nonogramm: nur Zeit; Quiz: keine).
- [x] Migration: Tabelle `scores` (Nutzer, Rätsel, Züge, Zeit, Datum), pro Nutzer und Rätsel nur der beste Wert;
  Funktion `leaderboard(puzzle_id)` liefert die Top 10 und den eigenen Platz.
  (`0010_scores.sql`. Die Tabelle ist nicht direkt lesbar; gleiche Ergebnisse teilen sich einen Platz; gesperrte Spieler und
  der Autor fehlen. Lokal in einem Wegwerf-Postgres geprüft: Rechte, bessere/schlechtere Ergebnisse, Rangliste nach Zeit,
  Top-10-Schnitt mit eigenem Platz, ausgeblendetes Rätsel, Sperre, Moderation, Kontolöschung.)
- [x] Edge Function `submit-score` (laufzeitneutraler Handler in `src/server/`, mit `node --test` getestet): Token prüfen,
  Rätsel laden, `loadDocument`, Zugfolge mit `applyMove` nachspielen (höchstens z. B. 5 000 Züge), `isSolved` prüfen und
  Züge selbst zählen; die Zeit nur auf Plausibilität prüfen (> 0, ≤ 24 h). Gesperrte Nutzer und der Autor kommen nicht in die Rangliste.
  (`src/server/score-handler.ts`, Prüfung in `core/scores.ts`. Kein Zug nach dem lösenden. 5 000 Züge kosten höchstens ~35 ms.)
- [x] Gelöst-Sheet und `#/g/<id>`: Platz und Top 10; ohne Anmeldung ein Hinweis. Ist man offline, wird das Ergebnis
  später gesendet (Warteschlange im `localStorage`).
  (Neben dem Spielfeld die Rangliste, im Gelöst-Dialog „Platz n von m“ und die Top 10 zum Aufklappen. Gilt auch für
  Schritte einer Kette. Gesendet wird beim Start, bei `online` und nach der Anmeldung. Im Browser gegen ein nachgebautes
  Backend mit dem echten Handler geprüft (Headless Chrome, 390 px und 1280 px): Zeit zählt hoch, Eintragen, Offline-Warteschlange,
  Moderator entfernt Einträge, Nonogramm nur mit Zeit.)
- [x] Moderation: Einträge eines Nutzers aus allen Ranglisten entfernen (z. B. beim Sperren).
  (`mod_clear_scores`: „Entfernen“ in der Rangliste und „Aus Ranglisten entfernen“ beim Autor in der Moderationsansicht.
  Gesperrte erscheinen ohnehin nicht mehr.)
- [x] Datenschutzerklärung ergänzen: Ranglisten zeigen den Anzeigenamen öffentlich.
  (Auch: gespeicherte Ergebnisse, Zugfolge wird nachgespielt, aber nicht gespeichert, Warteschlange im localStorage, Löschung.)
- [ ] Migration `0010_scores.sql` auf `dev` und `prod` einspielen; nach dem Push deployt der Workflow `submit-score`.
- [ ] Live testen: gefälschte Zugfolgen, zu kurze Zugfolgen, nicht gelöste Endstellung, Handy-Test.

### M26 – Tägliches Rätsel
- [ ] Migration: Tabelle `daily` (Tag als Schlüssel, `puzzle_id`, geplant von). Die Funktion `daily_puzzle()`
  (security definer) liefert das Rätsel des heutigen Tags (Zeitzone Europe/Berlin). Gibt es noch keins, wählt sie eins,
  ohne Cron-Job: sichtbar, noch nie täglich, gut bewertet bzw. beliebt, nicht derselbe Typ wie gestern.
  Gleichzeitige Aufrufe sind über den Schlüssel abgesichert.
- [ ] Wird das heutige Rätsel ausgeblendet oder zurückgezogen, wählt die Funktion neu.
- [ ] Tagesrangliste: Tabelle `daily_scores`; nur der **erste** Lösungsversuch des Tages zählt. Geprüft wird über
  `submit-score` aus M25.
- [ ] Startseite: Karte „Rätsel des Tages“ (Typ, Stufe, gelöst?); Route `#/daily` führt zum heutigen Rätsel.
- [ ] Serie (Tage am Stück gelöst): angemeldet aus `daily_scores`, sonst lokal gespeichert.
- [ ] Moderationsansicht: die nächsten 14 Tage planen, das heutige Rätsel ersetzen.
- [ ] Live testen (Tageswechsel simulieren, leere Galerie, ausgeblendetes Tagesrätsel), Handy-Test.

### M27 – Synchronisierung von Bibliothek und Fortschritt
- [ ] **Entscheidung im Meilenstein:** Was passiert beim Abmelden mit den lokalen Daten (behalten oder vom Gerät löschen)?
  Und wenn sich danach ein anderes Konto anmeldet? (Vorschlag: behalten, bei einem Kontowechsel nachfragen.)
- [ ] Migration: `sync_puzzles` (Nutzer, ID, Dokument, `updated_at` vom Client, `deleted`, `changed_at` vom Server) und
  `sync_progress` (Nutzer, Schlüssel, gelöst, beste Züge, beste Zeit, `changed_at`); RLS nur eigene Zeilen;
  Grenzen pro Nutzer (z. B. 500 Rätsel, 64 KB pro Dokument). Privater Storage-Bucket `user-images/<uid>/<key>`.
- [ ] IndexedDB-Version anheben: Grabsteine für gelöschte Rätsel, „geändert seit dem letzten Sync“, Sync-Cursor pro Konto.
- [ ] `core/sync.ts` (rein, getestet): Zusammenführen wie oben entschieden; holen seit Cursor (`changed_at`, Keyset),
  dann eigene Änderungen per `sync_push` senden. Die Funktion setzt nur neuere Stände (`updated_at`) durch.
  Der Cursor nutzt die Server-Zeit, damit falsch gehende Uhren nicht schaden.
- [ ] Wann synchronisiert wird: nach der Anmeldung, beim Start, beim Sichtbarwerden der Seite, bei `online` und kurz nach
  dem Speichern. Bilder werden hochgeladen und erst beim Öffnen geladen.
- [ ] Alles vom Server geht durch `loadDocument(…, { draft: true })`.
- [ ] Profil: Sync-Status („zuletzt synchronisiert …“, Fehler, „Jetzt synchronisieren“).
- [ ] Konto löschen entfernt die Sync-Daten; der Aufräumjob löscht dann auch die `user-images`. Die Datenschutzerklärung
  wird ergänzt (gespeicherte Entwürfe und Fortschritt).
- [ ] Free-Tier abschätzen (500 MB Datenbank, 1 GB Storage) und Grenzen danach festlegen.
- [ ] Live testen mit zwei Geräten: gleichzeitige Änderungen, offline ändern, löschen auf einem Gerät, erstes Anmelden
  mit vorhandenen lokalen Daten.

### M28 – Englisch und Sprache pro Rätsel
- [ ] `i18n/en.ts` mit Typ `Record<MessageKey, string>`; ein Test prüft, dass beide Sprachen dieselben Schlüssel und
  Platzhalter haben. Mehrzahl über `Intl.PluralRules`, wo nötig.
- [ ] Aktive Sprache: aus `navigator.languages`, änderbar unter Profil › Darstellung, gespeichert im `localStorage`;
  `<html lang>` und `document.title` folgen. Ein Wechsel rendert neu, ohne die Seite neu zu laden.
- [ ] Alle fest verdrahteten `de-DE`-Formate (`ui/time.ts`, Quiz-Zahlen, Datenschutz-Datum) nutzen die aktive Sprache.
- [ ] Beispielrätsel: Titel übersetzen; ein englisches Beispiel-Quiz zusätzlich zum deutschen.
- [ ] `meta.lang` (`de` | `en`, optional) in der Hülle. Alte App-Versionen verwerfen unbekannte Meta-Felder, also bleibt
  `format: 1`. Der Inhaltsschlüssel ändert sich nicht. Im Editor ist die Oberflächensprache voreingestellt.
- [ ] Migration: Spalte `puzzles.lang`, `publish` übernimmt sie; Galerie-Filter `lang` in der Route (Standard: alle),
  Sprach-Badge auf der Karte.
- [ ] **Entscheidung im Meilenstein:** Mail-Vorlagen zweisprachig in einer Mail oder je nach `user_metadata.lang`;
  Impressum und Datenschutz nur auf Deutsch mit englischem Hinweis oder übersetzt.
- [ ] Englische Texte gegenlesen (die Texte schreibe ich, du prüfst sie), Handy-Test in beiden Sprachen.

## Phase 4: Ideen aus dem Redesign
Funktionen aus dem Entwurf (`docs/design-handoff/`), die in M15 bewusst weggelassen wurden.
Vor dem Umsetzen jeweils entscheiden, ob sie kommen sollen.
- [ ] Hinweis-Knopf in der Steuerleiste des Spiels (vierte Schaltfläche).
- [ ] Zeitmessung beim Spielen (Stat-Kachel „Zeit“, im Gelöst-Sheet statt „Bestwert“). → vorgezogen nach M25.
- [ ] Schwierigkeitsstufe im Editor anzeigen (Live-Prüfung und Prüf-Panel).
- [ ] „Lösung abspielen“ im Prüf-Panel des Editors.
- [ ] Teilen per QR-Code im Teilen-Sheet.
- [ ] Töne & Vibration (Schalter unter Profil › Darstellung).
- [ ] Status-Filter in „Meine Rätsel“ (Alle · Entwürfe · Geteilt · Gespeichert).
- [ ] Status-Badges „In der Galerie“, „Per Link geteilt“ und „Gespeichert“ (dafür muss gespeichert werden,
  ob ein Rätsel geteilt oder veröffentlicht wurde).
- [ ] Karte „Weiterspielen“ auf der Startseite (zuletzt offenes Rätsel mit Zwischenstand speichern).
- [ ] Suche nach Titel oder Autor (Startseite, Galerie, Desktop-Navigation).
- [ ] Teilen direkt aus dem Spiel (Knopf im Spiel-Kopf bzw. im Mehr-Menü).
- [ ] Tastenkürzel im Spiel und Editor (z. B. Strg Z, R, Werkzeuge per Ziffer) und ihre Anzeige.
- [ ] Beschreibung (optional) schon im Editor statt erst beim Veröffentlichen.
- [ ] Echte Vorschaubilder der Rätsel auf den Karten statt des Platzhalter-Rasters.
- [ ] Linien-Symbole statt Emojis auch in den Rätsel-Editoren (Werkzeug-Raster, „Bild hinzufügen“ im Quiz).

## Irgendwann
- [ ] App-Store-Versionen per Capacitor. Vorher prüfen: neue Pakete (Regel 1), Entwicklerkonten und Kosten, Store-Regeln
  für nutzergenerierte Inhalte.
- [ ] Escape-Modus mit Codes: Rätsel geben einen Code aus, der ein Schloss in der Kette öffnet (baut auf M24 auf).
- [ ] Weitere Typen aus dem Katalog (Flow, Logikgatter, Sudoku, Schiebepuzzle, Water-Sort …).

---

## Offene Entscheidungen
- [x] Name des Spiels: **Knobelkiste**.
- [x] Visueller Stil: Design-Übergabe in `docs/design-handoff/`, umgesetzt in M15.
- [x] Backend für Phase 2: Supabase (EU-Region).
- [x] SMTP-Anbieter für Account-Mails: Brevo (Absender-Domain `stits.dev`).
- [x] Wird Englisch als zweite Sprache schon in Phase 1 benötigt? Nein, Englisch kommt mit M28.
