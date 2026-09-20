# CLAUDE.md — Context for Claude Code

## Project Overview

Solar shadow simulator for two courtyards (front and back) at a property in Downer, Canberra. Single-page React app, no build tools, React loaded via CDN.

## Key Files

- `app.jsx` — The entire application. Single React component. Edit this for all changes.
- `index.html` — Shell that loads React CDN + Babel + mounts component. Rarely needs editing.

## Technical Notes

- React hooks are destructured from global `React` (not ES module imports) because we use CDN React
- No `export default` — the component function `SolarShadowSimulator` is a global
- JSX is transpiled in-browser by Babel standalone — this means no build step but slightly slower page load
- All solar calculations, geometry, and rendering are inline in the single component

## Coordinate System

- Origin (0,0) = NW corner of the active courtyard
- X increases eastward, Y increases southward
- Plan north is rotated 12° CCW from true north (NOFF constant) — same for both courtyards, same building
- All measurements in metres

## Courtyard config

Both courtyards live in the `COURTYARDS` object (keyed `front`/`back`), near the top of `app.jsx`. Each entry is fully self-contained: `cyPoly`/`covPoly`/`inPoly` (shape polygons), `covBox` (the covered-area raytrace box, with `open` set to whichever face — `"north"`/`"south"`/`"east"`/`"west"` — is unobstructed), `cyWalls`/`extWalls`/`visWalls` (wall lists), and `width`/`yMax` (overall bounding size, used for the SVG). The `courtyard` state picks the active entry (`cfg`), which is threaded through `compute()`, `computeHeatmap()`, `covCells`, and all the SVG geometry — there's no other per-courtyard state to keep in sync.

## Common Tasks

### Adjusting courtyard dimensions
Edit the relevant courtyard's entry in `COURTYARDS` — update `cyPoly`, `covPoly`, `inPoly`, `covBox`, `cyWalls`, `extWalls`, `visWalls`, and `width`/`yMax` together so they stay consistent.

### Adding a new courtyard
Add a new key to `COURTYARDS` following the same shape as `front`/`back`, then add a toggle button for it next to the existing Front/Back Courtyard buttons.

### Changing wall heights
Wall arrays use height as the last numeric element. Update in the courtyard's `cyWalls`, `extWalls`, and `visWalls`.

### Testing locally
`npx serve .` then open localhost. The file:// protocol may have CORS issues with the external JSX file.

## Deployment

GitHub Pages from main branch, root folder. No build step needed.
