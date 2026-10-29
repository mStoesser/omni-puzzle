# Konzept

## Vision

Eine Rätsel-Plattform, die im Browser und auf dem Handy läuft. Sie unterstützt viele verschiedene
Rätseltypen. Das Besondere daran: **Jeder kann mit wenig Aufwand eigene Rätsel bauen** und sie mit
Freunden teilen oder öffentlich bereitstellen.

Drei Säulen:

1. **Spielen:** Rätsel lösen, mit einfacher und angenehmer Bedienung auf Touch und Desktop.
2. **Bauen:** Pro Rätseltyp ein Editor, der ohne Anleitung verständlich ist, mit sofortigem Probespielen.
3. **Teilen:** In Phase 1 per Link (ohne Server), ab Phase 2 über eine öffentliche Galerie.

## Rahmen

- Hobbyprojekt, eine Person entwickelt.
- Möglichst wenige Abhängigkeiten, Webstandards bevorzugt.
- Keine App-Store-Veröffentlichung geplant; die PWA reicht. Später optional per Capacitor möglich.

## Qualitätsprinzipien für nutzergenerierte Rätsel

- **Nur lösbare Rätsel werden geteilt.** Vor dem Teilen muss der Ersteller sein Rätsel selbst einmal
  lösen (Prinzip „Super Mario Maker“). Wo ein Solver existiert, prüft er zusätzlich automatisch.
- **Schwierigkeit wird gemessen statt geschätzt**, wo möglich, z. B. über die minimale Zuganzahl aus dem Solver.
- **Einfach vor mächtig:** Der Editor deckt 90 % der Fälle mit wenigen Werkzeugen ab. Spezialoptionen kommen später.

## Rätseltypen-Katalog

Status: **MVP** = Phase 1, **später** = Kandidat für spätere Phasen.

### Bewegung / Schieben
| Typ | Beschreibung | Status |
|---|---|---|
| Rush Hour | Blöcke gleiten in ihrer Achse; der Ziel-Block muss zum Ausgang | **MVP** |
| Klotski | Wie Rush Hour, aber Blöcke bewegen sich in alle Richtungen und haben verschiedene Formen | später (Variante von Rush Hour) |
| Sokoban | Kisten auf Zielfelder schieben | später |
| Eis-Rutschen | Spielfigur rutscht, bis sie anstößt | später |
| Schiebepuzzle (15er) | Kacheln in die richtige Reihenfolge bringen | später |
| Water-Sort | Farben in Gläsern sortieren | später |
| Türme von Hanoi | Scheiben umstapeln | später |

### Licht / Strahlen
| Typ | Beschreibung | Status |
|---|---|---|
| Laser & Spiegel | Spiegel drehen, damit der Laser alle Ziele trifft | **MVP** |
| Laser-Erweiterungen | Strahlteiler, Farbfilter, Portale, Spiegel aus einem Inventar platzieren | später |
| Lights Out | Klick schaltet Feld und Nachbarn um; alles soll aus sein | später |

### Verbinden
| Typ | Beschreibung | Status |
|---|---|---|
| Rohre / Leitungen | Rohrstücke drehen, bis alles verbunden ist | später |
| Flow | Gleiche Farben verbinden, ohne Kreuzungen | später |
| Logikgatter | Schaltung bauen, damit der Ausgang leuchtet | später |

### Logik-Gitter
Sudoku, Nonogramm/Picross, Kakuro, KenKen, Minesweeper-artig, Einstein-Rätsel: alle **später**.

### Wort, Wissen, Text
| Typ | Beschreibung | Status |
|---|---|---|
| Quiz | Single/Multiple Choice, Freitext, Zahl mit Toleranz | **MVP** |
| Kreuzworträtsel, Wortsuche, Buchstabensalat, Geheimschrift | | später |

### Bild
Fehlersuche, Wimmelbild, langsam aufgedecktes Bild: **später** (Bilder brauchen das Backend aus Phase 2).

### Meta: Rätsel-Ketten / Escape-Modus (später)
Mehrere Rätsel werden zu einer Kette verknüpft. Die Lösung eines Rätsels (z. B. ein Code) schaltet das nächste frei.
Das ist das langfristige Alleinstellungsmerkmal.

### Warum genau diese drei für das MVP?
Quiz (textbasiert, ohne Raster), Laser (Strahlberechnung, Drehen) und Rush Hour (Ziehen, Zustandssuche)
sind absichtlich sehr verschieden. Wenn die Plugin-Schnittstelle diese drei sauber trägt, trägt sie auch den Rest.

## Vorbilder

- **PuzzleScript:** Web-Engine für Sokoban-artige Rätsel mit Teilen per Link.
- **puzz.link / pzv.jp:** Editoren für viele Logikrätsel; das ganze Rätsel steckt in der URL.
- **Simon Tatham's Portable Puzzle Collection:** viele Typen, einheitlich umgesetzt, Browser und Mobil.
- **Super Mario Maker:** Bauen, Teilen, Entdecken; Hochladen erst nach eigenem Durchspielen.
- **Baba Is You, Levelhead:** Level-Editoren mit Community.
- **Kahoot, Quizlet:** Quiz und Teilen mit Gruppen.
- **ThinkFun Laser Maze / Rush Hour, Flow Free, Unblock Me:** Vorbilder für einzelne Typen.
