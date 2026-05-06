/**
 * Raw shapes from data.json — kept private to src/data/.
 * Nothing outside this directory should import from here.
 */

export interface RawItemAmount {
  item: string;
  amount: number;
}

export interface RawUnlock {
  recipes: string[];
  scannerResources: string[];
  inventorySlots: number;
  giveItems: RawItemAmount[];
}

export interface RawSchematic {
  className: string;
  type: string;
  name: string;
  slug: string;
  cost: RawItemAmount[];
  unlock: RawUnlock;
  requiredSchematics: string[];
  tier: number;
  time: number;
  mam: boolean;
  alternate: boolean;
}

export interface RawRecipe {
  slug: string;
  name: string;
  className: string;
  alternate: boolean;
  time: number;
  inHand: boolean;
  forBuilding: boolean;
  inWorkshop: boolean;
  inMachine: boolean;
  manualTimeMultiplier: number;
  ingredients: RawItemAmount[];
  products: RawItemAmount[];
  producedIn: string[];
  isVariablePower: boolean;
  minPower: number;
  maxPower: number;
}

export interface RawFluidColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface RawItem {
  slug: string;
  name: string;
  description: string;
  sinkPoints: number;
  className: string;
  stackSize: number;
  energyValue: number;
  radioactiveDecay: number;
  liquid: boolean;
  fluidColor: RawFluidColor;
}

export interface RawBuildingMetadata {
  powerConsumption: number;
  powerConsumptionExponent: number;
  manufacturingSpeed: number;
}

export interface RawBuilding {
  slug: string;
  name: string;
  description: string;
  className: string;
  categories: string[];
  buildMenuPriority: number;
  metadata: RawBuildingMetadata;
  size: { width: number; height: number; length: number };
}

export interface RawGameData {
  items: Record<string, RawItem>;
  recipes: Record<string, RawRecipe>;
  schematics: Record<string, RawSchematic>;
  generators: Record<string, unknown>;
  resources: Record<string, unknown>;
  miners: Record<string, unknown>;
  buildings: Record<string, RawBuilding>;
}
