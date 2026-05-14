import {createContext, type ReactNode, useContext, useEffect, useReducer} from 'react';
import type {GameState} from '../types/game-state';
import {createInitialGameState} from '../types/game-state';
import {type GameStateAction, gameStateReducer} from './gameStateReducer';

const STORAGE_KEY = 'sfp_game_state';

function loadGameState(): GameState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as GameState;
  } catch {}
  return createInitialGameState();
}

interface GameStateContextValue {
  gameState: GameState;
  dispatch: (action: GameStateAction) => void;
}

const GameStateContext = createContext<GameStateContextValue | null>(null);

export function GameStateProvider({ children }: { children: ReactNode }) {
  const [gameState, dispatch] = useReducer(gameStateReducer, undefined, loadGameState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
  }, [gameState]);

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
