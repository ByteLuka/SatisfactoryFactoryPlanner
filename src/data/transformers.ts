import type { RawGameData, RawSchematic, RawRecipe, RawItem, RawBuilding } from './raw-types';
import type { GameData, Schematic, Recipe, Item, Building, MamTree } from '../types/domain';
import { SCHEMATIC_TYPE, MAM_TREE_DISPLAY_NAMES } from '../types/domain';

function transformSchematic(raw: RawSchematic): Schematic {
  return {
    className: raw.className,
    type: raw.type as Schematic['type'],
    name: raw.name,
    slug: raw.slug,
    tier: raw.tier,
    cost: raw.cost.map(c => ({ itemClassName: c.item, amount: c.amount })),
    unlock: {
      recipeClassNames: raw.unlock.recipes,
      scannerResourceClassNames: raw.unlock.scannerResources,
      inventorySlots: raw.unlock.inventorySlots,
    },
    requiredSchematicClassNames: raw.requiredSchematics,
    mam: raw.mam,
    alternate: raw.alternate,
  };
}

function transformRecipe(raw: RawRecipe): Recipe {
  return {
    className: raw.className,
    name: raw.name,
    slug: raw.slug,
    alternate: raw.alternate,
    time: raw.time,
    ingredients: raw.ingredients.map(i => ({ itemClassName: i.item, amount: i.amount })),
    products: raw.products.map(p => ({ itemClassName: p.item, amount: p.amount })),
    producedInClassNames: raw.producedIn,
    inHand: raw.inHand,
    forBuilding: raw.forBuilding,
    inMachine: raw.inMachine,
  };
}

function transformItem(className: string, raw: RawItem): Item {
  return {
    className,
    name: raw.name,
    slug: raw.slug,
    description: raw.description,
    stackSize: raw.stackSize,
    liquid: raw.liquid,
  };
}

function transformBuilding(className: string, raw: RawBuilding): Building {
  return {
    className,
    name: raw.name,
    slug: raw.slug,
    description: raw.description,
  };
}

/** Derives the MAM tree identifier from a schematic's className. */
function getMamTreeId(className: string): string {
  const match = className.match(/^Research_([A-Za-z]+)_/);
  return match ? match[1] : 'Unknown';
}

function buildMamTrees(mamSchematics: Schematic[]): MamTree[] {
  const treeMap = new Map<string, Schematic[]>();

  for (const schematic of mamSchematics) {
    const id = getMamTreeId(schematic.className);
    if (!treeMap.has(id)) treeMap.set(id, []);
    treeMap.get(id)!.push(schematic);
  }

  return Array.from(treeMap.entries())
    .map(([id, nodes]) => ({
      id,
      name: MAM_TREE_DISPLAY_NAMES[id] ?? id,
      nodes,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function transformGameData(raw: RawGameData): GameData {
  const schematics: Record<string, Schematic> = {};
  for (const [className, rawSchematic] of Object.entries(raw.schematics)) {
    schematics[className] = transformSchematic(rawSchematic);
  }

  const recipes: Record<string, Recipe> = {};
  for (const [className, rawRecipe] of Object.entries(raw.recipes)) {
    recipes[className] = transformRecipe(rawRecipe);
  }

  const items: Record<string, Item> = {};
  for (const [className, rawItem] of Object.entries(raw.items)) {
    items[className] = transformItem(className, rawItem);
  }

  const buildings: Record<string, Building> = {};
  for (const [className, rawBuilding] of Object.entries(raw.buildings)) {
    buildings[className] = transformBuilding(className, rawBuilding);
  }

  const milestones = Object.values(schematics).filter(
    s => s.type === SCHEMATIC_TYPE.MILESTONE,
  );

  const milestonesByTier: Record<number, Schematic[]> = {};
  for (const milestone of milestones) {
    if (!milestonesByTier[milestone.tier]) milestonesByTier[milestone.tier] = [];
    milestonesByTier[milestone.tier].push(milestone);
  }

  const mamSchematics = Object.values(schematics).filter(
    s => s.type === SCHEMATIC_TYPE.MAM,
  );

  const alternates = Object.values(schematics).filter(
    s => s.type === SCHEMATIC_TYPE.ALTERNATE,
  );

  return {
    items,
    recipes,
    schematics,
    milestonesByTier,
    mamTrees: buildMamTrees(mamSchematics),
    alternates,
    buildings,
  };
}
