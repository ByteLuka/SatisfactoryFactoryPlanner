# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser-based Satisfactory factory planner. Players declare their game progress in Phase 1 (Space Elevator phase, HUB milestones, MAM research, alternate recipes), and future phases will use that state to solve optimal production chains and render factory layouts.

## Commands

```bash
npm run dev          # Vite dev server with HMR at localhost:5173
npm run build        # tsc type-check + Vite production build → dist/
npm run preview      # serve the production build locally
npm run fetch-data   # re-download game data → public/data/data.json
```

No test runner or linter is configured yet.

## Stack

- TypeScript 5.5 strict mode, React 19, Vite 8, React Router 7, Tailwind CSS 4
- **Phase 2 additions:** `@xyflow/react` (React Flow v12) for the graph canvas, `elkjs/lib/elk.bundled.js` for hierarchical layout (lazy-loaded), `javascript-lp-solver` for LP solving inside a Web Worker
- Entry point: `index.html` → `src/main.tsx` → `src/App.tsx`
- Tailwind v4: configured via `@tailwindcss/vite` plugin (no `tailwind.config.js`); custom tokens defined in `src/index.css` under `@theme`
- Routing: `BrowserRouter` in `main.tsx`, routes declared in `App.tsx`

## Architecture

### Layered separation — strict rule

Raw `data.json` shapes **never leave `src/data/`**. The flow is:

```
public/data/data.json
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
- `src/hooks/useGameState.ts` — consumer hook with derived boolean helpers

`GameState` holds four fields: `projectPhase`, `unlockedMilestones`, `completedMamResearch`, `unlockedAlternates` — all keyed by schematic `className` strings.

**Plan state (Phase 2 graph/solver state):**
- `src/types/plan.ts` — all Phase 2 domain types (`SolverInput`, `SolverOutput`, `ProductionPlan`, `PlanNode`, `PlanEdge`, `OptimizationStrategy`)
- `src/store/PlanContext.tsx` — `PlanState` + `PlanAction` reducer; wraps all routes in `App.tsx`
- `PlanState` holds: targets, resourcePool, strategy, solverResult, manualMachineCounts, nodePositions, solverMode, layoutVersion

### Data shape (data.json)

Source: the official `Docs.json` shipped with the game at
`<install>/CommunityResources/Docs/Docs.json`, pre-parsed into `public/data/data.json`
via the `fetch-data` script (based on community tooling — see **Data Sources** below).

Top-level keys: `items`, `recipes`, `schematics`, `generators`, `resources`, `miners`, `buildings`.

Schematics are the unlock system. Relevant types (`schematic.type`):
- `EST_Milestone` — HUB milestones, grouped by `tier` (1–8); tier range maps to Space Elevator phase via `PROJECT_PHASE_MAX_TIER` in `domain.ts`
- `EST_MAM` — MAM research nodes; all have `tier: 3`; grouped into named trees by `className` prefix (e.g. `Research_Caterium_*` → "Caterium" tree)
- `EST_Alternate` — alternate recipes from Hard Drives; `unlock.recipes` lists the recipe classNames they unlock
- `EST_HardDrive`, `EST_ResourceSink`, `EST_Tutorial`, `EST_Custom` — not used in Phase 1

`schematic.unlock.recipes` is the key field: it lists which recipe classNames become available when a schematic is completed. This is what Phase 2 will consume to build the set of available recipes.

### Known data gaps

Some data is not present in `Docs.json` and must be handled separately:

- **Raw resource extraction rates** (Iron Ore, Copper Ore, etc.) — mining recipes are not in the recipes list; treat them as hardcoded source nodes with configurable rate (default: Mk.1 miner on normal node = 60/min).
- **Belt and pipe transfer rates** — present in building descriptors but sparse; hardcode as constants (Conveyor Mk1–Mk5, Pipeline Mk1–Mk2).
- **Building connector positions** (exact X/Y/Z of belt/pipe ports) — defined in Unreal Engine blueprints, not in `Docs.json`. Required for Phase 3 layout rendering; extract via FModel or greeny's `parsePak` script when that phase begins.
- **Building footprint dimensions** — partially available via `mClearanceData` bounding boxes in building entries (e.g. Assembler is ~900×1600 units). Parse these when needed for Phase 3.

### Phase 2 — Production Planner (implemented)

**New files:**
- `src/types/plan.ts` — all Phase 2 types
- `src/data/resources.ts` — hardcoded full-map resource pool limits (13 resources)
- `src/data/planTransformers.ts` — `SolverOutput → React Flow nodes/edges`; `transformPlanToGraphData()`
- `src/workers/solver.worker.ts` — LP solver Web Worker using `javascript-lp-solver`; handles all three strategies; diagnostic infeasibility messages
- `src/hooks/useSolver.ts` — typed worker wrapper exposing `{ solve, status, result, cancel }`
- `src/hooks/useAvailableRecipes.ts` — derives machine-usable recipes + producible items from `GameState` + `GameData`
- `src/store/PlanContext.tsx` — plan state context
- `src/utils/graphLayout.ts` — ELK `layered` layout (lazy-loaded via `elkjs/lib/elk.bundled.js`)
- `src/components/phase2/nodes/ResourceNode.tsx` — raw resource node (left side of graph)
- `src/components/phase2/nodes/RecipeNode.tsx` — recipe/machine node (editable count in manual mode)
- `src/components/phase2/nodes/ProductNode.tsx` — target output node (shows achieved vs target rate)
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

Understanding the full roadmap prevents architectural decisions that paint later phases into a corner.

### Phase 2 — Production planner (next)

The user specifies what they want to produce and the planner computes the required production chain.

**Inputs:**
- Target items with desired output rates (e.g. "100 Modular Frames/min"), or no rate for max-output mode
- Optional: constrained resource pool (e.g. "I only have 240 Iron Ore/min available"); defaults to the full map resource pool
- Optimization strategy (see below)

**Optimization strategies** (multi-objective; solver must support switching between them):
- **Maximum output** — given fixed resources, maximize production of the target item; auto-selects best alternate recipes
- **Minimal machines** — minimize total machine count
- **Minimal recipe diversity** — minimize number of distinct recipes used (simpler factory to build)
- More strategies may be added; design the solver interface to accept a pluggable objective function

**Solver approach:** this is a multi-objective linear programming problem. Use a WASM-compiled LP solver running in a Web Worker (e.g. HiGHSjs or `javascript-lp-solver`) so it does not block the UI. The solver operates on the recipe graph derived from `GameState.unlockedMilestones + completedMamResearch + unlockedAlternates`.

**Output:** a production plan — a directed graph of (recipe → machine count → input/output rates). This graph is the input to Phase 3.

**Modular factories:** the user can split the production plan into named modules (e.g. a "Screw Module" that produces screws for downstream consumers). The solver can also suggest a modular decomposition automatically. Modules become the organisational unit for Phase 3 layout.

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

`public/data/data.json` is derived from official and community sources. Do not hand-edit it; re-run `npm run fetch-data` after a game update.

| Source | What it provides | URL |
|---|---|---|
| Official `Docs.json` | Ground truth — items, recipes, buildings, schematics | Shipped with the game at `<install>/CommunityResources/Docs/` |
| SatisfactoryTools/SatisfactoryData | Versioned, pre-parsed community data (used by `fetch-data`) | https://github.com/SatisfactoryTools/SatisfactoryData |
| greeny/SatisfactoryTools | Reference parser (`parseDocs` script) and `data.json` format | https://github.com/greeny/SatisfactoryTools |
| lunafoxfire/satisfactory-docs-parser | npm parser; clean typed output incl. schematics unlock tree | https://github.com/lunafoxfire/satisfactory-docs-parser |
| Official Satisfactory Wiki | Human-readable reference for belt speeds, building stats, phases | https://satisfactory.wiki.gg |

When the game updates, the community typically updates `SatisfactoryData` first. Check that repo before writing any data migration code.
