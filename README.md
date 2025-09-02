# Solar System Sandbox

[![Live Demo](https://img.shields.io/badge/Live-Demo-2ea44f)](https://mrgreenish.github.io/solar-system-simulator/)

Live demo: https://mrgreenish.github.io/solar-system-simulator/

Single-file HTML5 solar system sandbox simulation. Paint matter (gas/rock/ice), watch gravity form stars and planets, and play with orbits — no build, no deps. Just open `index.html`.

## Features
- Canvas 2D physics with softening + Leapfrog integrator
- Inelastic merging, realistic density → radius, body classification
- Tools: Gas, Rock/Dust, Ice, Eraser; throw with `V`
- Trails, vectors, edge behavior: Wrap/Bounce/Void
- Orbit Assist (auto v_circ) + Orbit Guide (cursor arrow)
- Seeds: Demo, Random Belt, Preset System
- Save/Load to `localStorage`
- Performance: spatial hashing, body cap (~800)

## Controls
- Paint: click + drag. Hold `V` to throw with velocity
- Pause: `Space` | Tools: `1` Gas, `2` Rock, `3` Ice
- Sidebar sliders: Brush size, Mass per dot, Spawn rate, Gravity G, Time scale, Speed, Softening, thresholds
- Display: Trails, Vectors, Edge behavior, Orbit Assist/Guide
- Tip: Aim for v/v_circ ≈ 1.0 for circular orbits (<1 suborbital, >1 elliptical/escape)

## Presets
- Seed Demo: Star + a few planets and debris
- Random Belt: Adds a ring around the largest star
- Preset System: Stable system with 5–8 planets, occasional moons, debris belt

## Run Locally
- 2D: open `index.html` directly.
- 3D (Three.js):
  - Quick preview (build + serve): `npm install` then `npm run dev` → open printed URL (e.g., http://localhost:4173)
  - Live dev server: `npm run dev:live` (hot reload) → open the URL (e.g., http://localhost:5173)
  - Manual: `npm run build` then `npm run preview`

## GitHub Pages (CI)
- This repo includes a GitHub Actions workflow to publish the static site.
- On push to `main`, the workflow builds the Three.js app and deploys `dist/` to Pages (includes 2D + 3D).
- First-time publish may take ~1–2 minutes.

If Pages isn’t enabled, in GitHub: Settings → Pages → Build and deployment → Source: “GitHub Actions”.

## Development Notes
- All code is inline (HTML/CSS/JS) by design.
- Physics and rendering are documented in code comments; tweak constants in `CONFIG`.

---
MIT-like use encouraged. Have fun painting gravity-driven worlds!
