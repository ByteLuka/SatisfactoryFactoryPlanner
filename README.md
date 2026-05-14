# Satisfactory Factory Planner

[![Release](https://img.shields.io/github/v/release/ByteLuka/SatisfactoryFactoryPlanner)](https://github.com/ByteLuka/SatisfactoryFactoryPlanner/releases)
[![CI](https://github.com/ByteLuka/SatisfactoryFactoryPlanner/actions/workflows/ci.yml/badge.svg)](https://github.com/ByteLuka/SatisfactoryFactoryPlanner/actions/workflows/ci.yml)
[![Release](https://github.com/ByteLuka/SatisfactoryFactoryPlanner/actions/workflows/release.yml/badge.svg)](https://github.com/ByteLuka/SatisfactoryFactoryPlanner/actions/workflows/release.yml)
[![Docker Image](https://ghcr-badge.egpl.dev/byteluka/satisfactory-factory-planner/latest_tag?trim=major&label=ghcr.io)](https://github.com/ByteLuka/SatisfactoryFactoryPlanner/pkgs/container/satisfactory-factory-planner)

A browser-based planning tool for [Satisfactory](https://www.satisfactorygame.com/). Declare your game progress — Space Elevator phase, HUB milestones, MAM research, and alternate recipes — then let the planner compute optimal production chains and visualize the factory graph.

> **Early development:** This project is in an early stage. Results may be incomplete or incorrect, and you will likely encounter bugs. Use it as a guide, not as ground truth.

---

## Features

### Phase 1 — Game State
- Select your current Space Elevator phase and unlock HUB milestones tier by tier
- Track MAM research trees and mark completed nodes
- Manage alternate recipes unlocked from Hard Drives, with eligibility checks based on your current unlocks

### Phase 2 — Production Planner
- Define production targets with optional fixed rates; uncapped targets are maximized automatically
- Import external supplies from other factories
- Toggle individual recipes on or off to constrain the solver
- Configure raw resource pool limits per item
- Four optimization strategies: maximize output, balanced, minimize machines, minimize active recipes
- Interactive factory graph with ELK auto-layout, edge highlighting, and manual node repositioning
- Power consumption summary (min/max, with and without underclocking)

### Phase 3 — Interactive Factory Layout (planned)
- Visual node-graph editor with machines as nodes and belts/pipes as edges
- Drag and reposition machines, modules, and connections
- Organize factories into named modules shown as visual groups
- Read-only rebuild mode: a checklist-style view to follow step by step while rebuilding in-game

---

## Running locally

### Prerequisites
- Node.js 22+
- The game's `Docs.json` file from `<Satisfactory install>/CommunityResources/Docs/Docs.json`

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/ByteLuka/SatisfactoryFactoryPlanner.git
cd SatisfactoryFactoryPlanner

# 2. Install dependencies
npm install

# 3. Place the game data file
cp /path/to/Docs.json satisfactory-assets/en-US.json

# 4. Generate derived data files
npm run preprocess

# 5. Start the dev server
npm run dev
```

The app is available at `http://localhost:5173`.

> **Note:** `npm run dev` does not re-run the preprocessor automatically. Re-run `npm run preprocess` manually whenever you replace `en-US.json`.

---

## Deployment

### Docker

```bash
# Build the image
docker build -t satisfactory-factory-planner .

# Run
docker run -p 8080:80 satisfactory-factory-planner
```

The app is served by nginx on port 80 inside the container.

Pre-built images are published to GHCR on every release:

```bash
docker run -p 8080:80 ghcr.io/byteluka/satisfactory-factory-planner:latest
```

### Kubernetes (Helm)

The Helm chart is published to GHCR alongside the Docker image.

```bash
# Add the OCI registry
helm pull oci://ghcr.io/byteluka/charts/satisfactory-factory-planner --version <version>

# Install
helm install sfp oci://ghcr.io/byteluka/charts/satisfactory-factory-planner \
  --version <version> \
  --set ingress.enabled=true \
  --set ingress.host=satisfactory.example.com
```

Key `values.yaml` overrides:

| Key                 | Default                    | Description                    |
|---------------------|----------------------------|--------------------------------|
| `image.tag`         | chart `appVersion`         | Docker image tag to deploy     |
| `replicaCount`      | `1`                        | Number of replicas             |
| `ingress.enabled`   | `false`                    | Enable ingress                 |
| `ingress.host`      | `satisfactory.example.com` | Hostname for the ingress rule  |
| `ingress.className` | `""`                       | Ingress class name             |
| `resources`         | see `values.yaml`          | CPU/memory requests and limits |

---

## Development

### Commands

```bash
npm run dev          # Vite dev server with HMR at localhost:5173
npm run build        # Preprocess (if needed) + tsc + Vite production build → dist/
npm run preview      # Serve the production build locally
npm run preprocess   # Parse satisfactory-assets/en-US.json → public/generated/data/
npx tsc --noEmit     # Type-check without building
```

### Stack

- TypeScript 5.5 (strict), React 19, Vite 8, React Router 7, Tailwind CSS 4
- [`@xyflow/react`](https://reactflow.dev/) — factory graph canvas
- [`elkjs`](https://github.com/kieler/elkjs) — auto-layout (lazy-loaded)
- [`javascript-lp-solver`](https://github.com/JWally/jsLPSolver) — LP solver running in a Web Worker

### Project structure

```
src/
  components/       # UI components, organised by phase
  data/             # Raw type definitions, transformers, loaders, static data
  hooks/            # Data-fetching and state-selection hooks
  pages/            # Route-level page components
  store/            # React Context + useReducer state (game state, plan state)
  types/            # Domain types consumed across the app
  utils/            # Graph layout, alternate eligibility, etc.
  workers/          # LP solver Web Worker
scripts/
  preprocess-data.mjs   # Docs.json → public/generated/data/
public/generated/data/  # Generated at build time, not committed
satisfactory-assets/    # Place en-US.json here (not committed)
helm/                   # Helm chart
.github/workflows/      # CI and release pipelines
```

### Releases

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and [semantic-release](https://semantic-release.gitbook.io/) for automated versioning.

| Commit type                   | Version bump              |
|-------------------------------|---------------------------|
| `fix:`                        | patch (`0.1.0` → `0.1.1`) |
| `feat:`                       | minor (`0.1.0` → `0.2.0`) |
| `feat!:` / `BREAKING CHANGE:` | major (`0.1.0` → `1.0.0`) |

On every push to `main`, the release pipeline:
1. Analyzes commits since the last tag and determines the next version
2. Updates `package.json`, `Chart.yaml`, and `CHANGELOG.md`
3. Creates a git tag and a GitHub Release with auto-generated release notes
4. Builds and pushes the Docker image to GHCR
5. Packages and pushes the Helm chart to GHCR

---

## Data sources

| Source                                                                        | Purpose                                              |
|-------------------------------------------------------------------------------|------------------------------------------------------|
| [Official `Docs.json`](https://satisfactory.wiki.gg/wiki/Community_resources) | Ground truth — items, recipes, buildings, schematics |
| [Satisfactory Wiki](https://satisfactory.wiki.gg)                             | Human-readable reference                             |
| [greeny/SatisfactoryTools](https://github.com/greeny/SatisfactoryTools)       | Reference parser for `Docs.json` format              |
