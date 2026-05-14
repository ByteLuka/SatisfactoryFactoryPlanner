/**
 * Preprocesses en-US.json (raw Satisfactory Docs.json, UTF-16 LE) into smaller
 * domain-specific JSON files consumed by the application at runtime.
 *
 * Output files written to public/generated/data/:
 *   items.json      — Record<className, RawItem>
 *   recipes.json    — Record<className, RawRecipe>
 *   schematics.json — Record<className, RawSchematic>
 *   buildings.json  — Record<className, RawBuilding>  (manufacturers only)
 *
 * Run via: npm run preprocess
 * Also auto-runs before: npm run build  (via "prebuild" hook)
 *
 * Skips processing if en-US.json is absent (uses cached output files instead).
 * Skips processing if all output files are newer than en-US.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INPUT_FILE = path.join(ROOT, 'satisfactory-assets', 'en-US.json');
const OUTPUT_DIR = path.join(ROOT, 'public', 'generated', 'data');
const OUTPUT_FILES = ['items.json', 'recipes.json', 'schematics.json', 'buildings.json'];

// ── Guard: skip if source file absent ──────────────────────────────────────

if (!fs.existsSync(INPUT_FILE)) {
  console.log('[preprocess] en-US.json not found — using cached output files.');
  process.exit(0);
}

// ── Guard: skip if all outputs are newer than source ───────────────────────

const sourceMtime = fs.statSync(INPUT_FILE).mtimeMs;
const allCached = OUTPUT_FILES.every(name => {
  const p = path.join(OUTPUT_DIR, name);
  return fs.existsSync(p) && fs.statSync(p).mtimeMs > sourceMtime;
});

if (allCached) {
  console.log('[preprocess] Output files are up to date — skipping.');
  process.exit(0);
}

// ── Parse source ────────────────────────────────────────────────────────────

console.log('[preprocess] Reading en-US.json…');
const buf = fs.readFileSync(INPUT_FILE);
// Strip UTF-16 LE BOM (FF FE) if present
const start = (buf[0] === 0xFF && buf[1] === 0xFE) ? 2 : 0;
const content = buf.slice(start).toString('utf16le');

/** @type {Array<{ NativeClass: string, Classes: Record<string, string>[] }>} */
const rawData = JSON.parse(content);

// ── Lookup helpers ──────────────────────────────────────────────────────────

/**
 * Returns the first NativeClass group whose class name exactly matches typeName.
 * NativeClass path format: "/Script/CoreUObject.Class'/Script/FactoryGame.<TypeName>'"
 */
function findGroup(typeName) {
  return rawData.find(d => d.NativeClass.endsWith('.' + typeName + "'")) ?? null;
}

function findGroups(typeNames) {
  return rawData.filter(d => typeNames.some(t => d.NativeClass.endsWith('.' + t + "'")));
}

// ── Value parsers ───────────────────────────────────────────────────────────

/**
 * Parses "(B=255,G=255,R=255,A=0)" → { r, g, b, a }.
 * Satisfactory Docs.json writes color channels in BGRA order.
 */
function parseFluidColor(str) {
  if (!str) return { r: 0, g: 0, b: 0, a: 0 };
  const m = str.match(/B=(\d+),G=(\d+),R=(\d+),A=(\d+)/);
  if (m) return { r: +m[3], g: +m[2], b: +m[1], a: +m[4] };
  return { r: 0, g: 0, b: 0, a: 0 };
}

const STACK_SIZE = {
  SS_ONE: 1,
  SS_SMALL: 50,
  SS_MEDIUM: 100,
  SS_BIG: 200,
  SS_HUGE: 500,
  SS_FLUID: 100,
};

function parseStackSize(str) {
  return STACK_SIZE[str] ?? 100;
}

function parseNum(str) {
  const n = parseFloat(str ?? '0');
  return isNaN(n) ? 0 : n;
}

