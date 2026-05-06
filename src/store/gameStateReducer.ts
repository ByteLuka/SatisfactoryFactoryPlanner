import type { GameState } from '../types/game-state';
import { ProjectPhase, createInitialGameState } from '../types/game-state';
import { PROJECT_PHASE_MAX_TIER } from '../types/domain';

export type GameStateAction =
  | { type: 'SET_PROJECT_PHASE'; phase: ProjectPhase }
  | { type: 'TOGGLE_MILESTONE'; className: string }
  | { type: 'SET_ALL_MILESTONES_FOR_TIER'; tier: number; classNames: string[]; checked: boolean }
  | { type: 'TOGGLE_MAM_RESEARCH'; className: string }
  | { type: 'TOGGLE_ALTERNATE'; className: string }
  | {
      type: 'UNLOCK_ALL';
      milestoneClassNames: string[];
      mamClassNames: string[];
      alternateClassNames: string[];
    }
  | { type: 'RESET' };

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
}

function pruneInaccessibleMilestones(
  milestones: string[],
  phase: ProjectPhase,
  milestonesByTier: Record<number, { className: string }[]>,
): string[] {
  const maxTier = PROJECT_PHASE_MAX_TIER[phase];
  const accessible = new Set<string>();
  for (let tier = 1; tier <= maxTier; tier++) {
    for (const m of milestonesByTier[tier] ?? []) {
      accessible.add(m.className);
    }
  }
  return milestones.filter(cn => accessible.has(cn));
}

export function gameStateReducer(state: GameState, action: GameStateAction): GameState {
  switch (action.type) {
    case 'SET_PROJECT_PHASE': {
      return {
        ...state,
        projectPhase: action.phase,
        // Milestones above the new phase's max tier become inaccessible;
        // they will be pruned when milestonesByTier is available (done in context).
      };
    }
    case 'TOGGLE_MILESTONE':
      return { ...state, unlockedMilestones: toggleInArray(state.unlockedMilestones, action.className) };
    case 'SET_ALL_MILESTONES_FOR_TIER': {
      const without = state.unlockedMilestones.filter(cn => !action.classNames.includes(cn));
      const next = action.checked ? [...without, ...action.classNames] : without;
      return { ...state, unlockedMilestones: next };
    }
    case 'TOGGLE_MAM_RESEARCH':
      return { ...state, completedMamResearch: toggleInArray(state.completedMamResearch, action.className) };
    case 'TOGGLE_ALTERNATE':
      return { ...state, unlockedAlternates: toggleInArray(state.unlockedAlternates, action.className) };
    case 'UNLOCK_ALL':
      return {
        projectPhase: ProjectPhase.Phase5,
        unlockedMilestones: action.milestoneClassNames,
        completedMamResearch: action.mamClassNames,
        unlockedAlternates: action.alternateClassNames,
      };
    case 'RESET':
      return createInitialGameState();
    default:
      return state;
  }
}

export { pruneInaccessibleMilestones };
