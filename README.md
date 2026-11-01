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

1. Angaben in `src/imprint.ts` eintragen und die Datenschutzerklärung prüfen (`src/privacy.ts`, `reviewed: true`);
   sonst bricht das Deployment ab.
2. Repository auf GitHub anlegen und `main` pushen.
3. In GitHub: Settings → Pages → Source „GitHub Actions“. Danach veröffentlicht jeder Push auf `main` automatisch.

## Backend (Supabase, ab Phase 2)

Ohne Backend-Konfiguration läuft die App ohne Community-Funktionen.

1. Migrationen aus `supabase/migrations/` der Reihe nach im Supabase-Dashboard anwenden (SQL Editor), erst `dev`, dann `prod`.
2. Projekt-URL und Publishable Key (Settings → API Keys) in `.env.development` (Projekt `dev`) bzw. `.env.production` (Projekt `prod`) eintragen.
   Den Secret- bzw. Service-Role-Key nie in die App oder ins Repository.

Dokumentation in [`docs/`](docs/): [Konzept](docs/KONZEPT.md) · [Architektur](docs/ARCHITEKTUR.md) · [Roadmap](docs/ROADMAP.md)
