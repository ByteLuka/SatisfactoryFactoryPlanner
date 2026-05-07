import type { ResourcePool } from '../types/plan';

// Full-map resource totals (items/min at 100% clock speed, Mk.1 miners on all nodes)
export const MAP_RESOURCE_POOL_LIMITS: Record<string, number> = {
  Desc_OreIron_C: 70380,
  Desc_OreCopper_C: 28860,
  Desc_Stone_C: 52860,
  Desc_Coal_C: 30900,
  Desc_OreGold_C: 10500,     // Caterium Ore
  Desc_RawQuartz_C: 10500,
  Desc_Sulfur_C: 6900,
  Desc_OreBauxite_C: 10800,
  Desc_OreUranium_C: 2100,
  Desc_LiquidOil_C: 11700,
  Desc_NitrogenGas_C: 12000,
  Desc_Water_C: 99999,
  Desc_SAM_C: 9000,
};

export const DEFAULT_RESOURCE_POOL: ResourcePool = {
  mode: 'map',
  limits: MAP_RESOURCE_POOL_LIMITS,
};

export const RESOURCE_DISPLAY_NAMES: Record<string, string> = {
  Desc_OreIron_C: 'Iron Ore',
  Desc_OreCopper_C: 'Copper Ore',
  Desc_Stone_C: 'Limestone',
  Desc_Coal_C: 'Coal',
  Desc_OreGold_C: 'Caterium Ore',
  Desc_RawQuartz_C: 'Raw Quartz',
  Desc_Sulfur_C: 'Sulfur',
  Desc_OreBauxite_C: 'Bauxite',
  Desc_OreUranium_C: 'Uranium',
  Desc_LiquidOil_C: 'Crude Oil',
  Desc_NitrogenGas_C: 'Nitrogen Gas',
  Desc_Water_C: 'Water',
  Desc_SAM_C: 'S.A.M. Ore',
};
