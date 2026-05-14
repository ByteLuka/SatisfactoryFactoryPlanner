import Solver from 'javascript-lp-solver';
import type {
  MainToWorker,
  ManualInput,
  PlanEdge,
  PlanNode,
  RecipePowerCoefficient,
  SolverInput,
  SolverOutput,
  WorkerToMain
} from '../types/plan';
import {OptimizationStrategy} from '../types/plan';
import type {Recipe} from '../types/domain';
import {FREELY_AVAILABLE_ITEMS} from '../data/resources';

function ratePerMachine(amount: number, cycleTimeSec: number): number {
  return (amount * 60) / cycleTimeSec;
}

function buildAndSolve(
  recipes: Recipe[],
  rawResources: Set<string>,
  producibleItems: Set<string>,
  targets: SolverInput['targets'],
  resourceLimits: Record<string, number>,
  strategy: OptimizationStrategy,
  manualInputs: ManualInput[],
  omitResourceConstraints = false,
  powerCoefficients: Record<string, RecipePowerCoefficient> = {},
): ReturnType<typeof Solver.Solve> {
  const constraints: Record<string, { min?: number; max?: number }> = {};
  const variables: Record<string, Record<string, number>> = {};

  // Balance constraints for producible items (including manually imported ones)
  for (const itemClassName of producibleItems) {
    const targetRate = targets.find(t => t.itemClassName === itemClassName)?.ratePerMin;
    constraints[`balance_${itemClassName}`] = { min: targetRate ?? 0 };
  }

  // Resource pool constraints
  if (!omitResourceConstraints) {
    for (const resourceClassName of rawResources) {
      const limit = resourceLimits[resourceClassName];
      if (limit !== undefined) {
        constraints[`resource_${resourceClassName}`] = { max: limit };
      }
    }
  }

  // Recipe variables
  for (const recipe of recipes) {
    const varName = `recipe_${recipe.className}`;
    const variable: Record<string, number> = {};

    if (strategy === OptimizationStrategy.MAX_OUTPUT) {
      let objCoefficient = 0;
      for (const target of targets) {
        if (target.ratePerMin !== undefined) continue;
        const prod = recipe.products.find(p => p.itemClassName === target.itemClassName);
        const cons = recipe.ingredients.find(i => i.itemClassName === target.itemClassName);
        const prodRate = prod ? ratePerMachine(prod.amount, recipe.time) : 0;
        const consRate = cons ? ratePerMachine(cons.amount, recipe.time) : 0;
        objCoefficient += prodRate - consRate;
      }
      variable['objective'] = objCoefficient;
    } else if (strategy === OptimizationStrategy.OPT_POWER) {
      // Use per-machine power as LP weight to minimize power-weighted machine count.
      // OPT_POWER further refines via greedy elimination using actual underclocked power.
      variable['objective'] = powerCoefficients[recipe.className]?.basePower ?? 1;
    } else {
      // BALANCED, OPT_MACHINES, OPT_RECIPES: all use fractional sum as the LP objective.
      // OPT_MACHINES and OPT_RECIPES improve the result via post-processing in greedyEliminate.
      variable['objective'] = 1;
    }

    for (const product of recipe.products) {
      if (producibleItems.has(product.itemClassName)) {
        const key = `balance_${product.itemClassName}`;
        variable[key] = (variable[key] ?? 0) + ratePerMachine(product.amount, recipe.time);
      }
    }
    for (const ingredient of recipe.ingredients) {
      if (producibleItems.has(ingredient.itemClassName)) {
        const key = `balance_${ingredient.itemClassName}`;
        variable[key] = (variable[key] ?? 0) - ratePerMachine(ingredient.amount, recipe.time);
      }
      if (rawResources.has(ingredient.itemClassName)) {
        const key = `resource_${ingredient.itemClassName}`;
        variable[key] = (variable[key] ?? 0) + ratePerMachine(ingredient.amount, recipe.time);
      }
    }

    variables[varName] = variable;
  }

  // Import variables for manual inputs
  for (const mi of manualInputs) {
    if (mi.ratePerMin <= 0) continue;
    const varName = `import_${mi.itemClassName}`;
    variables[varName] = {
      objective: 0,
      [`balance_${mi.itemClassName}`]: 1,
    };
    constraints[`max_import_${mi.itemClassName}`] = { max: mi.ratePerMin };
  }

  return Solver.Solve({
    optimize: 'objective',
    opType: strategy === OptimizationStrategy.MAX_OUTPUT ? 'max' : 'min',
    constraints,
    variables,
    // Import variables have objective: 0, so they are never penalized regardless of strategy
  });
}

