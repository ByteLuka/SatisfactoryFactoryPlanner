import { useMemo } from 'react';
import type { GameData, Recipe, Item } from '../types/domain';
import { useGameState } from './useGameState';
import {
  buildAccessibleItemSet,
  buildItemsRequiringAccessibilityCheck,
  buildUnlockedBuildingSet,
  isAlternateEligible,
} from '../utils/alternateEligibility';

export interface AvailableRecipesResult {
  recipes: Recipe[];
  producibleItems: Item[];
}

export function useAvailableRecipes(gameData: GameData): AvailableRecipesResult {
  const { gameState } = useGameState();

  return useMemo(() => {
    const itemsRequiringCheck = buildItemsRequiringAccessibilityCheck(gameData);
    const accessibleItems = buildAccessibleItemSet(gameState, gameData);
    const unlockedBuildings = buildUnlockedBuildingSet(gameState, gameData);

    // Only include alternates that are both remembered (in unlockedAlternates) and
    // currently eligible — ineligible ones are visually unchecked and must not
    // contribute recipes to the solver.
    const effectiveAlternates = gameState.unlockedAlternates.filter(className => {
      const schematic = gameData.schematics[className];
      if (!schematic) return false;
      return isAlternateEligible(
        schematic, gameState, gameData, accessibleItems, itemsRequiringCheck, unlockedBuildings,
      );
    });

    const unlockedRecipeClassNames = new Set<string>();
    for (const className of [
      ...gameState.unlockedMilestones,
      ...gameState.completedMamResearch,
      ...effectiveAlternates,
    ]) {
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
