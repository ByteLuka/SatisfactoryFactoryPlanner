import type { RawGameData } from './raw-types';
import type { GameData } from '../types/domain';
import { transformGameData } from './transformers';

export async function loadGameData(): Promise<GameData> {
  const response = await fetch('/data/data.json');
  if (!response.ok) {
    throw new Error(`Failed to load game data: ${response.status} ${response.statusText}`);
  }
  const raw: RawGameData = await response.json();
  return transformGameData(raw);
}
