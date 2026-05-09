import type { Recipe } from './domain';

export enum OptimizationStrategy {
  MAX_OUTPUT = 'MAX_OUTPUT',
  BALANCED = 'BALANCED',
  OPT_MACHINES = 'OPT_MACHINES',
  OPT_RECIPES = 'OPT_RECIPES',
}

export interface ProductionTarget {
  id: string;
  itemClassName: string;
  ratePerMin?: number;
}

export interface ManualInput {
  id: string;
  itemClassName: string;
  ratePerMin: number;
}

export interface ResourcePool {
  mode: 'map' | 'custom';
  limits: Record<string, number>;
}

export interface SolverInput {
  targets: ProductionTarget[];
  availableRecipes: Recipe[];
  resourcePool: ResourcePool;
  strategy: OptimizationStrategy;
  manualInputs: ManualInput[];
}

export interface SolverOutput {
  status: 'optimal' | 'infeasible' | 'unbounded' | 'error';
  plan?: ProductionPlan;
  errorMessage?: string;
}

export interface ProductionPlan {
  nodes: PlanNode[];
  edges: PlanEdge[];
  resourceUsage: Record<string, number>;
  importUsage: Record<string, number>;
  totalMachineCount: number;
}

export interface PlanNode {
  id: string;
  recipeClassName: string;
  /** Exact fractional machine count from solver */
  machineCount: number;
  inputRates: Record<string, number>;
  outputRates: Record<string, number>;
}

export interface PlanEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  itemClassName: string;
  ratePerMin: number;
}

// Worker message protocol
export type MainToWorker = { type: 'SOLVE'; payload: SolverInput };

export type WorkerToMain =
  | { type: 'SOLVE_RESULT'; payload: SolverOutput }
  | { type: 'SOLVE_ERROR'; payload: { message: string } };