// Greedy recipe elimination for MIN_MACHINES and MIN_RECIPES.
//
// Iterates over initially-active recipes sorted by machine count (smallest first). For each,
// tries removing it from the allowed set and re-solving. Accepts the removal if the target
// metric strictly improves. Because currentAllowed updates in-place after each successful
// removal, later trials already benefit from earlier ones — the single pass chains
// improvements together without requiring multiple iterations.
function greedyEliminate(
  initialResult: ReturnType<typeof Solver.Solve>,
  allRecipes: Recipe[],
  rawResources: Set<string>,
  producibleItems: Set<string>,
  targets: SolverInput['targets'],
  resourceLimits: Record<string, number>,
  manualInputs: ManualInput[],
  metric: 'machines' | 'recipes' | 'power',
  powerCoefficients: Record<string, RecipePowerCoefficient> = {},
): ReturnType<typeof Solver.Solve> {
  const recipeValue = (result: ReturnType<typeof Solver.Solve>, r: Recipe): number =>
    (result[`recipe_${r.className}`] as number | undefined) ?? 0;

  const computeMetric = (result: ReturnType<typeof Solver.Solve>, recipes: Recipe[]): number => {
    if (metric === 'machines') {
      return recipes
        .filter(r => recipeValue(result, r) > 0.001)
        .reduce((sum, r) => sum + Math.ceil(recipeValue(result, r)), 0);
    }
    if (metric === 'power') {
      return recipes
        .filter(r => recipeValue(result, r) > 0.001)
        .reduce((sum, r) => {
          const x = recipeValue(result, r);
          const pc = powerCoefficients[r.className];
          if (!pc) return sum;
          const full = Math.floor(x);
          const frac = x - full;
          return sum + full * pc.basePower + (frac > 0.001 ? pc.basePower * Math.pow(frac, pc.exponent) : 0);
        }, 0);
    }
    return recipes.filter(r => recipeValue(result, r) > 0.001).length;
  };

  const initialActive = allRecipes.filter(r => recipeValue(initialResult, r) > 0.001);
  const sorted = [...initialActive].sort((a, b) => recipeValue(initialResult, a) - recipeValue(initialResult, b));

  let currentAllowed = [...allRecipes];
  let currentResult = initialResult;
  let currentMetric = computeMetric(initialResult, allRecipes);

  for (const recipe of sorted) {
    if (!currentAllowed.some(r => r.className === recipe.className)) continue;

    const candidate = currentAllowed.filter(r => r.className !== recipe.className);
    const trial = buildAndSolve(candidate, rawResources, producibleItems, targets, resourceLimits, OptimizationStrategy.BALANCED, manualInputs);

    if (!trial.feasible) continue;

    const trialMetric = computeMetric(trial, candidate);
    if (trialMetric < currentMetric) {
      currentAllowed = candidate;
      currentResult = trial;
      currentMetric = trialMetric;
    }
  }

  return currentResult;
}

