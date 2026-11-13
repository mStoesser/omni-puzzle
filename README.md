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
4. Eigene Domain (`kibix.app`, Registrar Spaceship):
   - DNS: `A` für `@` auf `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`;
     `AAAA` für `@` auf `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`;
     `CNAME` für `www` auf `mstoesser.github.io`. Keine Wildcard-Einträge.
   - Domain im GitHub-Profil verifizieren (Settings → Pages → „Add a domain“, TXT-Eintrag
     `_github-pages-challenge-mStoesser.kibix.app`), damit kein anderes Repo sie übernehmen kann.
   - Im Repository unter Settings → Pages → Custom domain `kibix.app` eintragen, danach „Enforce HTTPS“ einschalten.
     Eine `CNAME`-Datei im Repository ist nicht nötig (beim Deployment per GitHub Actions wird sie ignoriert).
   - Die alte Adresse `https://mstoesser.github.io/omni-puzzle/` leitet GitHub per 301 weiter; der Teil nach `#`
     bleibt erhalten, alte Teilen-Links und QR-Codes funktionieren also weiter.

## Backend (Supabase, ab Phase 2)

Ohne Backend-Konfiguration läuft die App ohne Community-Funktionen.

1. Migrationen aus `supabase/migrations/` der Reihe nach im Supabase-Dashboard anwenden (SQL Editor), erst `dev`, dann `prod`.
2. Projekt-URL und Publishable Key (Settings → API Keys) in `.env.development` (Projekt `dev`) bzw. `.env.production` (Projekt `prod`) eintragen.
   Den Secret- bzw. Service-Role-Key nie in die App oder ins Repository.
3. Authentication einstellen (beide Projekte):
   - URL Configuration: „Site URL“ = Adresse der App (prod: `https://kibix.app/`, dev: `http://localhost:5173/`),
     unter „Redirect URLs“ in prod `https://kibix.app/**`, zusätzlich die Dev-Adressen (`http://localhost:5173/**`, `http://192.168.178.21:5173/**`).
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
