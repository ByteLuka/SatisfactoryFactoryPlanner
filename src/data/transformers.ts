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

// Liquid amounts in the raw data are stored in liters (1 m³ = 1000 L); resource pool limits are in m³/min.
// Divide by 1000 to normalize liquids to m³ so LP units are consistent.
function normalizeAmount(itemClassName: string, amount: number, rawItems: RawGameData['items']): number {
  return rawItems[itemClassName]?.liquid ? amount / 1000 : amount;
}

function transformRecipe(raw: RawRecipe, rawItems: RawGameData['items']): Recipe {
  return {
    className: raw.className,
    name: raw.name,
    slug: raw.slug,
    alternate: raw.alternate,
    time: raw.time,
    ingredients: raw.ingredients.map(i => ({
      itemClassName: i.item,
      amount: normalizeAmount(i.item, i.amount, rawItems),
    })),
    products: raw.products.map(p => ({
      itemClassName: p.item,
      amount: normalizeAmount(p.item, p.amount, rawItems),
    })),
    producedInClassNames: raw.producedIn,
    inHand: raw.inHand,
    forBuilding: raw.forBuilding,
    inMachine: raw.inMachine,
    isVariablePower: raw.isVariablePower,
    minPower: raw.minPower,
    maxPower: raw.maxPower,
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
    powerConsumption: raw.metadata.powerConsumption,
    powerConsumptionExponent: raw.metadata.powerConsumptionExponent,
    powerProduction: raw.metadata.powerProduction ?? 0,
    size: raw.size,
    connections: raw.connections,
  };
}

/** Derives the MAM tree identifier from a schematic's className. */
function getMamTreeId(className: string): string {
  const match = className.match(/^Research_([A-Za-z]+)_/);
  return match ? match[1] : 'Unknown';
}

function hasProductionRecipe(schematic: Schematic, recipes: Record<string, Recipe>): boolean {
  return schematic.unlock.recipeClassNames.some(cn => {
    const r = recipes[cn];
    return r && (r.inMachine || r.inHand);
  });
}

function buildMamTrees(mamSchematics: Schematic[], recipes: Record<string, Recipe>): MamTree[] {
  const treeMap = new Map<string, Schematic[]>();

  for (const schematic of mamSchematics) {
    if (schematic.unlock.recipeClassNames.length === 0) continue;
    if (!hasProductionRecipe(schematic, recipes)) continue;
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
    recipes[className] = transformRecipe(rawRecipe, raw.items);
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
    mamTrees: buildMamTrees(mamSchematics, recipes),
    alternates,
    buildings,
  };
}
