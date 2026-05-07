# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser-based Satisfactory factory planner. Players declare their game progress in Phase 1 (Space Elevator phase, HUB milestones, MAM research, alternate recipes), and future phases will use that state to solve optimal production chains and render factory layouts.

## Bootstrap

`public/generated/data/` is gitignored. On a fresh clone you must generate it before the app can run:

1. Copy the game's `Docs.json` (from `<install>/CommunityResources/Docs/Docs.json`) to `satisfactory-assets/en-US.json`.
2. Run `npm run preprocess` — writes `items.json`, `recipes.json`, `schematics.json`, `buildings.json` to `public/generated/data/`.
3. `npm run dev` or `npm run build` as normal.

`satisfactory-assets/en-US.json` is not committed (too large). The preprocessing script skips silently when the file is absent and all output files are already present.

## Commands

```bash
npm run dev          # Vite dev server with HMR at localhost:5173
npm run build        # preprocess (if needed) + tsc + Vite production build → dist/
npm run preview      # serve the production build locally
npm run preprocess   # parse satisfactory-assets/en-US.json → public/generated/data/
```

`prebuild` runs `preprocess` automatically — it skips if outputs are newer than the source file, so it adds no overhead when nothing has changed. `npm run dev` does NOT auto-preprocess; run `npm run preprocess` manually when the source data changes.

No test runner or linter is configured yet.

## Stack

- TypeScript 5.5 strict mode, React 19, Vite 8, React Router 7, Tailwind CSS 4
- **Phase 2 additions:** `@xyflow/react` (React Flow v12) for the graph canvas, `elkjs/lib/elk.bundled.js` for hierarchical layout (lazy-loaded), `javascript-lp-solver` for LP solving inside a Web Worker
- Entry point: `index.html` → `src/main.tsx` → `src/App.tsx`
- Tailwind v4: configured via `@tailwindcss/vite` plugin (no `tailwind.config.js`); custom tokens defined in `src/index.css` under `@theme`
- Routing: `BrowserRouter` in `main.tsx`, routes declared in `App.tsx`

## Architecture

### Layered separation — strict rule

Raw data shapes **never leave `src/data/`**. The flow is:

```
satisfactory-assets/en-US.json  (raw game Docs.json, UTF-16 LE)
  → scripts/preprocess-data.mjs  (Node.js script; run via prebuild or npm run preprocess)
  → public/generated/data/{items,recipes,schematics,buildings}.json
  → src/data/raw-types.ts    (private shapes matching the JSON)
  → src/data/transformers.ts (converts raw → domain types)
  → src/data/loader.ts       (fetch + call transformers, module-level cache)
  → src/types/domain.ts      (GameData and all clean domain types)
```

Components and hooks only import from `src/types/`, never from `src/data/raw-types.ts`.

### State management

Two separate React Context + `useReducer` stores:

**Game state (Phase 1 output):**
- `src/types/game-state.ts` — `GameState` interface and `ProjectPhase` enum
- `src/store/gameStateReducer.ts` — pure reducer with typed `GameStateAction` union
- `src/store/GameStateContext.tsx` — provider; wraps all routes in `App.tsx`
- `src/hooks/useGameState.ts` — consumer hook with derived boolean helpers (`isMilestoneUnlocked`, `isMamResearched`, `isAlternateUnlocked`)

`GameState` holds four fields: `projectPhase`, `unlockedMilestones`, `completedMamResearch`, `unlockedAlternates` — all keyed by schematic `className` strings.

> **Note:** `pruneInaccessibleMilestones` is exported from `gameStateReducer.ts` and is intended to strip milestones above the current phase's max tier when the player lowers their phase. It is not currently called from `GameStateContext.tsx` — this pruning is unimplemented.

**Plan state (Phase 2 graph/solver state):**
- `src/types/plan.ts` — all Phase 2 domain types (`SolverInput`, `SolverOutput`, `ProductionPlan`, `PlanNode`, `PlanEdge`, `OptimizationStrategy`)
- `src/store/PlanContext.tsx` — `PlanState` + `PlanAction` reducer; wraps all routes in `App.tsx`
- `PlanState` holds: targets, resourcePool, strategy, solverResult, manualMachineCounts, nodePositions, solverMode, layoutVersion

### Data loading

`src/hooks/useGameData.ts` — wraps `loadGameData()` in a React hook that exposes a `LoadState` discriminated union (`loading | success | error`). Holds a module-level `cachedData` variable so the four JSON fetches happen only once per session, even across navigations. Pages gate rendering on `status === 'success'`.

