# ankibot

A flashcard tutor web app. Live at **[ankibot.ryanbohluli.com](https://ankibot.ryanbohluli.com)**.

> **Status:** Phase 1 — project scaffold + live deploy. No app features yet.

## Stack

Vite · React 19 · TypeScript · Tailwind CSS v4

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build → dist/
npm run preview  # preview the production build
```

## Deploy

Pushing to `main` triggers a GitHub Actions build that deploys to GitHub Pages
(`.github/workflows/deploy.yml`). The site is served at the root of its own
subdomain, so Vite `base` is `/` and `public/CNAME` holds the custom domain.

Repo **Settings → Pages → Source** must be set to **GitHub Actions**.
