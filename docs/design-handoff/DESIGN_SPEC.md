# Knobelkiste – Design-Spezifikation

Gilt für die App-Hülle: Navigation, Übersichten, Spiel-Rahmen, Editor-Rahmen, Teilen und Konto.
**Nicht enthalten:** das Aussehen der einzelnen Rätsel (Spielfeld und Bau-Fläche).
In den Entwürfen ist das jeweils ein Platzhalter mit Raster. Dort rendern die bestehenden Rätsel-Komponenten.

Referenzen in diesem Paket:

- `screens/*.html`: statische Entwürfe, einfach im Browser öffnen. Maße, Abstände und Texte gelten wie dort gezeigt.
- `screenshots/*.png`: dieselben Entwürfe als Bilder.
- `tokens.css` / `tokens.json`: alle Farben, Radien, Abstände und Schriften.

---

## 1. Grundprinzipien

1. **Dunkel ist Standard.** Hell gibt es als gleichwertiges Theme. Umschalten unter Profil › Darstellung: *Dunkel / Hell / System*.
2. **Eine Markenfarbe (Gelb), nur für Hauptaktionen.** Pro Screen gibt es höchstens eine gelbe Hauptaktion (Weiterspielen, Teilen, Nächstes Rätsel …). Dazu kommt der Bauen-Knopf in der Tab-Leiste.
3. **Jeder Rätseltyp hat eine Farbe und ein Linien-Symbol.** Die Typfarbe erscheint nur als Akzent: Icon-Kachel, Badge, Fortschrittsbalken, Filterpunkt. Sie färbt nie große Flächen.
4. **Keine Emojis in der UI.** Überall Linien-Icons (24er-Viewbox, Strich 2, runde Enden), z. B. Lucide oder ein eigenes Set.
5. **Touch zuerst.** Tippziele sind mindestens 44 px groß. Haupt-Buttons sind 48–52 px hoch.

## 2. Tokens (Kurzfassung, vollständig in `tokens.css`)

| Token | Dunkel | Hell | Einsatz |
|---|---|---|---|
| `--kk-bg` | #0F1115 | #F6F5F1 | Seitenhintergrund |
| `--kk-surface` | #171A21 | #FFFFFF | Karten, Inputs |
| `--kk-surface-2` | #1F232C | #EEEDE8 | ausgewählte Segmente, Sekundär-Buttons, Spielfeld-Platzhalter |
| `--kk-line` | #2A2F3A | #E0DED7 | 1-px-Rahmen, Trennlinien |
| `--kk-text` / `--kk-muted` | #F3F4F6 / #A1A8B5 | #16181D / #5B6170 | Text / Meta-Text |
| `--kk-brand` | #FFD34D | #FFC933 | Hintergrund von Primär-Buttons |
| `--kk-brand-ink` | #FFD34D | #7A5B00 | Gelb als **Text**, z. B. Links und aktiver Tab |
| `--kk-on-brand` | #1C1700 | #1C1700 | Text auf Gelb |
| `--kk-ok` / `--kk-danger` | #5BE38D / #FF7676 | #15803D / #C62828 | gelöst, lösbar / löschen |

**Rätseltypen:** Ausparken `rushhour` (Koralle), Laser & Spiegel `laser` (Türkis), Quiz `quiz` (Violett).
Zu jeder Farbe gibt es ein `-tint`-Token (12–15 % Deckkraft) als Hintergrund.

**Neue Typen:** Man wählt einen freien Farbton mit ähnlicher Helligkeit und Sättigung (Vorschläge: Grün-Gelb, Rosa, Blau) und ein eigenes Symbol.
Gelb ist für die Marke reserviert, Grün und Rot für Status.

**Theme-Umschaltung:** `data-theme="dark"` oder `"light"` auf `<html>`. Für „System“ entfällt das Attribut, dann entscheidet `prefers-color-scheme`.

**Schrift:**

- Überschriften: *Space Grotesk* 700.
- Fließtext und UI: *Inter* 400–700.
- Labels: Inter 600, 12 px, Großbuchstaben, Laufweite +0,08em, Farbe muted.
- Zahlen in Stat-Kacheln: Space Grotesk 700, 20–26 px.

**Radien:**

| Element | Radius |
|---|---|
| Inputs, Icon-Buttons | 12 |
| Buttons | 14 |
| Karten | 18 |
| große Karten, Spielfeld | 20–24 |
| Sheets (oben) | 28 |
| Chips, Badges | Pill |

## 3. Komponenten