### Data shape (generated JSON files)

Source: `satisfactory-assets/en-US.json` — the official `Docs.json` shipped with the game
(`<install>/CommunityResources/Docs/Docs.json`), parsed by `scripts/preprocess-data.mjs`
into four files under `public/generated/data/`: `items.json`, `recipes.json`, `schematics.json`, `buildings.json`.

Each file is a `Record<className, Raw*>` object (see `src/data/raw-types.ts`).
`buildings.json` contains only the 11 manufacturer buildings (keyed by `Build_*_C`); structural/decorative buildings are excluded as they're not needed for production planning.

`RawGameData` (in `raw-types.ts`) also declares `generators`, `resources`, and `miners` fields but `loader.ts` never populates them — they are always `{}` and reserved for future phases.

Schematics are the unlock system. Relevant types (`schematic.type`):
- `EST_Milestone` — HUB milestones, grouped by `tier`; tier range maps to Space Elevator phase via `PROJECT_PHASE_MAX_TIER` in `domain.ts`
- `EST_MAM` — MAM research nodes; all have `tier: 3`; grouped into named trees by `className` prefix (e.g. `Research_Caterium_*` → "Caterium" tree)
- `EST_Alternate` — alternate recipes from Hard Drives; `unlock.recipes` lists the recipe classNames they unlock
- `EST_HardDrive`, `EST_ResourceSink`, `EST_Tutorial`, `EST_Custom` — not used in Phase 1

`schematic.unlock.recipes` is the key field: it lists which recipe classNames become available when a schematic is completed. This is what Phase 2 consumes to build the set of available recipes.

### Recipe classification

`RawRecipe` (from `raw-types.ts`) has four boolean flags: `inMachine`, `inHand`, `inWorkshop`, `forBuilding`. The domain `Recipe` type (in `domain.ts`) omits `inWorkshop` — it is stripped during transformation in `transformers.ts` and is not available on the domain type. If you need workshop filtering, read `RawRecipe` inside `src/data/` only.

MAM tree nodes are filtered in `buildMamTrees` (transformers.ts) to only include schematics that unlock at least one `inMachine || inHand` recipe. Nodes whose recipes are all `forBuilding` (e.g. building unlocks like Dimensional Depot, Smart Splitter) are excluded. Trees with no remaining nodes are omitted entirely.

### Known data gaps

- **Raw resource extraction rates** — mining recipes are not in `recipes.json`; treat raw resources as hardcoded source nodes (default: Mk.1 miner on normal node = 60/min).
- **Building connector positions** (exact X/Y/Z of belt/pipe ports) — defined in Unreal Engine blueprints, not in `Docs.json`. Required for Phase 3; extract via FModel or greeny's `parsePak` script when that phase begins.
- **Building footprint dimensions** — partially available via `mClearanceData` in `en-US.json`; parse when needed for Phase 3.

### Phase 1 — Game State (implemented)

The Phase 1 UI is a single page (`src/components/phase1/Phase1Page.tsx`) composed of three sections:

- **`PhaseProgressPanel`** — unified Space Elevator phase selector + HUB milestone checklist. Phases are collapsible rows; clicking a phase row sets `projectPhase` (cumulative: Phase 3 implies 1 and 2 are also done). Each row shows a `CircularProgress` that toggles all milestones for that phase. Expanding a phase shows its `TierSection` rows, each also with a `CircularProgress` header. Milestone checkboxes are disabled for phases the player hasn't reached.
- **`MamResearchTree`** — collapsible tree sections, each with a `CircularProgress` header. The section-level `CircularProgress` toggles all nodes across all trees. Only shows nodes that unlock production/crafting recipes (see Recipe classification above).
- **`HardDriveSelector`** — flat searchable list of alternate recipes with a `CircularProgress` in the section header that toggles all alternates.

**`CircularProgress`** (`src/components/phase1/CircularProgress.tsx`) — shared SVG ring component used across all Phase 1 sections. Renders an orange arc proportional to `value/total`. When an `onClick` prop is provided it renders as a button that toggles all items; without it renders as a plain display element.

**Dead files (not imported anywhere):** `ProjectPhaseSelector.tsx`, `MilestoneChecklist.tsx`, `Phase2Placeholder.tsx`, `src/index.ts`.

### Phase 2 — Production Planner (implemented)

