# For The Record MC — Music Club App

App for tracking music-club engagement across friends: each cycle a randomly-spun
picker chooses two albums, the club schedules a meeting, everyone rates and reviews,
and suggestions/concerts flow through a social feed.

- **Plan & decisions:** [PLAN.md](PLAN.md)
- **Agent/architecture reference:** [AGENTS.md](AGENTS.md)
- **App source (Expo / React Native + web):** [app/](app/)
- **Database (Supabase, migrations-only):** [supabase/](supabase/)
- **Original single-file MVP (design reference):** [legacy/index.html](legacy/index.html)

## Run locally

```bash
cd app
npm install
npx expo start        # iOS simulator / Expo Go / press "w" for web
```

Requires `app/.env.local` (gitignored) — see [context/tech-stack.md](context/tech-stack.md).

## Deploy

Every push to `main` builds the web export via GitHub Actions and publishes to
GitHub Pages: https://jordanreticker.github.io/music-club-app/
