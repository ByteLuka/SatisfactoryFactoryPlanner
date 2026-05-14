import {useGameStateContext} from '../store/GameStateContext';
import type {GameState} from '../types/game-state';
import type {GameStateAction} from '../store/gameStateReducer';

export interface UseGameStateReturn {
  gameState: GameState;
  dispatch: (action: GameStateAction) => void;
  isMilestoneUnlocked: (className: string) => boolean;
  isMamResearched: (className: string) => boolean;
  isAlternateUnlocked: (className: string) => boolean;
}

export function useGameState(): UseGameStateReturn {
  const { gameState, dispatch } = useGameStateContext();

  return {
    gameState,
    dispatch,
    isMilestoneUnlocked: (className: string) => gameState.unlockedMilestones.includes(className),
    isMamResearched: (className: string) => gameState.completedMamResearch.includes(className),
    isAlternateUnlocked: (className: string) => gameState.unlockedAlternates.includes(className),
  };
}
