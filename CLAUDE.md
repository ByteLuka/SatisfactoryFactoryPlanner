# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser-based Satisfactory factory planner. Players declare their game progress in Phase 1 (Space Elevator phase, HUB milestones, MAM research, alternate recipes), and future phases use that state to solve optimal production chains and render factory layouts.

## Bootstrap

`public/generated/data/` is gitignored. On a fresh clone you must generate it before the app can run:

1. Run `npm run preprocess` — writes `items.json`, `recipes.json`, `schematics.json`, `buildings.json` to `public/generated/data/`.
2. `npm run dev` or `npm run build` as normal.

`satisfactory-assets/en-US.json` is committed (≈10 MB). The preprocessing script skips silently when all output files are newer than the source.

## Commands

```bash
npm run dev          # Vite dev server with HMR at localhost:5173
npm run build        # preprocess (if needed) + tsc + Vite production build → dist/
npm run preview      # serve the production build locally
npm run preprocess   # parse satisfactory-assets/en-US.json → public/generated/data/
npx tsc --noEmit     # type-check without building (no separate lint script exists)
```

`prebuild` runs `preprocess` automatically — skips if outputs are newer than the source. `npm run dev` does NOT auto-preprocess; run it manually when source data changes.

No test runner or linter is configured yet. `tsc --noEmit` is the only static analysis available.

## Deployment

The app is served as a static SPA from an nginx container. `npm run build` (triggered by the Docker multi-stage build) runs `prebuild` → preprocess → tsc + Vite. The resulting `dist/` is copied into `nginx:alpine`. `nginx.conf` sets a SPA fallback (`try_files $uri $uri/ /index.html`), immutable caching for hashed assets, and no-cache for `index.html`.

```bash
docker build -t satisfactory-factory-planner .
docker run -p 8080:80 satisfactory-factory-planner
```

The Helm chart lives in `helm/satisfactory-factory-planner/`. `values.yaml` exposes `image.repository`, `image.tag` (defaults to `Chart.appVersion`), `replicaCount`, `service`, `ingress`, and `resources`. The `sfp.*` helpers in `_helpers.tpl` are used across all templates.

## Releases

