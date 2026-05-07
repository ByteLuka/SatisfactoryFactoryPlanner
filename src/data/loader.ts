import type { RawGameData } from './raw-types';
import type { GameData } from '../types/domain';
import { transformGameData } from './transformers';

async function fetchJSON(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function loadGameData(): Promise<GameData> {
  const [items, recipes, schematics, buildings] = await Promise.all([
    fetchJSON('/generated/data/items.json'),
    fetchJSON('/generated/data/recipes.json'),
    fetchJSON('/generated/data/schematics.json'),
    fetchJSON('/generated/data/buildings.json'),
  ]);

  const raw: RawGameData = {
    items: items as RawGameData['items'],
    recipes: recipes as RawGameData['recipes'],
    schematics: schematics as RawGameData['schematics'],
    buildings: buildings as RawGameData['buildings'],
    generators: {},
    resources: {},
    miners: {},
  };

  return transformGameData(raw);
}
