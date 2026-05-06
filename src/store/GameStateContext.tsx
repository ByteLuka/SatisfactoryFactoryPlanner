import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type { GameState } from '../types/game-state';
import { ProjectPhase, createInitialGameState } from '../types/game-state';
import { gameStateReducer, type GameStateAction } from './gameStateReducer';

interface GameStateContextValue {
  gameState: GameState;
  dispatch: (action: GameStateAction) => void;
}

const GameStateContext = createContext<GameStateContextValue | null>(null);

export function GameStateProvider({ children }: { children: ReactNode }) {
  const [gameState, dispatch] = useReducer(gameStateReducer, undefined, createInitialGameState);

  return (
    <GameStateContext.Provider value={{ gameState, dispatch }}>
      {children}
    </GameStateContext.Provider>
  );
}

export function useGameStateContext(): GameStateContextValue {
  const ctx = useContext(GameStateContext);
  if (!ctx) throw new Error('useGameStateContext must be used within GameStateProvider');
  return ctx;
}
