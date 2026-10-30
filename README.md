# Rätselspiel

Web-App (Browser und Handy als PWA) zum Spielen, Bauen und Teilen von Rätseln.

Voraussetzung: Node ≥ 22.18 (empfohlen 24 LTS, siehe `.nvmrc`).

```bash
npm install
npm run dev        # Dev-Server
npm run build      # Produktions-Build nach dist/
npm run typecheck  # tsc --noEmit
npm test           # node --test
```

## Veröffentlichen (GitHub Pages)

1. Angaben in `src/imprint.ts` eintragen (sonst bricht das Deployment ab).
2. Repository auf GitHub anlegen und `main` pushen.
3. In GitHub: Settings → Pages → Source „GitHub Actions“. Danach veröffentlicht jeder Push auf `main` automatisch.

Dokumentation in [`docs/`](docs/): [Konzept](docs/KONZEPT.md) · [Architektur](docs/ARCHITEKTUR.md) · [Roadmap](docs/ROADMAP.md)
