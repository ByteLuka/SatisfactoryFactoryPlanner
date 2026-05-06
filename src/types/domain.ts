// Clean domain types — the shared language of this application.
// Raw data.json shapes never escape src/data/.

export const SCHEMATIC_TYPE = {
  MILESTONE: 'EST_Milestone',
  MAM: 'EST_MAM',
  ALTERNATE: 'EST_Alternate',
  HARD_DRIVE: 'EST_HardDrive',
  RESOURCE_SINK: 'EST_ResourceSink',
  TUTORIAL: 'EST_Tutorial',
  CUSTOM: 'EST_Custom',
} as const;

export type SchematicType = (typeof SCHEMATIC_TYPE)[keyof typeof SCHEMATIC_TYPE];

export interface ItemAmount {
  itemClassName: string;
  amount: number;
}

export interface SchematicUnlock {
  recipeClassNames: string[];
  scannerResourceClassNames: string[];
  inventorySlots: number;
}

export interface Schematic {
  className: string;
  type: SchematicType;
  name: string;
  slug: string;
  tier: number;
  cost: ItemAmount[];
  unlock: SchematicUnlock;
  requiredSchematicClassNames: string[];
  mam: boolean;
  alternate: boolean;
}

export interface Recipe {
  className: string;
  name: string;
  slug: string;
  alternate: boolean;
  time: number;
  ingredients: ItemAmount[];
  products: ItemAmount[];
  producedInClassNames: string[];
  inHand: boolean;
  forBuilding: boolean;
  inMachine: boolean;
}

export interface Item {
  className: string;
  name: string;
  slug: string;
  description: string;
  stackSize: number;
  liquid: boolean;
}

export interface Building {
  className: string;
  name: string;
  slug: string;
  description: string;
}

/** A named MAM research tree (e.g. "Caterium", "Quartz"). */
export interface MamTree {
  id: string;
  name: string;
  nodes: Schematic[];
}

export interface GameData {
  items: Record<string, Item>;
  recipes: Record<string, Recipe>;
  schematics: Record<string, Schematic>;
  milestonesByTier: Record<number, Schematic[]>;
  mamTrees: MamTree[];
  alternates: Schematic[];
  buildings: Record<string, Building>;
}

// Project phase → maximum HUB tier unlocked by completing that Space Elevator phase.
export const PROJECT_PHASE_MAX_TIER: Record<number, number> = {
  1: 2,
  2: 4,
  3: 6,
  4: 8,
  5: 8,
};

export const PROJECT_PHASE_LABELS: Record<number, string> = {
  1: 'Phase 1 — Established Presence',
  2: 'Phase 2 — Structural Expansion',
  3: 'Phase 3 — Enhanced Automated Processing',
  4: 'Phase 4 — Automated Advanced Parts Manufacturing',
  5: 'Phase 5 — Cutting-Edge Production',
};

export const MAM_TREE_DISPLAY_NAMES: Record<string, string> = {
  Sulfur: 'Sulfur',
  Quartz: 'Quartz',
  Caterium: 'Caterium',
  FlowerPetals: 'Flower Petals',
  Mycelia: 'Mycelia',
  Nutrients: 'Nutrients',
  PowerSlugs: 'Power Slugs',
  ACarapace: 'Alien Carapace',
  AOrgans: 'Alien Organs',
  AO: 'Alien Organisms',
  AOrganisms: 'Alien Organisms (Hostile)',
  XMas: 'FICSMAS',
};
