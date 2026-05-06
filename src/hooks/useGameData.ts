import { useState, useEffect } from 'react';
import type { GameData } from '../types/domain';
import { loadGameData } from '../data/loader';

type LoadState =
  | { status: 'loading' }
  | { status: 'success'; data: GameData }
  | { status: 'error'; error: Error };

let cachedData: GameData | null = null;

export function useGameData(): LoadState {
  const [state, setState] = useState<LoadState>(
    cachedData ? { status: 'success', data: cachedData } : { status: 'loading' },
  );

  useEffect(() => {
    if (cachedData) return;

    let cancelled = false;
    loadGameData()
      .then(data => {
        cachedData = data;
        if (!cancelled) setState({ status: 'success', data });
      })
      .catch(err => {
        if (!cancelled) setState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) });
      });

    return () => { cancelled = true; };
  }, []);

  return state;
}
