import type { GameState } from '../types/game-state';
import type { GameData, Schematic } from '../types/domain';
import { SCHEMATIC_TYPE, PROJECT_PHASE_MAX_TIER } from '../types/domain';
import { MAP_RESOURCE_POOL_LIMITS } from '../data/resources';

const RAW_RESOURCE_CLASS_NAMES = new Set(Object.keys(MAP_RESOURCE_POOL_LIMITS));

function isAutoUnlocked(type: string, tier: number, maxTier: number): boolean {
  return (type === SCHEMATIC_TYPE.CUSTOM || type === SCHEMATIC_TYPE.TUTORIAL) && tier <= maxTier;
}

/**
 * Builds the set of item classNames the player can currently produce or obtain,
 * based on their explicitly unlocked milestones, completed MAM research, and
 * EST_Custom/EST_Tutorial schematics that auto-unlock at or below their phase tier.
 * Raw resources (mineable ores, fluids) are always included.
 */
export function buildAccessibleItemSet(gameState: GameState, gameData: GameData): Set<string> {
  const accessible = new Set<string>(RAW_RESOURCE_CLASS_NAMES);
  const maxTier = PROJECT_PHASE_MAX_TIER[gameState.projectPhase] ?? 0;

  for (const schematic of Object.values(gameData.schematics)) {
    const playerUnlocked =
      gameState.unlockedMilestones.includes(schematic.className) ||
      gameState.completedMamResearch.includes(schematic.className);

    if (!playerUnlocked && !isAutoUnlocked(schematic.type, schematic.tier, maxTier)) continue;

    for (const rcn of schematic.unlock.recipeClassNames) {
      const recipe = gameData.recipes[rcn];
      if (!recipe) continue;
      for (const product of recipe.products) {
        accessible.add(product.itemClassName);
      }
    }
  }

  return accessible;
}

/**
 * Builds the set of Build_*_C class names for manufacturing buildings the player
 * has unlocked, derived from forBuilding recipes in their accessible schematics.
 * The Desc_ → Build_ class name substitution maps construction item descriptors
 * to the placed building class names used in recipe.producedInClassNames.
 */
export function buildUnlockedBuildingSet(gameState: GameState, gameData: GameData): Set<string> {
  const unlocked = new Set<string>();
  const maxTier = PROJECT_PHASE_MAX_TIER[gameState.projectPhase] ?? 0;

  for (const schematic of Object.values(gameData.schematics)) {
    const playerUnlocked =
      gameState.unlockedMilestones.includes(schematic.className) ||
      gameState.completedMamResearch.includes(schematic.className);

    if (!playerUnlocked && !isAutoUnlocked(schematic.type, schematic.tier, maxTier)) continue;

    for (const rcn of schematic.unlock.recipeClassNames) {
      const recipe = gameData.recipes[rcn];
      if (!recipe?.forBuilding) continue;
      for (const product of recipe.products) {
        unlocked.add(product.itemClassName.replace(/^Desc_/, 'Build_'));
      }
    }
  }

  return unlocked;
}

/**
 * Returns the set of item classNames that have at least one non-alternate production recipe.
 * Items outside this set (e.g. Wood, Nuclear Waste, creature drops) are treated as
 * freely gatherable and are not used to gate alternate eligibility.
 */
export function buildItemsRequiringAccessibilityCheck(gameData: GameData): Set<string> {
  const items = new Set<string>();
  for (const recipe of Object.values(gameData.recipes)) {
    if (recipe.alternate) continue;
    for (const product of recipe.products) {
      if (!RAW_RESOURCE_CLASS_NAMES.has(product.itemClassName)) {
        items.add(product.itemClassName);
      }
    }
  }
  return items;
}

/**
 * Returns human-readable reasons why the alternate is ineligible, or an empty
 * array if it is eligible. Mirrors the checks in isAlternateEligible.
 */