| Komponente | Spezifikation |
|---|---|
| **Button primär** | 48 px hoch (52 im Sheet), Radius 14, `brand`-Hintergrund, `on-brand`-Text 700. Icon links optional (18 px). |
| **Button sekundär** | Wie primär, aber `surface-2`-Hintergrund, 1 px `line`, Text 600. |
| **Button leise** | Transparent, Text 600. |
| **Button Gefahr** | Transparent, Rahmen `danger-line`, Text `danger`. Löst immer einen Bestätigungsdialog aus. |
| **Icon-Button** | 44×44, Radius 12, `surface` + 1 px `line`. Braucht immer ein `aria-label`. |
| **Segment-Control** | Container `surface` + `line`, Radius 14, 4 px Innenabstand. Aktives Segment `surface-2`, Text 600. Inaktiv: muted. Eingesetzt für Bauen/Probespielen und Dunkel/Hell/System. |
| **Filter-Chip** | 36 px hoch, Pill. Aktiv: invertiert (`text`-Hintergrund, `bg`-Text). Inaktiv: `surface` + `line`. Typfilter haben einen 8-px-Farbpunkt. |
| **Typ-Badge** | Pill, 12 px / 600, Text in Typfarbe auf Typ-Tint. Optional mit 14-px-Icon. |
| **Status-Badge** | *gelöst* (ok-Farbe + Haken), *In der Galerie* (ok-Tint + Globus), *Per Link geteilt* (brand-Tint + Link), *Entwurf* / *Gespeichert* (nur Rahmen, muted). |
| **Typ-Kachel** (Start) | Karte mit 44er-Icon-Kachel in Typ-Tint, Name, „x / y gelöst“ und 4-px-Fortschrittsbalken in Typfarbe. Die letzte Kachel ist gestrichelt: „Weitere Typen folgen“. |
| **Rätsel-Karte** (Liste) | Karte, 88er-Vorschaubild links (Radius 12), Typ-Badge, Titel (Display 17), „von Autor · Zeit“, Metazeile mit Likes, Spielen und Schwierigkeit. Die ganze Karte ist ein Link. |
| **Rätsel-Karte** (Raster) | Vorschau oben (100–140 px), darunter Typ, Titel und Autor. Mobil horizontal scrollbar (160 px breit). |
| **Stat-Kachel** | `surface`, Radius 12–14. Label 12 muted, Zahl in Space Grotesk 700. |
| **Einstellungs-Liste** | Gruppe in einer Karte (Radius 16), Zeilen 56 px, Trennlinie `line`, Wert muted + Chevron rechts. Darüber ein Abschnitts-Label. |
| **Bottom-Sheet** | Hintergrund mit `scrim` abgedunkelt. Sheet in `surface`, oben Radius 28, Griff 40×5, Innenabstand 20/32, `role="dialog" aria-modal`. |
| **Tab-Leiste** (mobil) | 84 px, `tabbar-bg` + obere `line`, 5 Spalten: Start · Galerie · **Bauen** (52er gelbes Quadrat, Radius 16, „+“) · Meine · Profil. Aktiver Tab in `brand-ink` 600, die anderen muted. Unsichtbar im Spiel und im Editor (Fokus-Modus). |
| **Spielfeld-Container** | Quadratisch. Mobil 350 px (Rand 20), Desktop max. 560 px (Editor 600), Radius 20–24, 1 px `line`. Inhalt kommt von der Rätsel-Komponente. |

## 4. Screens

### Mobil · Spielen
- **Start** (`mobile-start`):
  - Kopf mit Logo, Suche und Avatar, darunter die Begrüßung.
  - Karte *Weiterspielen* mit dem zuletzt offenen Rätsel und Fortschritt.
  - *Rätseltypen* als 2er-Raster mit Fortschritt je Typ.
  - Banner *Bau dein eigenes Rätsel*.
  - *Neu in der Galerie* als horizontaler Scroller.
  - Fußzeile mit Impressum und Datenschutz.
- **Galerie** (`mobile-galerie`): Suchfeld, Typ-Filter-Chips, Trefferzahl und Sortierung (Neueste / Beliebt / Am meisten gespielt), Liste aus Rätsel-Karten.
- **Spiel** (`mobile-spiel`):
  - Kopfzeile mit Zurück, Typ und Level („LASER & SPIEGEL · 3 / 4“) sowie Titel und Mehr-Menü (…). Das Mehr-Menü enthält Teilen, Remixen und Melden.
  - Darunter 3 Stat-Kacheln: Züge, Ziel (Minimum), Bestwert.
  - Spielfeld und eine einzeilige Anleitung.
  - Unten eine Steuerleiste mit 4 gleich breiten Feldern: Zurück, Vor, Neustart, Hinweis. Hinweis ist hervorgehoben.
  - *Vor* ist ausgegraut, solange es nichts zum Wiederholen gibt.
- **Gelöst** (`mobile-geloest`):
  - Sheet über dem Spiel mit Erfolgs-Icon und „Gelöst!“.
  - Unterzeile je nach Ergebnis: optimal → „Optimal – so wenige Züge geht’s nicht.“, sonst → „Geschafft in X Zügen – es geht in Y.“
  - 3 Stats: deine Züge (grün, wenn optimal), Minimum, Zeit.
  - Zeile „Hat’s dir gefallen?“ mit Like-Toggle.
  - Primär: *Nächstes Rätsel: \<Titel\>*. Sekundär: *Teilen* und *Remixen*.

