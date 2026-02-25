# Solar Shadow Simulator

Interactive solar shadow simulator for a courtyard in Downer, Canberra (-35.28°S, 149.13°E).

Visualises real-time shadow patterns, sun exposure percentages, and daily sun-hours heatmaps to help with garden and plant placement planning.

## Live Demo

Open `index.html` in a browser, or deploy to GitHub Pages.

## Setup

No build tools required. The app uses React via CDN with Babel in-browser transpilation.

```bash
# Local development — just open in browser
open index.html

# Or use a local server (avoids CORS issues with file:// protocol)
npx serve .
```

### GitHub Pages Deployment

1. Push this repo to GitHub
2. Go to Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, folder: `/ (root)`
3. Site will be live at `https://<username>.github.io/<repo-name>/`

## Architecture

### Files

- `index.html` — Shell that loads React CDN and mounts the component
- `app.jsx` — Single self-contained React component (~500 lines)

### Physics Model

**Open courtyard** uses 2D shadow polygon projection. Each wall of height H casts a trapezoidal shadow with length `(H - z) / tan(altitude)` opposite the sun's azimuth, where z is the observation height (plant height slider).

**Covered area** uses 3D raytrace. For each floor grid point, a ray is cast toward the sun through a box model (2.6m × 1.5m × 2.2m ceiling). The point receives sun only if the ray exits through the north face opening AND clears all courtyard walls beyond.

**Solar position** uses the NOAA algorithm (Julian century → equation of time → hour angle → altitude/azimuth).

### Courtyard Layout

```
Plan north is rotated 12° CCW from true north.

   ┌─────────────────────┐
   │  5m                 │1m
   │                     ├──┐
   │                     │  │ 1m
   │    OPEN COURTYARD   │  │
   │    6m × 2.7m        │  │
   │                     │  │
   ├────────┬────────────┴──┤
   │COVERED │   INDOOR      │
   │2.6×1.5 │   3.4×1.5     │
   └────────┴───────────────┘
```

### Wall Heights

- North/east brick walls: 1.8m (red)
- West wall (covered area): 2.0m (yellow)
- Building (south face + indoor): 7m / 2-storey (blue)
- Balcony ceiling: 2.2m (covered area only)

### Key Features

- **Live shadow view** — real-time shadow polygons with time/date sliders
- **Sun hours heatmap** — daily sun accumulation per grid cell (15-min intervals, 15cm grid)
- **Plant height slider** — 0–150cm, adjusts shadow calculations for raised planters
- **Winter solstice overlay** — dashed reference showing Jun 21 shadows at same time
- **Day animation** — sweeps 6am–6pm to visualise shadow movement
- **AEST/AEDT toggle** — daylight saving time support

## Future Ideas

- Editable courtyard dimensions (drag walls)
- Upload floorplan image and extract geometry
- Plant database with sun requirement matching
- Seasonal summary (average daily sun hours per month)
- Share courtyard configs via URL parameters
