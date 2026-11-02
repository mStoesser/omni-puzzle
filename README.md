# Knobelkiste

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
3. Authentication einstellen (beide Projekte):
   - URL Configuration: „Site URL“ = Adresse der App (prod: `https://mstoesser.github.io/omni-puzzle/`, dev: `http://localhost:5173/`),
     unter „Redirect URLs“ zusätzlich die Dev-Adressen (`http://localhost:5173/**`, `http://192.168.178.21:5173/**`).
   - Sign In / Providers → Email: Mindestlänge für Passwörter 8. „Confirm email“ in `prod` an; in `dev` aus, damit sich
     Testkonten ohne Mail anlegen lassen.
   - Emails → SMTP Settings (nur `prod`): Brevo, Host `smtp-relay.brevo.com`, Port 587, Login und SMTP-Key aus Brevo
     (SMTP & API → SMTP), Absender auf der bei Brevo bestätigten Domain. Emails → Templates: Vorlagen aus `supabase/templates/` übernehmen
     (Betreff steht jeweils im Kommentar).

4. Edge Functions: Unter GitHub → Settings → Secrets and variables → Actions das Secret `SUPABASE_ACCESS_TOKEN` anlegen
   (Token von supabase.com/dashboard/account/tokens). Der Workflow `deploy-functions.yml` deployt dann bei jedem Push
   die Functions `publish` und `cleanup-images` in beide Projekte; von Hand über Actions → „Deploy functions“ → „Run workflow“.
5. Bilder aufräumen: einen zufälligen Wert (z. B. `openssl rand -hex 32`) als GitHub-Secret `CLEANUP_SECRET` und in jedem
   Supabase-Projekt unter Edge Functions → Secrets als `CLEANUP_SECRET` anlegen. Der Workflow `cleanup-images.yml` löscht
   dann täglich die Bilder gelöschter Rätsel.

Dokumentation in [`docs/`](docs/): [Konzept](docs/KONZEPT.md) · [Architektur](docs/ARCHITEKTUR.md) · [Roadmap](docs/ROADMAP.md)