**Key files:**
- `src/types/plan.ts` — all Phase 2 types
- `src/data/resources.ts` — hardcoded full-map resource pool limits (13 resources)
- `src/data/planTransformers.ts` — `SolverOutput → React Flow nodes/edges`; `transformPlanToGraphData()`
- `src/workers/solver.worker.ts` — LP solver Web Worker using `javascript-lp-solver`; handles all three strategies; diagnostic infeasibility messages
- `src/hooks/useSolver.ts` — typed worker wrapper exposing `{ solve, status, result, cancel }`
- `src/hooks/useAvailableRecipes.ts` — derives machine-usable recipes + producible items from `GameState` + `GameData`
- `src/utils/graphLayout.ts` — ELK `layered` layout (lazy-loaded via `elkjs/lib/elk.bundled.js`)
- `src/components/phase2/TargetInputPanel.tsx` — left sidebar: item search, rate inputs, resource pool toggle, strategy selector, solver/manual toggle, compute button
- `src/components/phase2/ProductionGraph.tsx` — React Flow canvas with ELK auto-layout and Reset layout button
- `src/pages/Phase2Page.tsx` — assembles Phase 2 UI; splits into outer (loading gate) + inner (hooks) components

**LP solver design:**
- Variables: `recipe_<className>` = fractional machine count
- Constraints: `balance_<item>` (net production ≥ target or ≥ 0), `resource_<item>` (consumption ≤ pool)
- MIN_MACHINES / MIN_RECIPES: minimize `sum(x_r)` — MIN_RECIPES uses same LP (integer programming not available)
- MAX_OUTPUT: maximize net production of target items with no explicit rate
- Infeasibility: re-runs LP without resource constraints to identify bottleneck resources

**Graph layout:**
- ELK `layered` algorithm, direction RIGHT
- Node sizes estimated per type (ResourceNode 200×90, RecipeNode 260×(110+36*max(in,out)), ProductNode 210×110)
- "Reset layout" re-runs ELK; dragging nodes uses React Flow's built-in state

### Routing

```
/         → Phase1Page   (game state questionnaire)
/phase2   → Phase2Page   (production planner — LP solver + React Flow graph)
/phase3   → (TODO) factory layout renderer
*         → redirect to /
```

Both `GameStateProvider` and `PlanProvider` wrap all routes. State persists across navigation; the user can return to Phase 1 to adjust game state and re-run the solver in Phase 2.

### Component conventions

- Phase-specific components live in `src/components/phase{N}/`
- Pages (route targets) live in `src/pages/`
- Shared UI in `src/components/`
- Data-fetching and state-selection logic extracted to `src/hooks/`; components receive data as props

### Styling

Dark industrial theme. Core palette (use these, don't invent new hex values):
- Background: `#1a1a1f` / Surface: `#25252d` / Surface-2: `#2e2e38`
- Border: `#3a3a46` / Text: `#e8e8f0` / Muted: `#8888a0`
- Accent (Satisfactory orange): `#e8820c` / Accent dark: `#c4690a`

---

## Product vision & future phases

### Phase 3 — Interactive factory layout (future)

A visual node-graph editor rendered in the browser where the user can:
- See machines placed as nodes with belt/pipe connections as edges
- Drag and reposition machines, modules, belts, and pipes
- Organise by module (each module is a visual group)
- Switch to **read-only rebuild mode**: a checklist-style view the player follows while rebuilding the factory in-game

**Tech candidates:** React Flow or Rete.js for the node graph; building connector positions from FModel/parsePak for accurate port placement.

### Phase 4 — Persistence & sharing (future)

A lightweight backend (Supabase recommended: Postgres + auth + storage, minimal ops) that allows:
- Saving factory plans to an account
- Sharing a plan via URL
- A public gallery of community plans

The factory plan is a JSON blob; the backend is a thin CRUD API around it. Design the plan serialisation format with this in mind from Phase 2 onwards.

---

## Data sources

The files in `public/generated/data/` are generated by `scripts/preprocess-data.mjs` from `satisfactory-assets/en-US.json`. Do not hand-edit them; replace `en-US.json` with the new game version and run `npm run preprocess`.

| Source | What it provides | URL |
|---|---|---|
| Official `Docs.json` | Ground truth — items, recipes, buildings, schematics | Shipped with the game at `<install>/CommunityResources/Docs/` |
| Official Satisfactory Wiki | Human-readable reference for belt speeds, building stats, phases | https://satisfactory.wiki.gg |
| greeny/SatisfactoryTools | Reference parser for the Docs.json format | https://github.com/greeny/SatisfactoryTools |
