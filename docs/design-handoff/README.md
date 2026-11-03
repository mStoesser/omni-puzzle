# Knobelkiste – Design-Übergabe für Claude Code

Dieses Paket beschreibt das neue UI-Design der App-Hülle. Die Darstellung der einzelnen Rätsel bleibt unverändert.

## Inhalt

| Datei | Zweck |
|---|---|
| `DESIGN_SPEC.md` | **Zuerst lesen.** Prinzipien, Tokens, Komponenten, alle Screens, Barrierefreiheit |
| `tokens.css` | CSS-Variablen für Dunkel, Hell und System. Kann direkt übernommen werden |
| `tokens.json` | Dieselben Werte maschinenlesbar, z. B. für Tailwind oder TS-Konstanten |
| `screens/*.html` | Statische Referenz-Entwürfe, im Browser öffnen. Die Links zwischen den Screens funktionieren |
| `screenshots/*.png` | Bilder derselben Entwürfe |

Screens: `mobile-start`, `mobile-galerie`, `mobile-spiel`, `mobile-geloest`, `mobile-editor`, `mobile-teilen`, `mobile-meine-raetsel`, `mobile-konto`, `desktop-start`, `desktop-spiel`, `desktop-editor`, `light-mobile-start`, `light-mobile-spiel`, `grundlagen`.

## So nutzt du es mit Claude Code

1. Lege diesen Ordner ins Repo, z. B. unter `docs/design-handoff/`.
2. Starte Claude Code im Repo und gib ihm etwa diesen Auftrag:

> Lies `docs/design-handoff/README.md` und `docs/design-handoff/DESIGN_SPEC.md` und sieh dir die Screenshots in `docs/design-handoff/screenshots/` an.
> Setze das neue UI-Design der Knobelkiste schrittweise im bestehenden Code um, **ohne die Spiellogik und die Rätsel-Darstellung zu verändern**:
> 1. Übernimm `tokens.css` als globale Design-Tokens und binde die Schriften Inter und Space Grotesk ein. Setze das Theme über `data-theme` auf `<html>`.
> 2. Baue die wiederverwendbaren Komponenten aus Abschnitt 3 der Spec: Buttons, Icon-Button, Segment-Control, Chips, Badges, Karten, Bottom-Sheet, Tab-Leiste und Desktop-Navigation. Nutze Linien-Icons statt Emojis.
> 3. Stelle die Screens in dieser Reihenfolge um: Start → Spiel-Rahmen + Gelöst-Sheet → Galerie → Editor-Rahmen + Teilen-Sheet → Meine Rätsel → Profil → Desktop-Layouts.
> 4. Die Rätsel-Komponenten bleiben, wie sie sind, und werden nur in den neuen Spielfeld-Container gesetzt.
> 5. Die Funktionen aus Abschnitt 6 der Spec setzt du noch nicht um. Lass die Stellen sichtbar weg und liste sie mir am Ende auf.
>
> Schau dir zuerst die bestehende Struktur an und schlag mir einen kurzen Plan vor, bevor du größere Umbauten machst. Vergleiche nach jedem Screen dein Ergebnis mit dem passenden Screenshot.

## Hinweise

- Die HTML-Entwürfe nutzen Inline-Styles mit `var(--…)`-Tokens. Sie dienen als Maß- und Abstandsreferenz, nicht als Code zum Kopieren.
- Platzhalter wie `[Titel]` und der Beispiel-Link `knobelkiste.app/r/…` sind keine echten Daten.
- Das Original liegt als bearbeitbarer Design-Canvas in Claude („Knobelkiste – UI Design“).