function computeEdges(
  planNodes: PlanNode[],
  targets: SolverInput['targets'],
  rawResources: Set<string>,
  importUsage: Record<string, number>,
): PlanEdge[] {
  const edges: PlanEdge[] = [];
  const targetItemClassNames = new Set(targets.map(t => t.itemClassName));

  const itemFlows = new Map<string, { producers: PlanNode[]; consumers: PlanNode[] }>();

  for (const node of planNodes) {
    for (const itemClassName of Object.keys(node.outputRates)) {
      if (!itemFlows.has(itemClassName)) itemFlows.set(itemClassName, { producers: [], consumers: [] });
      itemFlows.get(itemClassName)!.producers.push(node);
    }
    for (const itemClassName of Object.keys(node.inputRates)) {
      if (!itemFlows.has(itemClassName)) itemFlows.set(itemClassName, { producers: [], consumers: [] });
      itemFlows.get(itemClassName)!.consumers.push(node);
    }
  }

  // Ensure raw resources with only consumers are tracked
  for (const resource of rawResources) {
    if (!itemFlows.has(resource)) {
      const consumers = planNodes.filter(n => n.inputRates[resource] !== undefined);
      if (consumers.length > 0) {
        itemFlows.set(resource, { producers: [], consumers });
      }
    }
  }

  // Ensure imported items with only consumers are tracked
  for (const [itemClassName, rate] of Object.entries(importUsage)) {
    if (rate > 0.001 && !itemFlows.has(itemClassName)) {
      const consumers = planNodes.filter(n => n.inputRates[itemClassName] !== undefined);
      if (consumers.length > 0) {
        itemFlows.set(itemClassName, { producers: [], consumers });
      }
    }
  }

  for (const [itemClassName, { producers, consumers }] of itemFlows) {
    const isRawResource = rawResources.has(itemClassName) && producers.length === 0;
    const isImported = (importUsage[itemClassName] ?? 0) > 0.001 && producers.length === 0;
    const isTarget = targetItemClassNames.has(itemClassName);

    const totalProduction = isRawResource || isImported
      ? consumers.reduce((s, n) => s + (n.inputRates[itemClassName] ?? 0), 0)
      : producers.reduce((s, n) => s + (n.outputRates[itemClassName] ?? 0), 0);

    const totalConsumption = consumers.reduce((s, n) => s + (n.inputRates[itemClassName] ?? 0), 0);
    const surplus = Math.max(0, totalProduction - totalConsumption);

    let sources: Array<{ nodeId: string; rate: number }>;
    if (isRawResource) {
      sources = [{ nodeId: `resource_${itemClassName}`, rate: totalProduction }];
    } else if (isImported) {
      sources = [{ nodeId: `import_${itemClassName}`, rate: importUsage[itemClassName] }];
    } else {
      sources = producers.map(n => ({ nodeId: `recipe_${n.recipeClassName}`, rate: n.outputRates[itemClassName] ?? 0 }));
    }

    // Non-target surplus (production > consumption) and fully unconsumed outputs both route
    // to a byproduct sink. Previously only the fully-unconsumed case was handled, causing
    // partial surplus (e.g. two refineries producing more heavy oil residue than the next
    // stage consumes) to be silently dropped from the graph.
    const sinks: Array<{ nodeId: string; rate: number }> = [
      ...consumers.map(n => ({ nodeId: `recipe_${n.recipeClassName}`, rate: n.inputRates[itemClassName] ?? 0 })),
      ...(surplus > 0.01 && isTarget ? [{ nodeId: `product_${itemClassName}`, rate: surplus }] : []),
      ...(surplus > 0.01 && !isTarget && !isRawResource && !isImported ? [{ nodeId: `byproduct_${itemClassName}`, rate: surplus }] : []),
    ];

    if (sources.length === 0 || sinks.length === 0) continue;

    const totalSourceRate = sources.reduce((s, src) => s + src.rate, 0);
    if (totalSourceRate < 0.01) continue;

    // Greedy two-pointer assignment: sort both sides descending and drain the largest source
    // into the largest sink before moving on. This minimizes the number of split connections
    // (at most sources+sinks-1 edges) and keeps whole-producer routes where possible, e.g.
    // a refinery that alone covers a downstream consumer won't be split across multiple sinks.
    const sortedSources = [...sources].sort((a, b) => b.rate - a.rate)
      .map(s => ({ ...s, remaining: s.rate }));
    const sortedSinks = [...sinks].sort((a, b) => b.rate - a.rate)
      .map(s => ({ ...s, remaining: s.rate }));

    let srcIdx = 0, snkIdx = 0;
    while (srcIdx < sortedSources.length && snkIdx < sortedSinks.length) {
      const src = sortedSources[srcIdx];
      const snk = sortedSinks[snkIdx];
      const allocated = Math.min(src.remaining, snk.remaining);
      if (allocated > 0.01) {
        edges.push({
          id: `edge_${src.nodeId}_${snk.nodeId}_${itemClassName}`,
          fromNodeId: src.nodeId,
          toNodeId: snk.nodeId,
          itemClassName,
          ratePerMin: allocated,
        });
      }
      src.remaining -= allocated;
      snk.remaining -= allocated;
      if (src.remaining <= 0.01) srcIdx++;
      if (snk.remaining <= 0.01) snkIdx++;
    }
  }

  return edges;
}

