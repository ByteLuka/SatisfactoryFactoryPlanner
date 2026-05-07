import { useMemo } from 'react';
import type { GameData, Recipe, Item } from '../types/domain';
import { useGameState } from './useGameState';

export interface AvailableRecipesResult {
  recipes: Recipe[];
  producibleItems: Item[];
}

export function useAvailableRecipes(gameData: GameData): AvailableRecipesResult {
  const { gameState } = useGameState();

  return useMemo(() => {
    const unlockedRecipeClassNames = new Set<string>();

    const allUnlocked = [
      ...gameState.unlockedMilestones,
      ...gameState.completedMamResearch,
      ...gameState.unlockedAlternates,
    ];

    for (const className of allUnlocked) {
      const schematic = gameData.schematics[className];
      if (!schematic) continue;
      for (const rcn of schematic.unlock.recipeClassNames) {
        unlockedRecipeClassNames.add(rcn);
      }
    }

    const recipes = Object.values(gameData.recipes).filter(
      r => unlockedRecipeClassNames.has(r.className) && r.inMachine,
    );

    const producibleItemClassNames = new Set<string>();
    for (const recipe of recipes) {
      for (const product of recipe.products) {
        producibleItemClassNames.add(product.itemClassName);
      }
    }

    const producibleItems = Array.from(producibleItemClassNames)
      .map(cn => gameData.items[cn])
      .filter((item): item is Item => item !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));

    return { recipes, producibleItems };
  }, [gameState, gameData]);
}
