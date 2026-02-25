# CLAUDE.md — Context for Claude Code

## Project Overview

Solar shadow simulator for a specific courtyard in Downer, Canberra. Single-page React app, no build tools, React loaded via CDN.

## Key Files

- `app.jsx` — The entire application. Single React component. Edit this for all changes.
- `index.html` — Shell that loads React CDN + Babel + mounts component. Rarely needs editing.

## Technical Notes

- React hooks are destructured from global `React` (not ES module imports) because we use CDN React
- No `export default` — the component function `SolarShadowSimulator` is a global
- JSX is transpiled in-browser by Babel standalone — this means no build step but slightly slower page load
- All solar calculations, geometry, and rendering are inline in the single component

## Coordinate System

- Origin (0,0) = NW corner of courtyard
- X increases eastward, Y increases southward
- Plan north is rotated 12° CCW from true north (NOFF constant)
- All measurements in metres

## Common Tasks

### Adjusting courtyard dimensions
Update: CY_POLY, COV_POLY, IN_POLY, CY_WALLS, EXT_WALLS, VIS_WALLS, and the covered area bounds in isCovLit() and covCells useMemo.

### Changing wall heights
Wall arrays use height as the last numeric element. Update in CY_WALLS, EXT_WALLS, and VIS_WALLS.

### Testing locally
`npx serve .` then open localhost. The file:// protocol may have CORS issues with the external JSX file.

## Deployment

GitHub Pages from main branch, root folder. No build step needed.