function buildInfeasibilityMessage(
  input: SolverInput,
  rawResources: Set<string>,
  producibleItems: Set<string>,
  strategy = OptimizationStrategy.BALANCED,
): string {
  // Use the original strategy for the unconstrained solve so unrated MAX_OUTPUT targets
  // actually drive production — BALANCED would trivially satisfy balance >= 0 with 0 machines.
  const unconstrainedStrategy =
    strategy === OptimizationStrategy.MAX_OUTPUT ? OptimizationStrategy.MAX_OUTPUT : OptimizationStrategy.BALANCED;
  const unconstrained = buildAndSolve(
    input.availableRecipes,
    rawResources,
    producibleItems,
    input.targets,
    {},
    unconstrainedStrategy,
    input.manualInputs,
    true,
  );

  if (!unconstrained.feasible) {
    const unproducibleTargets = input.targets
      .filter(t => !producibleItems.has(t.itemClassName))
      .map(t => t.itemClassName);
    if (unproducibleTargets.length > 0) {
      return `These target items have no available recipe to produce them: ${unproducibleTargets.join(', ')}. Unlock more milestones or MAM research.`;
    }
    return 'Production plan is infeasible — the target items cannot be produced with the available recipes.';
  }

  const shortfalls: string[] = [];
  for (const resourceClassName of rawResources) {
    const totalConsumption = input.availableRecipes.reduce((sum, recipe) => {
      const x = (unconstrained[`recipe_${recipe.className}`] as number | undefined) ?? 0;
      const ingredient = recipe.ingredients.find(i => i.itemClassName === resourceClassName);
      if (!ingredient) return sum;
      return sum + x * ratePerMachine(ingredient.amount, recipe.time);
    }, 0);

    const available = input.resourcePool.limits[resourceClassName] ?? 0;
    if (totalConsumption > available + 0.01) {
      const resourceName = resourceClassName.replace('Desc_', '').replace('_C', '').replace(/([A-Z])/g, ' $1').trim();
      shortfalls.push(
        `${resourceName}: needs ${totalConsumption.toFixed(1)}/min, pool has ${available.toFixed(1)}/min`,
      );
    }
  }

  if (shortfalls.length > 0) {
    return `Not enough raw materials to meet targets:\n${shortfalls.join('\n')}`;
  }

  return 'Production plan is infeasible. Check resource pool limits and production targets.';
}

