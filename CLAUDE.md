# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser-based Satisfactory factory planner. Players declare their game progress in Phase 1 (Space Elevator phase, HUB milestones, MAM research, alternate recipes), and future phases use that state to solve optimal production chains and render factory layouts.

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

`prebuild` runs `preprocess` automatically — skips if outputs are newer than the source. `npm run dev` does NOT auto-preprocess; run it manually when source data changes.

No test runner or linter is configured yet.

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

**Plan state (Phase 2):** `PlanState` holds targets, resourcePool, strategy, solverResult, manualMachineCounts, nodePositions, solverMode, layoutVersion.
- `src/types/plan.ts`, `src/store/PlanContext.tsx`

Both providers wrap all routes in `App.tsx`. State persists across navigation.

### Data loading

`src/hooks/useGameData.ts` — wraps `loadGameData()` in a React hook exposing a `LoadState` discriminated union (`loading | success | error`). Module-level `cachedData` means the four JSON fetches happen only once per session. Pages gate rendering on `status === 'success'`.

### Data shape (generated JSON files)

Each file is a `Record<className, Raw*>` object. `buildings.json` contains only the 11 manufacturer buildings (keyed by `Build_*_C`); structural/decorative buildings are excluded.

`RawGameData` declares `generators`, `resources`, and `miners` fields but `loader.ts` never populates them — always `{}`, reserved for future phases.

Schematics are the unlock system (`schematic.type`):
- `EST_Milestone` — HUB milestones, grouped by `tier`; tier range maps to phase via `PROJECT_PHASE_MAX_TIER` in `domain.ts`
- `EST_MAM` — MAM research nodes; all have `tier: 3`; grouped into named trees by `className` prefix (e.g. `Research_Caterium_*` → "Caterium")
- `EST_Alternate` — alternate recipes from Hard Drives; `unlock.recipes` lists the recipe classNames they unlock
- `EST_Custom` / `EST_Tutorial` — auto-unlock at or below the player's current max tier (see Alternate eligibility below)

`schematic.unlock.recipeClassNames` is the key field: it lists which recipe classNames become available. This is what Phase 2 consumes to build the available recipe set.

### Recipe classification

`RawRecipe` has four boolean flags: `inMachine`, `inHand`, `inWorkshop`, `forBuilding`. The domain `Recipe` type omits `inWorkshop` — stripped in `transformers.ts`. MAM tree nodes that only unlock `forBuilding` recipes are excluded from `buildMamTrees`.

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

`MilestoneChecklist.tsx` and `ProjectPhaseSelector.tsx` are unused legacy files left in place.

### Phase 2 — Production Planner (implemented)

**Key files:**
- `src/types/plan.ts` — all Phase 2 types
- `src/data/resources.ts` — hardcoded full-map resource pool limits (13 resources)
- `src/data/planTransformers.ts` — `transformPlanToGraphData()`: `SolverOutput → React Flow nodes/edges`
- `src/workers/solver.worker.ts` — LP solver Web Worker; handles all three strategies; diagnostic infeasibility messages
- `src/hooks/useSolver.ts` — typed worker wrapper exposing `{ solve, status, result, cancel }`
- `src/hooks/useAvailableRecipes.ts` — filters eligible recipes (applying alternate eligibility) + builds producible item list
- `src/utils/graphLayout.ts` — ELK `layered` layout (lazy-loaded)
- `src/components/phase2/TargetInputPanel.tsx` — left sidebar: item search, rate inputs, resource pool toggle, strategy selector, solver/manual toggle, compute button
- `src/components/phase2/ProductionGraph.tsx` — React Flow canvas with ELK auto-layout and Reset layout button
- `src/pages/Phase2Page.tsx` — splits into outer (loading gate) + inner (hooks) components

**LP solver design:**
- Variables: `recipe_<className>` = fractional machine count
- Constraints: `balance_<item>` (net production ≥ target or ≥ 0), `resource_<item>` (consumption ≤ pool)
- MIN_MACHINES / MIN_RECIPES: minimize `sum(x_r)`
- MAX_OUTPUT: maximize net production of target items with no explicit rate
- Infeasibility: re-runs without resource constraints to identify bottleneck resources

**Graph layout:**
- ELK `layered` algorithm, direction RIGHT
- Node sizes: ResourceNode 200×90, RecipeNode 260×(110+36×max(in,out)), ProductNode 210×110
- "Reset layout" re-runs ELK; dragging nodes uses React Flow's built-in state

### Routing

```
/       → Phase1Page   (game state)
/phase2 → Phase2Page   (LP solver + React Flow graph)
/phase3 → (TODO) factory layout
*       → redirect to /
```

### Component conventions

- Phase-specific components: `src/components/phase{N}/`
- Pages (route targets): `src/pages/`
- Shared UI: `src/components/`
- Data-fetching and state-selection logic extracted to `src/hooks/`; components receive data as props

### Styling

Dark industrial theme. Fixed palette — do not invent new hex values:
- Background: `#1a1a1f` / Surface: `#25252d` / Surface-2: `#2e2e38`
- Border: `#3a3a46` / Text: `#e8e8f0` / Muted: `#8888a0`
- Accent (Satisfactory orange): `#e8820c` / Accent dark: `#c4690a`

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