### Mobil · Bauen, Teilen, Konto
- **Editor** (`mobile-editor`):
  - Kopf mit Schließen, Typ, Status (z. B. „AUSPARKEN · ENTWURF“) und tippbarem Titel mit Stift, rechts *Teilen*.
  - Segment *Bauen / Probespielen*.
  - **Live-Prüfung** als Statuszeile: grün „Lösbar · mindestens N Züge“ plus Schwierigkeit. Ist das Rätsel nicht lösbar, wird die Zeile rot und zeigt den Grund.
  - Bau-Fläche.
  - Werkzeug-Raster (5 Spalten) mit rätselspezifischen Werkzeugen. Das gewählte Werkzeug hat einen 2-px-Rahmen in `brand`.
  - Rückgängig, Wiederholen und Einstellungen als Icon-Buttons.
- **Teilen** (`mobile-teilen`): Sheet mit zwei Wegen.
  1. **Per Link an Freunde** (Phase 1, ohne Konto): Linkfeld (readonly), *Kopieren*, *Senden an …* (Web Share API) und *QR-Code*.
  2. **In der Galerie veröffentlichen** (Phase 2): Prüfliste mit „Lösbar“, „Selbst probegespielt“ und „Angemeldet“. Der Button *Veröffentlichen …* ist erst aktiv, wenn alle Punkte erfüllt sind.
- **Meine Rätsel** (`mobile-meine-raetsel`):
  - Titel und *Neu*.
  - Filter: Alle · Entwürfe · Geteilt · Gespeichert.
  - Listenzeilen mit Vorschau, Titel, Typ in Typfarbe, Meta, Status-Badge und Mehr-Menü.
  - Hinweisbox: lokale Entwürfe liegen nur auf diesem Gerät.
- **Profil** (`mobile-konto`):
  - Avatar mit Initiale, Name und E-Mail.
  - 3 Stats: gelöst, gebaut, Likes erhalten.
  - Gruppen: Profil (Anzeigename, Passwort, Veröffentlichungen), Darstellung (Theme-Segment, Töne & Vibration), Rechtliches.
  - *Abmelden*.
  - Gefahrenbox *Konto löschen …* mit dem bestehenden Erklärtext.

### Desktop (ab ca. 900 px)
- Statt der Tab-Leiste gibt es eine **obere Navigationsleiste**: Logo, Start, Galerie, Meine Rätsel, Suche, gelber Button *Rätsel bauen*, Avatar. Inhalt max. 1200 px breit und zentriert, Ränder 24 px.
- **Start** (`desktop-start`):
  - Oben zwei Karten nebeneinander: *Weiterspielen* (große Vorschau) und *Bauen* mit Typ-Schnellwahl.
  - *Rätseltypen* als Karten mit Level-Liste und Status je Level.
  - Galerie-Raster mit `auto-fill`, mindestens 220 px pro Karte.
- **Spiel** (`desktop-spiel`):
  - Spielfeld links (max. 560), darunter die Steuerleiste mit Tastenkürzeln (Strg Z, R).
  - Seitenleiste rechts (≥ 300 px): Stats, „So geht’s“, weitere Level mit aktuellem Level markiert, *Als Vorlage remixen*.
- **Editor** (`desktop-editor`), drei Spalten:
  - Links Werkzeuge als Liste mit Tastenkürzeln.
  - Mitte die Bau-Fläche.
  - Rechts die Panels *Prüfung* (lösbar, kürzeste Lösung, Schwierigkeit, *Lösung abspielen*) und *Einstellungen* (Feldgröße als Stepper, Beschreibung).
  - Kopfzeile: Typ · Entwurf · „automatisch gespeichert“, Titel, Segment Bauen/Probespielen, Rückgängig/Wiederholen, *Teilen*.
- Alle Desktop-Layouts brechen mit `flex-wrap` sauber auf Tablet- und Handybreite um.

## 5. Verhalten und Barrierefreiheit
- Nur echte Elemente: `<button>`, `<a href>`, `<input>` mit `<label>`. Kein `onClick` auf `div`.
- Tab-Leiste und obere Navigation: `<nav aria-label="Hauptnavigation">`, aktiver Eintrag mit `aria-current="page"`.
- Segmente als `role="tablist"`/`tab` bzw. `radiogroup`/`radio`. Like-Button als `aria-pressed`.
- Die Prüfzeile im Editor ist `role="status"`, damit Screenreader Änderungen ansagen.
- Kontrast: Text mindestens 4.5:1. Gelb als Textfarbe im Hell-Modus immer über `--kk-brand-ink`.
- Bewegung: Sheets fahren von unten ein (200–250 ms ease-out). Für die Gelöst-Animation `prefers-reduced-motion` beachten.

## 6. Bewusst neue Funktionen (gegenüber dem aktuellen Stand)

Diese Funktionen sind neu im Entwurf. Vor dem Umsetzen bitte jeweils entscheiden, ob sie kommen sollen:

- Hinweis-Knopf
- Zeitmessung
- Schwierigkeitsstufe
- „Lösung abspielen“
- Remixen: ersetzt „In meine Bibliothek kopieren“
- Teilen per QR-Code
- Töne & Vibration
- Sortierung der Galerie
- Status-Filter in „Meine Rätsel“