function parseInt10(str) {
  const n = parseInt(str ?? '0', 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Generates a URL-safe slug from a display name.
 * "Alternate: Iron Alloy" → "alternate-iron-alloy"
 */
function toSlug(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Extracts all *_C class names from a UE4 asset path string.
 *
 * Handles paths like:
 *   "/Game/FactoryGame/.../Build_ConstructorMk1.Build_ConstructorMk1_C"
 *   "/Script/Engine.BlueprintGeneratedClass'/Game/...Desc_OreIron.Desc_OreIron_C'"
 */
function extractClassNames(str) {
  if (!str) return [];
  const results = [];
  // Match the last path segment that ends in _C: "SomeName.ClassName_C" or just "ClassName_C"
  const re = /\.([A-Za-z0-9_]+_C)\b/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    results.push(m[1]);
  }
  return [...new Set(results)];
}

/**
 * Parses a UE4 item-amount list into RawItemAmount[].
 *
 * Input:  "((ItemClass="/...Desc_X.Desc_X_C'",Amount=20),(ItemClass="/...Desc_Y.Desc_Y_C'",Amount=5))"
 * Output: [{ item: "Desc_X_C", amount: 20 }, { item: "Desc_Y_C", amount: 5 }]
 */
function parseItemAmounts(str) {
  if (!str) return [];
  const results = [];
  // ItemClass field contains the className at the very end before the closing quote/apostrophe
  const re = /ItemClass="[^"]*\.([A-Za-z0-9_]+_C)['"]+",Amount=([\d.]+)/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    results.push({ item: m[1], amount: parseNum(m[2]) });
  }
  return results;
}

// ── Manufacturer set (used for recipe producedIn classification) ─────────────

const manufacturerGroups = findGroups([
  'FGBuildableManufacturer',
  'FGBuildableManufacturerVariablePower',
]);

const manufacturerClassNames = new Set(
  manufacturerGroups.flatMap(g => g.Classes.map(c => c.ClassName).filter(Boolean)),
);

// ── Items ───────────────────────────────────────────────────────────────────

const ITEM_NATIVE_CLASSES = [
  'FGItemDescriptor',
  'FGResourceDescriptor',
  'FGItemDescriptorBiomass',
  'FGItemDescriptorNuclearFuel',
  'FGItemDescriptorPowerBoosterFuel',
  'FGEquipmentDescriptor',
  'FGConsumableDescriptor',
  'FGVehicleDescriptor',
  'FGPowerShardDescriptor',
  'FGAmmoTypeProjectile',
  'FGAmmoTypeSpreadshot',
  'FGAmmoTypeInstantHit',
  'FGBuildingDescriptor',
];

/** @type {Record<string, import('../src/data/raw-types').RawItem>} */
const items = {};

for (const group of findGroups(ITEM_NATIVE_CLASSES)) {
  for (const cls of group.Classes) {
    const className = cls.ClassName;
    if (!className) continue;
    items[className] = {
      slug: toSlug(cls.mDisplayName || className),
      name: cls.mDisplayName || className,
      description: (cls.mDescription || '').replace(/\r\n/g, '\n'),
      sinkPoints: parseInt10(cls.mResourceSinkPoints),
      className,
      stackSize: parseStackSize(cls.mStackSize),
      energyValue: parseNum(cls.mEnergyValue),
      radioactiveDecay: parseNum(cls.mRadioactiveDecay),
      liquid: cls.mForm === 'RF_LIQUID' || cls.mForm === 'RF_GAS',
      fluidColor: parseFluidColor(cls.mFluidColor),
    };
  }
}

// ── Recipes ─────────────────────────────────────────────────────────────────

/**
 * Classifies what contexts a recipe can be produced in based on its mProducedIn string.
 * Multiple flags can be true simultaneously (e.g. Constructor + WorkBench).
 */
function classifyProducedIn(producedInStr) {
  const classNames = extractClassNames(producedInStr ?? '');

  const inMachine = classNames.some(cn => manufacturerClassNames.has(cn));
  const forBuilding = producedInStr.includes('BuildGun');
  // WorkBenchComponent = handcrafting; WorkshopComponent = equipment workshop
  const inHand = producedInStr.includes('WorkBenchComponent');
  const inWorkshop =
    producedInStr.includes('WorkshopComponent') ||
    producedInStr.includes('AutomatedWorkBench');

  return { inMachine, forBuilding, inHand, inWorkshop, producedIn: classNames };
}

/** @type {Record<string, import('../src/data/raw-types').RawRecipe>} */
const recipes = {};

function processRecipeGroup(group) {
  if (!group) return;
  for (const cls of group.Classes) {
    const className = cls.ClassName;
    if (!className) continue;

    const alternate =
      className.startsWith('Recipe_Alternate_') ||
      (cls.mDisplayName || '').startsWith('Alternate:');

    const { inMachine, forBuilding, inHand, inWorkshop, producedIn } =
      classifyProducedIn(cls.mProducedIn || '');

    const varPowerConstant = parseNum(cls.mVariablePowerConsumptionConstant);
    const varPowerFactor = parseNum(cls.mVariablePowerConsumptionFactor);
    // isVariablePower is true only for Particle Accelerator-style buildings;
    // the default factor of 1.0 present on all normal recipes is not "variable power".
    const isVariablePower = varPowerConstant > 0;

    recipes[className] = {
      slug: toSlug(cls.mDisplayName || className),
      name: cls.mDisplayName || className,
      className,
      alternate,
      time: parseNum(cls.mManufactoringDuration),
      inHand,
      forBuilding,
      inWorkshop,
      inMachine,
      manualTimeMultiplier: parseNum(cls.mManualManufacturingMultiplier) || 1,
      ingredients: parseItemAmounts(cls.mIngredients || ''),
      products: parseItemAmounts(cls.mProduct || ''),
      producedIn,
      isVariablePower,
      minPower: varPowerConstant,
      maxPower: varPowerConstant + varPowerFactor,
    };
  }
}

processRecipeGroup(findGroup('FGRecipe'));
processRecipeGroup(findGroup('FGCustomizationRecipe'));

// ── Schematics ───────────────────────────────────────────────────────────────

/**
 * Extracts unlock data from the mUnlocks array (already parsed as JSON by the game).
 */
function parseUnlocks(unlocks) {
  const recipeClassNames = [];
  const scannerResources = [];
  let inventorySlots = 0;
  const giveItems = [];

  if (!Array.isArray(unlocks)) return { recipes: recipeClassNames, scannerResources, inventorySlots, giveItems };

  for (const unlock of unlocks) {
    switch (unlock.Class) {
      case 'BP_UnlockRecipe_C':
        if (unlock.mRecipes) recipeClassNames.push(...extractClassNames(unlock.mRecipes));
        break;
      case 'BP_UnlockScannableResource_C':
        if (unlock.mResourcesToAddToScanner)
          scannerResources.push(...extractClassNames(unlock.mResourcesToAddToScanner));
        break;
      case 'BP_UnlockInventorySlot_C':
        inventorySlots += parseInt10(unlock.mNumInventorySlotsToUnlock);
        break;
      case 'BP_UnlockGiveItem_C':
        if (unlock.mItemsToGive) giveItems.push(...parseItemAmounts(unlock.mItemsToGive));
        break;
    }
  }

  return { recipes: recipeClassNames, scannerResources, inventorySlots, giveItems };
}

/**
 * Extracts required schematic classNames from mSchematicDependencies.
 * Each dependency entry may reference multiple schematics via mSchematics asset list.
 */
function parseSchematicDeps(deps) {
  if (!Array.isArray(deps)) return [];
  return deps.flatMap(dep => (dep.mSchematics ? extractClassNames(dep.mSchematics) : []));
}

/** @type {Record<string, import('../src/data/raw-types').RawSchematic>} */
const schematics = {};

const schematicGroup = findGroup('FGSchematic');
if (schematicGroup) {
  for (const cls of schematicGroup.Classes) {
    const className = cls.ClassName;
    if (!className) continue;

    const type = cls.mType || 'EST_Custom';
    schematics[className] = {
      className,
      type,
      name: cls.mDisplayName || className,
      slug: toSlug(cls.mDisplayName || className),
      cost: parseItemAmounts(cls.mCost || ''),
      unlock: parseUnlocks(cls.mUnlocks),
      requiredSchematics: parseSchematicDeps(cls.mSchematicDependencies),
      tier: parseInt10(cls.mTechTier),
      time: parseNum(cls.mTimeToComplete),
      mam: type === 'EST_MAM',
      alternate: type === 'EST_Alternate',
    };
  }
}

// ── Buildings (manufacturers) ────────────────────────────────────────────────

/** @type {Record<string, import('../src/data/raw-types').RawBuilding>} */
const buildings = {};

for (const group of manufacturerGroups) {
  for (const cls of group.Classes) {
    const className = cls.ClassName;
    if (!className) continue;
    buildings[className] = {
      slug: toSlug(cls.mDisplayName || className),
      name: cls.mDisplayName || className,
      description: (cls.mDescription || '').replace(/\r\n/g, '\n'),
      className,
      categories: [],
      buildMenuPriority: parseNum(cls.mMenuPriority),
      metadata: {
        powerConsumption: parseNum(cls.mPowerConsumption),
        powerConsumptionExponent: parseNum(cls.mPowerConsumptionExponent),
        manufacturingSpeed: parseNum(cls.mManufacturingSpeed) || 1,
      },
      size: { width: 0, height: 0, length: 0 },
    };
  }
}

// ── Nuclear generators ───────────────────────────────────────────────────────
// FGBuildableGeneratorNuclear defines fuel consumption via mFuel, not FGRecipe.
// Synthesize inMachine recipes and add the building so the LP solver can plan nuclear power.

const nuclearGenGroup = findGroup('FGBuildableGeneratorNuclear');
/** @type {Array<{ className: string; fuelRodClassName: string }>} */
const synthesizedGeneratorRecipes = [];

if (nuclearGenGroup) {
  for (const cls of nuclearGenGroup.Classes) {
    const buildingClassName = cls.ClassName;
    if (!buildingClassName) continue;

    const powerProduction = parseNum(cls.mPowerProduction);

    buildings[buildingClassName] = {
      slug: toSlug(cls.mDisplayName || buildingClassName),
      name: cls.mDisplayName || buildingClassName,
      description: (cls.mDescription || '').replace(/\r\n/g, '\n'),
      className: buildingClassName,
      categories: [],
      buildMenuPriority: 0,
      metadata: {
        powerConsumption: 0,
        powerConsumptionExponent: 1.321928,
        manufacturingSpeed: 1,
        powerProduction,
      },
      size: { width: 0, height: 0, length: 0 },
    };

    const fuelLoadAmount = parseInt10(String(cls.mFuelLoadAmount ?? '1'));
    const supplementalAmount = parseNum(String(cls.mSupplementalLoadAmount ?? '0'));

    for (const fuel of (cls.mFuel || [])) {
      const fuelRodClassName = fuel.mFuelClass;
      if (!fuelRodClassName) continue;

      const fuelItem = items[fuelRodClassName];
      if (!fuelItem || fuelItem.energyValue <= 0) continue;

      const cycleTime = fuelItem.energyValue / powerProduction;
      const recipeClassName = `GeneratorFuel_${fuelRodClassName}`;
      const fuelName = fuelItem.name || fuelRodClassName;

      // mSupplementalResourceClass is stored per-fuel entry, already as a plain class name
      const supplementalClass = fuel.mSupplementalResourceClass || null;

      const ingredients = [{ item: fuelRodClassName, amount: fuelLoadAmount }];
      if (supplementalClass && supplementalAmount > 0) {
        ingredients.push({ item: supplementalClass, amount: supplementalAmount });
      }

      const products = [];
      if (fuel.mByproduct && fuel.mByproductAmount) {
        const byproductAmount = parseInt10(String(fuel.mByproductAmount));
        if (byproductAmount > 0) {
          products.push({ item: fuel.mByproduct, amount: byproductAmount });
        }
      }

      recipes[recipeClassName] = {
        slug: toSlug(fuelName),
        name: fuelName,
        className: recipeClassName,
        alternate: false,
        time: cycleTime,
        inHand: false,
        forBuilding: false,
        inWorkshop: false,
        inMachine: true,
        manualTimeMultiplier: 1,
        ingredients,
        products,
        producedIn: [buildingClassName],
        isVariablePower: false,
        minPower: 0,
        maxPower: 0,
      };

      synthesizedGeneratorRecipes.push({ className: recipeClassName, fuelRodClassName });
    }
  }
}

// Link each synthesized generator recipe to the schematic that unlocks its fuel rod's
// manufacturing recipe, so they become available when the player unlocks the fuel rod.
for (const { className: genRecipeClassName, fuelRodClassName } of synthesizedGeneratorRecipes) {
  const manufacturingRecipe = Object.values(recipes).find(
    r => r.inMachine && !r.alternate && r.products.some(p => p.item === fuelRodClassName),
  );
  if (!manufacturingRecipe) continue;

  const unlockingSchematic = Object.values(schematics).find(
    s => s.unlock.recipes.includes(manufacturingRecipe.className),
  );
  if (!unlockingSchematic) continue;

  unlockingSchematic.unlock.recipes.push(genRecipeClassName);
}

// ── Write output ─────────────────────────────────────────────────────────────

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function writeJSON(filename, data) {
  const outPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(data));
  console.log(`[preprocess] ${filename} — ${Object.keys(data).length} entries`);
}

console.log('[preprocess] Writing output files…');
writeJSON('items.json', items);
writeJSON('recipes.json', recipes);
writeJSON('schematics.json', schematics);
writeJSON('buildings.json', buildings);

console.log('[preprocess] Done.');
