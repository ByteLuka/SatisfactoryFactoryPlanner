import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type { ProductionTarget, ResourcePool, SolverOutput, ManualInput } from '../types/plan';
import { OptimizationStrategy } from '../types/plan';
import { DEFAULT_RESOURCE_POOL } from '../data/resources';

export interface NodePosition {
  x: number;
  y: number;
}

export interface PlanState {
  solverMode: 'solver' | 'manual';
  targets: ProductionTarget[];
  manualInputs: ManualInput[];
  disabledRecipes: string[];
  resourcePool: ResourcePool;
  strategy: OptimizationStrategy;
  solverResult: SolverOutput | null;
  manualMachineCounts: Record<string, number>;
  nodePositions: Record<string, NodePosition>;
  layoutVersion: number;
}

export type PlanAction =
  | { type: 'ADD_TARGET'; itemClassName: string }
  | { type: 'REMOVE_TARGET'; id: string }
  | { type: 'SET_TARGET_RATE'; id: string; ratePerMin: number | undefined }
  | { type: 'ADD_MANUAL_INPUT'; itemClassName: string }
  | { type: 'REMOVE_MANUAL_INPUT'; id: string }
  | { type: 'SET_MANUAL_INPUT_RATE'; id: string; ratePerMin: number }
  | { type: 'SET_RESOURCE_POOL_MODE'; mode: 'map' | 'custom' }
  | { type: 'SET_RESOURCE_LIMIT'; itemClassName: string; limit: number }
  | { type: 'SET_STRATEGY'; strategy: OptimizationStrategy }
  | { type: 'SET_SOLVER_RESULT'; result: SolverOutput }
  | { type: 'SET_SOLVER_MODE'; mode: 'solver' | 'manual' }
  | { type: 'SET_MANUAL_MACHINE_COUNT'; recipeClassName: string; count: number }
  | { type: 'TOGGLE_RECIPE'; recipeClassName: string }
  | { type: 'SET_ALL_RECIPES'; classNames: string[]; enabled: boolean }
  | { type: 'SET_NODE_POSITIONS'; positions: Record<string, NodePosition> }
  | { type: 'RESET_LAYOUT' };

function createInitialPlanState(): PlanState {
  return {
    solverMode: 'solver',
    targets: [],
    manualInputs: [],
    disabledRecipes: [],
    resourcePool: DEFAULT_RESOURCE_POOL,
    strategy: OptimizationStrategy.BALANCED,
    solverResult: null,
    manualMachineCounts: {},
    nodePositions: {},
    layoutVersion: 0,
  };
}

function planReducer(state: PlanState, action: PlanAction): PlanState {
  switch (action.type) {
    case 'ADD_TARGET': {
      const id = `target_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      return {
        ...state,
        targets: [...state.targets, { id, itemClassName: action.itemClassName }],
      };
    }

    case 'REMOVE_TARGET':
      return { ...state, targets: state.targets.filter(t => t.id !== action.id) };

    case 'SET_TARGET_RATE':
      return {
        ...state,
        targets: state.targets.map(t =>
          t.id === action.id ? { ...t, ratePerMin: action.ratePerMin } : t,
        ),
      };

    case 'ADD_MANUAL_INPUT': {
      const id = `input_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      return {
        ...state,
        manualInputs: [...state.manualInputs, { id, itemClassName: action.itemClassName, ratePerMin: 0 }],
      };
    }

    case 'REMOVE_MANUAL_INPUT':
      return { ...state, manualInputs: state.manualInputs.filter(mi => mi.id !== action.id) };

    case 'SET_MANUAL_INPUT_RATE':
      return {
        ...state,
        manualInputs: state.manualInputs.map(mi =>
          mi.id === action.id ? { ...mi, ratePerMin: action.ratePerMin } : mi,
        ),
      };

    case 'SET_RESOURCE_POOL_MODE':
      return {
        ...state,
        resourcePool: { ...state.resourcePool, mode: action.mode },
      };

    case 'SET_RESOURCE_LIMIT':
      return {
        ...state,
        resourcePool: {
          ...state.resourcePool,
          limits: { ...state.resourcePool.limits, [action.itemClassName]: action.limit },
        },
      };

    case 'SET_STRATEGY':
      return { ...state, strategy: action.strategy };

    case 'SET_SOLVER_RESULT': {
      const next: PlanState = { ...state, solverResult: action.result };
      if (action.result.status === 'optimal' && action.result.plan) {
        const seededCounts: Record<string, number> = {};
        for (const node of action.result.plan.nodes) {
          seededCounts[node.recipeClassName] = node.machineCount;
        }
        next.manualMachineCounts = seededCounts;
      }
      return next;
    }

    case 'SET_SOLVER_MODE': {
      const next: PlanState = { ...state, solverMode: action.mode };
      // When switching to manual, seed counts from last solver result
      if (action.mode === 'manual' && state.solverResult?.plan) {
        const seededCounts: Record<string, number> = {};
        for (const node of state.solverResult.plan.nodes) {
          seededCounts[node.recipeClassName] = node.machineCount;
        }
        next.manualMachineCounts = seededCounts;
      }
      return next;
    }

    case 'SET_MANUAL_MACHINE_COUNT':
      return {
        ...state,
        manualMachineCounts: {
          ...state.manualMachineCounts,
          [action.recipeClassName]: action.count,
        },
      };

    case 'TOGGLE_RECIPE': {
      const disabled = new Set(state.disabledRecipes);
      if (disabled.has(action.recipeClassName)) {
        disabled.delete(action.recipeClassName);
      } else {
        disabled.add(action.recipeClassName);
      }
      return { ...state, disabledRecipes: Array.from(disabled) };
    }

    case 'SET_ALL_RECIPES': {
      const disabled = new Set(state.disabledRecipes);
      if (action.enabled) {
        for (const cn of action.classNames) disabled.delete(cn);
      } else {
        for (const cn of action.classNames) disabled.add(cn);
      }
      return { ...state, disabledRecipes: Array.from(disabled) };
    }

    case 'SET_NODE_POSITIONS':
      return { ...state, nodePositions: action.positions };

    case 'RESET_LAYOUT':
      return { ...state, nodePositions: {}, layoutVersion: state.layoutVersion + 1 };

    default:
      return state;
  }
}

interface PlanContextValue {
  planState: PlanState;
  dispatch: (action: PlanAction) => void;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [planState, dispatch] = useReducer(planReducer, undefined, createInitialPlanState);

  return <PlanContext.Provider value={{ planState, dispatch }}>{children}</PlanContext.Provider>;
}

export function usePlanContext(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlanContext must be used within PlanProvider');
  return ctx;
}