Versioning follows [Conventional Commits](https://www.conventionalcommits.org/) + [semantic-release](https://semantic-release.gitbook.io/). Config is in `.releaserc.json`. On every push to `main`:

1. `@semantic-release/commit-analyzer` determines the next version from commit types (`fix:` → patch, `feat:` → minor, `feat!:` → major).
2. `@semantic-release/npm` bumps `package.json` (`npmPublish: false`).
3. `@semantic-release/exec` runs `scripts/update-chart-version.mjs <version>` — updates `version` and `appVersion` in `helm/satisfactory-factory-planner/Chart.yaml`.
4. `@semantic-release/git` commits `package.json`, `CHANGELOG.md`, and `Chart.yaml` back to `main` with message `chore(release): <version> [skip ci]`, then creates the git tag.
5. `@semantic-release/github` creates the GitHub Release.
6. The `publish` job (`.github/workflows/release.yml`) builds and pushes the Docker image to `ghcr.io/byteluka/satisfactory-factory-planner` and the Helm chart to `ghcr.io/byteluka/charts` as an OCI artifact.

The Docker image name is hardcoded as `satisfactory-factory-planner` in the workflow (using `${{ github.repository_owner }}` + the literal name) rather than derived from `${{ github.repository }}`, which would produce `satisfactoryfactoryplanner` without dashes after lowercasing.

## Stack

- TypeScript 5.5 strict mode, React 19, Vite 8, React Router 7, Tailwind CSS 4
- **Phase 2:** `@xyflow/react` (React Flow v12), `elkjs/lib/elk.bundled.js` (lazy-loaded), `javascript-lp-solver` (Web Worker)
- Entry point: `index.html` → `src/main.tsx` → `src/App.tsx`
- Tailwind v4: configured via `@tailwindcss/vite` plugin (no `tailwind.config.js`); custom tokens in `src/index.css` under `@theme`
- Routing: `BrowserRouter` in `main.tsx`, routes declared in `App.tsx`

## Architecture

### Layered separation — strict rule

Raw data shapes **never leave `src/data/`**. The flow is:

```
satisfactory-assets/en-US.json  (raw game Docs.json, UTF-16 LE)
  → scripts/preprocess-data.mjs
  → public/generated/data/{items,recipes,schematics,buildings}.json
  → src/data/raw-types.ts     (private shapes matching the JSON)
  → src/data/transformers.ts  (raw → domain types)
  → src/data/loader.ts        (fetch + transform, module-level cache)
  → src/types/domain.ts       (GameData and all clean domain types)
```

Components and hooks only import from `src/types/`, never from `src/data/raw-types.ts`.

### State management

Two React Context + `useReducer` stores:

**Game state (Phase 1 output):** `GameState` holds `projectPhase`, `unlockedMilestones`, `completedMamResearch`, `unlockedAlternates` — all keyed by schematic `className` strings.
- `src/types/game-state.ts`, `src/store/gameStateReducer.ts`, `src/store/GameStateContext.tsx`
- `src/hooks/useGameState.ts` — consumer hook with boolean helpers (`isMilestoneUnlocked`, `isMamResearched`, `isAlternateUnlocked`)
- Phase-downgrade pruning (clearing milestones above the new phase's max tier) is handled in `PhaseProgressPanel`'s `handleDotClick`, not in the reducer. `pruneInaccessibleMilestones` in `gameStateReducer.ts` exists but is not called.

**Plan state (Phase 2):** `PlanState` in `src/store/PlanContext.tsx` holds:
- `targets` — items to produce with optional fixed rates (undefined rate = maximize)
- `manualInputs` — items imported from external factories, each with a fixed supply rate
- `disabledRecipes` — classNames of recipes the user has toggled off; all recipes are enabled by default
- `resourcePool` — map-based or custom raw resource limits
- `strategy` — `OptimizationStrategy` enum: `MAX_OUTPUT | BALANCED | OPT_MACHINES | OPT_RECIPES | OPT_POWER`
- `graphOptions: GraphOptions` — `{ showResourceNodes, showByproductNodes }` display toggles; when a type is hidden, its nodes and all incident edges are filtered out before layout
- `solverResult`, `manualMachineCounts`, `nodePositions`, `solverMode`, `layoutVersion`

`Phase2Page` computes `effectiveStrategy`: if any target has no rate, strategy is forced to `MAX_OUTPUT` regardless of the `strategy` field. Disabled recipes are filtered out of `availableRecipes` before the solve call.

Both providers wrap all routes in `App.tsx`. State persists across navigation and across page reloads via `localStorage` (keys `sfp_game_state` and `sfp_plan_state`). Persistence is wired in the providers via `useEffect` on the state object — no special save action needed. `PlanState.solverResult` is deliberately excluded from localStorage (it's transient and re-derived by running the solver); it is always `null` on initial load. `loadPlanState` merges stored state over `createInitialPlanState()` defaults (`{ ...createInitialPlanState(), ...parsed, solverResult: null }`) so new fields added to `PlanState` automatically get their default values for users with old stored state — no migration step needed.

### Data loading

`src/hooks/useGameData.ts` — wraps `loadGameData()` in a React hook exposing a `LoadState` discriminated union (`loading | success | error`). Module-level `cachedData` means the four JSON fetches happen only once per session. Pages gate rendering on `status === 'success'`.

**HMR stale-cache caveat:** When Vite HMR re-evaluates `transformers.ts` or `domain.ts`, `cachedData` resets to `null` but the React component keeps its old `GameData` in `useState` — `useEffect([], [])` doesn't re-run on re-render, only on mount. Any new domain fields (e.g. `Building.powerConsumption`) will be `undefined` at runtime until the user does a hard refresh (Ctrl+Shift+R). Add `Number.isFinite()` guards when reading newly-added numeric fields to prevent NaN propagation during development.

### Data shape (generated JSON files)

Each file is a `Record<className, Raw*>` object. `buildings.json` contains only the 11 manufacturer buildings (keyed by `Build_*_C`); structural/decorative buildings are excluded.

`RawGameData` declares `generators`, `resources`, and `miners` fields but `loader.ts` never populates them — always `{}`, reserved for future phases.

Schematics are the unlock system (`schematic.type`):
- `EST_Milestone` — HUB milestones, grouped by `tier`; tier range maps to phase via `PROJECT_PHASE_MAX_TIER` in `domain.ts`
- `EST_MAM` — MAM research nodes; all have `tier: 3`; grouped into named trees by `className` prefix (e.g. `Research_Caterium_*` → "Caterium")
- `EST_Alternate` — alternate recipes from Hard Drives; `unlock.recipes` lists the recipe classNames they unlock
- `EST_Custom` / `EST_Tutorial` — auto-unlock at or below the player's current max tier (see Alternate eligibility below)

`schematic.unlock.recipeClassNames` is the key field: it lists which recipe classNames become available. This is what Phase 2 consumes to build the available recipe set.

### Liquid unit normalization — critical invariant

Raw recipe ingredient/product amounts for liquid items (`Item.liquid === true`) are stored in **liters** in the JSON (e.g. `3000` for 3 m³ of crude oil). Resource pool limits in `src/data/resources.ts` are in **m³/min**. `transformers.ts` divides every liquid amount by 1000 at load time to normalize everything to m³. Never read raw liquid amounts without going through this transform — bypassing it causes a 1000× unit mismatch that silently corrupts LP solutions and displayed flow rates. Graph nodes display liquid rates as `m³/min`; solid rates as `/min`.

### Recipe classification

`RawRecipe` has four boolean flags: `inMachine`, `inHand`, `inWorkshop`, `forBuilding`. The domain `Recipe` type omits `inWorkshop` — stripped in `transformers.ts`. MAM tree nodes that only unlock `forBuilding` recipes are excluded from `buildMamTrees`.

Three power fields also pass through from raw to domain `Recipe`: `isVariablePower`, `minPower`, `maxPower`. Variable-power recipes (Particle Accelerator, Converter, Quantum Encoder) ignore the building's `powerConsumption` baseline and instead draw between `minPower` and `maxPower` MW per machine. The domain `Building` type exposes `powerConsumption` and `powerConsumptionExponent` (read from `metadata.*` in `buildings.json`; exponent is `~1.321928` for all current buildings). The underclocking formula is `power = basePower × (clockSpeed/100)^exponent`; `Phase2Page.tsx`'s `powerStats` memo applies this to compute four Plan Summary statistics (min/max × all-at-100% / with-underclock).

### Alternate recipe eligibility (`src/utils/alternateEligibility.ts`)

Used by both `HardDriveSelector` (Phase 1 UI) and `useAvailableRecipes` (Phase 2 solver input). Determines which alternates are eligible given the player's current game state.

**Auto-unlock rule:** `EST_Custom` and `EST_Tutorial` schematics auto-unlock when their `tier ≤ PROJECT_PHASE_MAX_TIER[projectPhase]`. This covers schematics that are not player-togglable — e.g. `Schematic_Alternate_EnrichedCoal_C` is `EST_Custom` tier 4, auto-unlocks at Phase 2, and is a prerequisite for several alternates.

**Three eligibility checks, applied in order:**
1. **Prerequisites** — all `requiredSchematicClassNames` must be in `completedMamResearch`, `unlockedMilestones`, `unlockedAlternates`, or be auto-unlocked. EST_MAM prerequisite nodes that unlock no `inMachine || inHand` recipes are hidden from the MAM UI and are auto-satisfied.
2. **Building** — at least one `producedInClassNames` entry must be an unlocked manufacturer. Buildings are derived from `forBuilding` recipes using `Desc_→Build_` className substitution.
3. **Ingredients** — each ingredient that has a known non-alternate production recipe must be accessible. Items with no standard recipe (Wood, Nuclear Waste, Compacted Coal) are freely gatherable and never block. **Products are not checked** — an alternate is itself a production path for its output; requiring the output to already be accessible would be circular.

**"Memory" pattern in `HardDriveSelector`:** `unlockedAlternates` retains intent even when an alternate becomes ineligible. The checkbox renders `checked={unlocked && eligible}`, appearing unchecked when ineligible but restoring when eligibility returns — no extra state field needed.

`getIneligibilityReasons()` mirrors `isAlternateEligible` and returns human-readable strings explaining why an alternate is blocked (missing prerequisite, building not unlocked, ingredient inaccessible). Used by `HardDriveSelector` for lock-icon tooltips.

### Phase 1 — Game State (implemented)

Single page at `src/components/phase1/Phase1Page.tsx`, composed of three sections:

- **`PhaseProgressPanel`** — Space Elevator phase selector + HUB milestone checklist. Each phase row has three independent interactions: the **activation dot** (left) sets `projectPhase` and prunes milestones above the new phase's max tier; the **chevron** (right) expands/collapses tier sections; the **segmented bar** (middle-right) bulk-toggles all milestones for that phase. The top-level `CircularProgress` bulk-toggles all milestones across all phases and also sets `projectPhase` (Phase 5 when checking all, Phase 1 when clearing all). Milestone rows show a lock icon with tooltip when cost items aren't producible given current unlocks.
- **`MamResearchTree`** — collapsible tree sections, each with a `CircularProgress` header. Only shows nodes that unlock `inMachine || inHand` recipes.
- **`HardDriveSelector`** — flat searchable list of alternate recipes with eligibility filtering (eligible first, then ineligible alphabetically). Ineligible rows show a lock icon; hovering reveals the ineligibility reason via `title` tooltip. Progress circle counts only eligible alternates.

**`CircularProgress`** (`src/components/phase1/CircularProgress.tsx`) — shared SVG ring component. With `onClick` it acts as a bulk-toggle button; without it is a display-only element.

**`SegmentedProgressBar`** (`src/components/phase1/SegmentedProgressBar.tsx`) — horizontal bar divided into `total` equal segments with 2 px gaps, filling left-to-right based on `value`. Used for per-phase milestone progress in `PhaseProgressPanel`.

`MilestoneChecklist.tsx`, `ProjectPhaseSelector.tsx`, and `src/pages/Phase2Placeholder.tsx` are unused legacy files left in place.

### Phase 2 — Production Planner (implemented)

**Key files:**
- `src/types/plan.ts` — all Phase 2 types (`OptimizationStrategy`, `ProductionTarget`, `ManualInput`, `SolverInput`, `ProductionPlan`, etc.)
- `src/data/resources.ts` — hardcoded full-map resource pool limits; `FREELY_AVAILABLE_ITEMS` set (Wood, Leaves, Mycelia, etc.)
- `src/data/planTransformers.ts` — `transformPlanToGraphData()`: `ProductionPlan → React Flow nodes/edges`
- `src/workers/solver.worker.ts` — LP solver Web Worker; instantiated via Vite's `new Worker(new URL('../workers/solver.worker.ts', import.meta.url), { type: 'module' })` pattern — do not use a string path
- `src/hooks/useSolver.ts` — typed worker wrapper exposing `{ solve, status, result, cancel }`
- `src/hooks/useAvailableRecipes.ts` — filters eligible recipes + builds producible item list
- `src/utils/graphLayout.ts` — ELK `layered` layout (lazy-loaded)
- `src/components/phase2/TargetInputPanel.tsx` — left sidebar: targets, imported inputs, optimization, resource pool, graph display toggles, solver/manual toggle
- `src/components/phase2/ELKRouteEdge.tsx` — custom React Flow edge type that follows ELK-computed waypoints
- `src/components/phase2/RecipeListPanel.tsx` — recipe toggle panel (expanded by default); grouped by machine; shows in-use indicator
- `src/components/phase2/ProductionGraph.tsx` — React Flow canvas with ELK auto-layout
- `src/components/phase2/nodes/` — one file per node type (`ResourceNode`, `ImportNode`, `RecipeNode`, `ProductNode`, `ByproductNode`)
- `src/pages/Phase2Page.tsx` — outer (loading gate) + inner (hooks + layout); filters disabled recipes before solve

**LP solver design (`solver.worker.ts`):**
- Variables: `recipe_<className>` = fractional machine count, `import_<className>` = imported supply used (≤ specified rate, objective cost 0)
- Constraints: `balance_<item>` (net production ≥ target or ≥ 0), `resource_<item>` (consumption ≤ pool), `max_import_<item>` (import usage ≤ declared rate)
- `FREELY_AVAILABLE_ITEMS` (Wood, Leaves, Mycelia, etc.) are excluded from `rawResources` and from recipe `inputRates` — they don't constrain the LP and don't appear as graph nodes
- `OptimizationStrategy`:
  - `MAX_OUTPUT` — maximizes net production of unrated targets; auto-selected when any target has no rate
  - `BALANCED` — minimizes `sum(fractional machine count)`; fast LP, good general-purpose default
  - `OPT_MACHINES` / `OPT_RECIPES` — start with a `BALANCED` LP solve, then run `greedyEliminate()` which iteratively removes the lowest-usage active recipes (smallest fractional count first) and re-solves, accepting each removal only if the target metric strictly improves: ceiled machine count for `OPT_MACHINES`, active recipe count for `OPT_RECIPES`. Because the allowed-recipe set updates in-place after each accepted removal, later trials benefit from earlier ones — a single pass chains improvements. This is a heuristic (not globally optimal) but avoids MIP, which is too slow for the JS solver.
  - `OPT_POWER` — LP objective uses per-recipe `basePower` as the weight (minimizing power-weighted fractional machine count), then `greedyEliminate()` refines using actual underclocked power as the metric: `floor(x) × basePower + frac^exponent × basePower` per recipe. `Phase2Page` pre-computes `recipePowerCoefficients: Record<string, { basePower, exponent }>` from `gameData.buildings` and passes it via `SolverInput` (variable-power recipes use `(minPower + maxPower) / 2` as `basePower`).
- Infeasibility: re-runs without resource constraints to identify bottleneck resources vs. unproducible items. `buildInfeasibilityMessage` accepts the original strategy and uses `MAX_OUTPUT` (not `BALANCED`) for the unconstrained probe when the caller was `MAX_OUTPUT` — BALANCED trivially satisfies `balance >= 0` with zero machines for unrated targets, producing zero consumption and hiding the real bottleneck.
- MAX_OUTPUT zero-production guard: after building `planNodes`, if any unrated target has net production < 0.001, the result is treated as infeasible (LP technically succeeds with max=0, but this is useless). Routed through `buildInfeasibilityMessage` with the original strategy.
- Resource pool mode invariant: `Phase2Page` substitutes `MAP_RESOURCE_POOL_LIMITS` directly when `resourcePool.mode === 'map'`, ignoring `resourcePool.limits` — the stored limits object may contain stale custom values from a previous session and must never be used in map mode.

**Graph node types and color semantics:**

| Node type | Color | Represents |
|---|---|---|
| `ResourceNode` | Teal (`#0d9488` border) | Raw extracted resource |
| `ImportNode` | Indigo (`#4f46e5` border) | Manually declared external supply |
| `RecipeNode` | Neutral (`#3a3a46` border) | Machine + recipe |
| `ProductNode` | Orange (`#e8820c` border) | Production target |
| `ByproductNode` | Rose (`#be185d` border) | Recipe output not consumed by any downstream recipe and not a production target |

Within `RecipeNode`: input item rates are blue (`#60a5fa`), target-item outputs are green (`#4ade80`), other outputs are amber (`#fbbf24`). Edges use `#606072` at rest. `planTransformers.ts` stores `data.sourceColor` and `data.targetColor` on every edge (derived from the node types at each end) for use by the highlight gradient system — source colors: resource=`#2dd4bf`, import=`#818cf8`, recipe-target-output=`#4ade80`, recipe-byproduct-output=`#fbbf24`; target colors: product=`#e8820c`, byproduct=`#fb7185`, recipe-input=`#60a5fa`. RecipeNode always uses `border-2`; selection changes only the color (never the width) to prevent interior content from shifting by 1 px.

**Byproduct detection** (`computeEdges` in `solver.worker.ts`): an item is a byproduct when it has recipe producers, no downstream consumers, and is not a production target. Its edge goes to a `byproduct_<itemClassName>` sink node. `ByproductNode` appears as a terminal node on the right side of the graph.

**Graph layout (`src/utils/graphLayout.ts`):**
- ELK `layered` algorithm, direction RIGHT, `NETWORK_SIMPLEX` node placement, `ORTHOGONAL` edge routing
- Crossing minimization: `LAYER_SWEEP` strategy + `TWO_SIDED` greedy post-processing + `PREFER_EDGES` model-order hint. Edges are topologically sorted before being passed to ELK so model order hints are meaningful.
- **Port-based routing:** every ELK node declares `FIXED_POS` ports matching the actual React Flow handle positions. Recipe nodes declare per-item input ports (left edge) and output ports (right edge) at `y = 90 + index × 36` (approximating the rendered flex layout). Simple nodes declare a single centered port on the appropriate side. This lets ELK route edges through distinct vertical channels rather than sharing node-center paths.
- `computeLayout` returns `LayoutResult { nodePositions, edgeRoutes }`. `edgeRoutes` maps each edge ID to its ELK-computed bend points (extracted from `edge.sections[].bendPoints`).
- Node size estimates in `planTransformers.ts`: resource/import/byproduct 200×90, recipe 260×(110+36×max(in,out)), product 210×110
- **`ELKRouteEdge`** (`src/components/phase2/ELKRouteEdge.tsx`) — custom React Flow edge type (`'elkRoute'`). After layout, `ProductionGraph` stores the ELK bend points on each edge's `data.waypoints`. `ELKRouteEdge` renders a path through `[sourceHandle, ...waypoints, targetHandle]` with 8 px rounded corners (quadratic bezier). Because `data.waypoints` are frozen at layout time, two runtime corrections apply when nodes are dragged: (1) the first/last waypoints' transverse axis is snapped to `sourceY`/`targetY` to keep entry/exit segments orthogonal; (2) if after snapping a waypoint falls on the wrong side of its handle (backward path), `buildOrthogonalFallback` computes a fresh minimal path — a 3-segment S-shape when the target is ahead, a U-shape when behind. Falls back to `getSmoothStepPath` when no waypoints are present. When `data.highlighted` is true: (a) the base edge stroke is replaced with a gradient at 40% opacity, and (b) a second `<path>` is rendered over it with `stroke-dasharray="16 8"` and the `edge-flow` CSS animation (`@keyframes` in `index.css`). Both use a `<linearGradient gradientUnits="userSpaceOnUse">` stretching from `(sourceX,sourceY)` to `(targetX,targetY)`, with stops from `data.gradientStart` to `data.gradientEnd`. The gradient is injected into `<defs>` inside the edge's `<g>` element (SVG supports `<defs>` anywhere in the tree; IDs are document-global). When `gradientStart === gradientEnd`, no gradient is created and the original `drop-shadow` glow is applied instead.
- "Reset layout" re-runs ELK; dragging nodes uses React Flow's built-in state

**Graph interaction (edge/node highlighting):**
- `ProductionGraph` maintains `highlightedEdgeIds: Set<string>` and `selectedNodeId: string | null` state. `displayEdges` is a `useMemo` that layers highlight data onto matching edges without mutating `useEdgesState`, so layout re-runs can safely call `setEdges(layoutedEdges)` and the highlight layer is never lost.
- `onEdgeClick` — click once to highlight that edge exclusively (`selectedNodeId = null`); click the same edge again to clear. Gradient runs `sourceColor → targetColor` (full).
- `onNodeClick` — sets `selectedNodeId = node.id` and highlights all connected edges. Outgoing edges get `sourceColor → gray`; incoming edges get `gray → targetColor`. This one-sided gradient communicates flow direction from the selected node.
- `onPaneClick` — clears both `highlightedEdgeIds` and `selectedNodeId`. Both also clear automatically when a new layout runs.
- `displayEdges` computes `data.gradientStart` / `data.gradientEnd` for every edge (gray/gray for non-highlighted, appropriate endpoint colors for highlighted) — `ELKRouteEdge` reads these to decide whether to render a gradient.
- When any edge is highlighted, the outer `<div>` gains the `graph-has-highlight` CSS class, which dims all `.react-flow__edge-path` elements not inside `.edge-highlighted` to 15% opacity (defined in `index.css`).
- `nodesConnectable={false}` and `edgesReconnectable={false}` on the `ReactFlow` component disable drag-to-connect and drag-to-reconnect respectively; `.react-flow__handle { cursor: default !important }` in `index.css` removes the crosshair cursor from all handles.

**Phase 2 page layout:** The outer container uses `h-screen overflow-hidden flex flex-col` so the document never becomes scrollable. The sidebar `<aside>` is a plain block element with `overflow-y-auto` — it must NOT be a flex container, because a flex column measures its own height from its children and `overflow-y-auto` never activates. An inner `<div className="flex flex-col gap-4">` provides the spacing layout. The graph fills the remaining space via `flex-1`.

### Routing

```
/       → HomePage     (landing page — early-dev notice, feature overview)
/phase1 → Phase1Page   (game state)
/phase2 → Phase2Page   (LP solver + React Flow graph)
/phase3 → (TODO) factory layout
*       → redirect to /
```

### Shared layout

**`AppHeader`** (`src/components/AppHeader.tsx`) — used on all three pages. Renders the app title (click → `/`), optional back button, subtitle, step-progress dots, app version badge, and the GitHub stats widget (`src/hooks/useGitHubStats.ts` — fetches live star/fork counts from `api.github.com`, module-level cached).

**`ErrorBoundary`** (`src/components/ErrorBoundary.tsx`) — class component wrapping route-level pages; accepts an optional `fallback` render prop, otherwise shows a full-screen error card.

**`LoadingSpinner`** (`src/components/LoadingSpinner.tsx`) — inline spinner used while `useGameData` is in the `loading` state.

**`__APP_VERSION__`** — injected at build time by `vite.config.ts` via `define: { __APP_VERSION__: JSON.stringify(version) }` (reads `package.json`). Declared globally in `src/types/javascript-lp-solver.d.ts`. Use directly as a string; no import needed.

**Graph node font sizes are intentionally tiny** — `text-[10px]` in node files (`RecipeNode`, `ResourceNode`, etc.) must not be bumped without also updating the hardcoded port positions in `graphLayout.ts` (`y = 90 + index × 36`) and node size estimates in `planTransformers.ts`.

### Component conventions

- Phase-specific components: `src/components/phase{N}/`
- Pages (route targets): `src/pages/`
- Shared UI: `src/components/`
- Data-fetching and state-selection logic extracted to `src/hooks/`; components receive data as props

### Styling

Dark industrial theme. Base palette:
- Background: `#1a1a1f` / Surface: `#25252d` / Surface-2: `#2e2e38`
- Border: `#3a3a46` / Text: `#e8e8f0` / Muted: `#8888a0`
- Accent (Satisfactory orange): `#e8820c` / Accent dark: `#c4690a`

Graph canvas background: `#14141a` (intentionally darker than the app surface to make nodes and edges stand out). Edges at rest: `#606072`.

Graph node / flow colors (phase 2 only):
- Resource nodes: teal (`#0d9488`, `#2dd4bf`, `#0d2b2b`)
- Import nodes: indigo (`#4f46e5`, `#818cf8`, `#1e1b4b`)
- RecipeNode inputs: blue `#60a5fa`; target outputs: green `#4ade80`; other outputs: amber `#fbbf24`
- Byproduct nodes: rose (`#be185d`, `#fb7185`, `#fda4af`, `#2d1320`)

### Known data gaps

- **Raw resource extraction rates** — not in `recipes.json`; treat as hardcoded source nodes (Mk.1 miner on normal node = 60/min).
- **Building connector positions** (belt/pipe ports) — in Unreal blueprints, not `Docs.json`; needed for Phase 3.
- **Building footprint dimensions** — partially in `mClearanceData` in `en-US.json`; parse when needed for Phase 3.

---

## Product vision & future phases

### Phase 3 — Interactive factory layout (future)

A visual node-graph editor where the user can:
- See machines placed as nodes with belt/pipe connections as edges
- Drag and reposition machines, modules, belts, and pipes
- Organise by module (each module is a visual group)
- Switch to **read-only rebuild mode**: a checklist-style view the player follows while rebuilding in-game

Tech candidates: React Flow or Rete.js; building connector positions from FModel or greeny's `parsePak` script.

### Phase 4 — Persistence & sharing (future)

A lightweight backend (Supabase recommended) for saving plans to an account, sharing via URL, and a public gallery. The factory plan is a JSON blob — design the serialisation format with this in mind from Phase 2 onwards.

---

## Data sources

| Source | What it provides |
|---|---|
| Official `Docs.json` | Ground truth — items, recipes, buildings, schematics (at `<install>/CommunityResources/Docs/`) |
| Official Satisfactory Wiki | Human-readable reference — https://satisfactory.wiki.gg |
| greeny/SatisfactoryTools | Reference parser for Docs.json format — https://github.com/greeny/SatisfactoryTools |
