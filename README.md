# LifeOS

A single-page life-tracking dashboard (habits, goals, finance, fitness,
nutrition, tasks, journal) built with React + Vite + Tailwind. Data is
saved to your browser's `localStorage` — nothing leaves your machine.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Build for production

```bash
npm run build
npm run preview
```

## Project structure

```
index.html
src/
  main.jsx       # mounts <App />
  App.jsx        # the whole LifeOS app (all modules live in this one file)
  index.css      # Tailwind entry point
tailwind.config.js
postcss.config.js
vite.config.js
package.json
```

## Notes

- All data (habits, goals, transactions, workouts, tasks, journal entries,
  nutrition/water logs) is stored in `localStorage` under keys prefixed
  `lifeos:`. Clearing your browser storage clears the app's data.
- Use the in-app **Settings → Export backup** button to download a JSON
  snapshot, and **Restore from backup** to reload it later or on another
  browser.