function solve(input: SolverInput): SolverOutput {
  const { targets, availableRecipes, resourcePool, strategy, manualInputs, recipePowerCoefficients = {} } = input;

  if (targets.length === 0) {
    return { status: 'error', errorMessage: 'No production targets specified.' };
  }

  const producibleItems = new Set<string>();
  for (const recipe of availableRecipes) {
    for (const product of recipe.products) {
      producibleItems.add(product.itemClassName);
    }
  }

  // Manual inputs make their items "producible" for balance constraint purposes
  for (const mi of manualInputs) {
    if (mi.ratePerMin > 0) {
      producibleItems.add(mi.itemClassName);
    }
  }

  for (const target of targets) {
    if (!producibleItems.has(target.itemClassName)) {
      return {
        status: 'error',
        errorMessage: `"${target.itemClassName}" cannot be produced by any available recipe. Unlock more milestones or MAM research.`,
      };
    }
  }

  // Raw resources: consumed but not producible and not freely available
  const rawResources = new Set<string>();
  for (const recipe of availableRecipes) {
    for (const ingredient of recipe.ingredients) {
      if (!producibleItems.has(ingredient.itemClassName) && !FREELY_AVAILABLE_ITEMS.has(ingredient.itemClassName)) {
        rawResources.add(ingredient.itemClassName);
      }
    }
  }

  const resourceLimits = resourcePool.limits;

  let result = buildAndSolve(
    availableRecipes,
    rawResources,
    producibleItems,
    targets,
    resourceLimits,
    strategy,
    manualInputs,
    false,
    recipePowerCoefficients,
  );

  if (!result.feasible) {
    const errorMessage = buildInfeasibilityMessage(input, rawResources, producibleItems);
    return { status: 'infeasible', errorMessage };
  }

  // MAX_OUTPUT phase 2: re-solve as BALANCED with achieved rates fixed.
  // The MAX_OUTPUT LP assigns objective=0 to recipes that don't produce/consume the target,
  // so the simplex can freely set those variables to arbitrary values (LP degeneracy). Running
  // a BALANCED pass with the achieved output locked in eliminates such spurious recipe activity.
  if (strategy === OptimizationStrategy.MAX_OUTPUT) {
    const fixedTargets = targets.map(t => {
      if (t.ratePerMin !== undefined) return t;
      const netRate = availableRecipes.reduce((sum, recipe) => {
        const x = (result[`recipe_${recipe.className}`] as number | undefined) ?? 0;
        const prod = recipe.products.find(p => p.itemClassName === t.itemClassName);
        const cons = recipe.ingredients.find(i => i.itemClassName === t.itemClassName);
        const prodRate = prod ? ratePerMachine(prod.amount, recipe.time) : 0;
        const consRate = cons ? ratePerMachine(cons.amount, recipe.time) : 0;
        return sum + x * (prodRate - consRate);
      }, 0);
      // Subtract a small epsilon so floating-point imprecision doesn't make the BALANCED
      // solve infeasible when the MAX_OUTPUT result is numerically right at the boundary.
      return { ...t, ratePerMin: Math.max(0, netRate * 0.9999) };
    });
    const cleanResult = buildAndSolve(
      availableRecipes, rawResources, producibleItems,
      fixedTargets, resourceLimits, OptimizationStrategy.BALANCED,
      manualInputs, false, recipePowerCoefficients,
    );
    if (cleanResult.feasible) {
      result = cleanResult;
    }
  }

  // OPT_MACHINES, OPT_RECIPES, and OPT_POWER improve the LP solution by greedily eliminating
  // recipes whose removal reduces the target metric.
  let finalResult = result;
  if (strategy === OptimizationStrategy.OPT_MACHINES || strategy === OptimizationStrategy.OPT_RECIPES) {
    finalResult = greedyEliminate(
      result,
      availableRecipes,
      rawResources,
      producibleItems,
      targets,
      resourceLimits,
      manualInputs,
      strategy === OptimizationStrategy.OPT_MACHINES ? 'machines' : 'recipes',
    );
  } else if (strategy === OptimizationStrategy.OPT_POWER) {
    finalResult = greedyEliminate(
      result,
      availableRecipes,
      rawResources,
      producibleItems,
      targets,
      resourceLimits,
      manualInputs,
      'power',
      recipePowerCoefficients,
    );
  }

  const planNodes: PlanNode[] = [];
  for (const recipe of availableRecipes) {
    const x = (finalResult[`recipe_${recipe.className}`] as number | undefined) ?? 0;
    if (x < 0.001) continue;

    const inputRates: Record<string, number> = {};
    const outputRates: Record<string, number> = {};

    for (const ingredient of recipe.ingredients) {
      // Skip freely available items — they don't need to be shown or tracked
      if (FREELY_AVAILABLE_ITEMS.has(ingredient.itemClassName)) continue;
      inputRates[ingredient.itemClassName] = x * ratePerMachine(ingredient.amount, recipe.time);
    }
    for (const product of recipe.products) {
      outputRates[product.itemClassName] = x * ratePerMachine(product.amount, recipe.time);
    }

    planNodes.push({
      id: `recipe_${recipe.className}`,
      recipeClassName: recipe.className,
      machineCount: x,
      inputRates,
      outputRates,
    });
  }

  // Resource usage from raw resources
  const resourceUsage: Record<string, number> = {};
  for (const resource of rawResources) {
    const total = planNodes.reduce((sum, node) => sum + (node.inputRates[resource] ?? 0), 0);
    if (total > 0.001) resourceUsage[resource] = total;
  }

  // Import usage from manual inputs
  const importUsage: Record<string, number> = {};
  for (const mi of manualInputs) {
    const rate = (finalResult[`import_${mi.itemClassName}`] as number | undefined) ?? 0;
    if (rate > 0.001) importUsage[mi.itemClassName] = rate;
  }

  // With MAX_OUTPUT, a zero-production result is effectively infeasible — the LP is technically
  // feasible (max of 0 satisfies balance >= 0) but produces nothing useful.
  if (strategy === OptimizationStrategy.MAX_OUTPUT) {
    const zeroTargets = targets
      .filter(t => t.ratePerMin === undefined)
      .filter(t => {
        const net = planNodes.reduce((sum, node) => sum + (node.outputRates[t.itemClassName] ?? 0) - (node.inputRates[t.itemClassName] ?? 0), 0);
        return net < 0.001;
      });
    if (zeroTargets.length > 0) {
      const errorMessage = buildInfeasibilityMessage(input, rawResources, producibleItems, strategy);
      return { status: 'infeasible', errorMessage };
    }
  }

  const edges = computeEdges(planNodes, targets, rawResources, importUsage);
  const totalMachineCount = planNodes.reduce((sum, n) => sum + Math.ceil(n.machineCount), 0);

  return {
    status: 'optimal',
    plan: { nodes: planNodes, edges, resourceUsage, importUsage, totalMachineCount },
  };
}

self.onmessage = (e: MessageEvent<MainToWorker>) => {
  const msg = e.data;
  if (msg.type !== 'SOLVE') return;

  try {
    const output = solve(msg.payload);
    const reply: WorkerToMain = { type: 'SOLVE_RESULT', payload: output };
    self.postMessage(reply);
  } catch (err) {
    const reply: WorkerToMain = {
      type: 'SOLVE_ERROR',
      payload: { message: err instanceof Error ? err.message : String(err) },
    };
    self.postMessage(reply);
  }
};