export function getIneligibilityReasons(
  alt: Schematic,
  gameState: GameState,
  gameData: GameData,
  accessibleItems: Set<string>,
  itemsRequiringCheck: Set<string>,
  unlockedBuildings: Set<string>,
): string[] {
  const reasons: string[] = [];
  const maxTier = PROJECT_PHASE_MAX_TIER[gameState.projectPhase] ?? 0;

  if (alt.requiredSchematicClassNames.length > 0) {
    const unsatisfied = alt.requiredSchematicClassNames.filter(req => {
      if (gameState.completedMamResearch.includes(req)) return false;
      if (gameState.unlockedMilestones.includes(req)) return false;
      if (gameState.unlockedAlternates.includes(req)) return false;
      const reqSchematic = gameData.schematics[req];
      if (!reqSchematic) return false;
      if (isAutoUnlocked(reqSchematic.type, reqSchematic.tier, maxTier)) return false;
      if (reqSchematic.type === SCHEMATIC_TYPE.MAM) {
        const hasProductionRecipe = reqSchematic.unlock.recipeClassNames.some(rcn => {
          const r = gameData.recipes[rcn];
          return r && (r.inMachine || r.inHand);
        });
        if (!hasProductionRecipe) return false;
      }
      return true;
    });
    if (unsatisfied.length > 0) {
      const names = unsatisfied.map(cn => gameData.schematics[cn]?.name ?? cn).join(', ');
      reasons.push(`Requires: ${names}`);
    }
  }

  for (const rcn of alt.unlock.recipeClassNames) {
    const recipe = gameData.recipes[rcn];
    if (!recipe) continue;

    const buildingOk = recipe.producedInClassNames.some(
      b => !b.startsWith('Build_') || unlockedBuildings.has(b),
    );
    if (!buildingOk) {
      const names = recipe.producedInClassNames
        .filter(b => b.startsWith('Build_'))
        .map(b => gameData.buildings[b]?.name ?? b)
        .join(' or ');
      reasons.push(`Requires building: ${names}`);
    }

    for (const ingredient of recipe.ingredients) {
      if (
        itemsRequiringCheck.has(ingredient.itemClassName) &&
        !accessibleItems.has(ingredient.itemClassName)
      ) {
        const name = gameData.items[ingredient.itemClassName]?.name ?? ingredient.itemClassName;
        reasons.push(`Missing ingredient: ${name}`);
      }
    }
  }

  return reasons;
}

/**
 * Returns true if the alternate recipe can potentially appear in the player's
 * Hard Drive research pool given their current game state.
 *
 * Checks three conditions:
 * - All explicit prerequisite schematics are satisfied (MAM research chains,
 *   other alternates, or auto-unlocked schematics at the player's current tier).
 * - The recipe's required manufacturing building is unlocked.
 * - All ingredient items that have a known standard production recipe are
 *   accessible to the player. Items with no standard production path (gathered
 *   items like Wood or Nuclear Waste) never block eligibility.
 *   Products are not checked — an alternate is itself a production path for its
 *   output, so requiring the output to already be accessible would be circular.
 */
export function isAlternateEligible(
  alt: Schematic,
  gameState: GameState,
  gameData: GameData,
  accessibleItems: Set<string>,
  itemsRequiringCheck: Set<string>,
  unlockedBuildings: Set<string>,
): boolean {
  const maxTier = PROJECT_PHASE_MAX_TIER[gameState.projectPhase] ?? 0;

  if (alt.requiredSchematicClassNames.length > 0) {
    const allSatisfied = alt.requiredSchematicClassNames.every(req => {
      if (gameState.completedMamResearch.includes(req)) return true;
      if (gameState.unlockedMilestones.includes(req)) return true;
      if (gameState.unlockedAlternates.includes(req)) return true;
      const reqSchematic = gameData.schematics[req];
      if (!reqSchematic) return false;
      if (isAutoUnlocked(reqSchematic.type, reqSchematic.tier, maxTier)) return true;
      // MAM nodes that unlock no production recipes are hidden from the MAM UI — the player
      // has no way to check them off, so treat them as auto-satisfied. The item/building
      // checks below still enforce the actual progression gate.
      if (reqSchematic.type === SCHEMATIC_TYPE.MAM) {
        const hasProductionRecipe = reqSchematic.unlock.recipeClassNames.some(rcn => {
          const r = gameData.recipes[rcn];
          return r && (r.inMachine || r.inHand);
        });
        if (!hasProductionRecipe) return true;
      }
      return false;
    });
    if (!allSatisfied) return false;
  }

  for (const rcn of alt.unlock.recipeClassNames) {
    const recipe = gameData.recipes[rcn];
    if (!recipe) continue;

    // At least one producedIn building must be unlocked (non-Build_ entries like
    // BP_BuildGun_C are always accessible since they require no milestone)
    const buildingOk = recipe.producedInClassNames.some(
      b => !b.startsWith('Build_') || unlockedBuildings.has(b),
    );
    if (!buildingOk) return false;

    for (const ingredient of recipe.ingredients) {
      if (itemsRequiringCheck.has(ingredient.itemClassName) && !accessibleItems.has(ingredient.itemClassName)) {
        return false;
      }
    }
  }

  return true;
}
