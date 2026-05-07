import Solver from 'javascript-lp-solver';
import type { MainToWorker, WorkerToMain, SolverInput, SolverOutput, PlanNode, PlanEdge, ProductionPlan } from '../types/plan';
import type { Recipe } from '../types/domain';
import { OptimizationStrategy } from '../types/plan';

// Rate in items/min that one machine produces/consumes a given amount
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
  omitResourceConstraints = false,
): ReturnType<typeof Solver.Solve> {
  const targetItemClassNames = new Set(targets.map(t => t.itemClassName));

  const constraints: Record<string, { min?: number; max?: number }> = {};
  const variables: Record<string, Record<string, number>> = {};

  // Balance constraints for producible items
  for (const itemClassName of producibleItems) {
    const targetRate = targets.find(t => t.itemClassName === itemClassName)?.ratePerMin;
    constraints[`balance_${itemClassName}`] = { min: targetRate ?? 0 };
  }

  // Resource pool constraints (skipped when omitResourceConstraints = true for diagnostics)
  if (!omitResourceConstraints) {
    for (const resourceClassName of rawResources) {
      const limit = resourceLimits[resourceClassName];
      if (limit !== undefined) {
        constraints[`resource_${resourceClassName}`] = { max: limit };
      }
    }
  }

  for (const recipe of recipes) {
    const varName = `recipe_${recipe.className}`;
    const variable: Record<string, number> = {};

    // Objective coefficient
    if (strategy === OptimizationStrategy.MAX_OUTPUT) {
      let objCoeff = 0;
      for (const target of targets) {
        if (target.ratePerMin !== undefined) continue;
        const prod = recipe.products.find(p => p.itemClassName === target.itemClassName);
        const cons = recipe.ingredients.find(i => i.itemClassName === target.itemClassName);
        const prodRate = prod ? ratePerMachine(prod.amount, recipe.time) : 0;
        const consRate = cons ? ratePerMachine(cons.amount, recipe.time) : 0;
        objCoeff += prodRate - consRate;
      }
      variable['objective'] = objCoeff;
    } else {
      variable['objective'] = 1;
    }

    // Balance constraint contributions
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
    }

    // Resource constraint contributions
    for (const ingredient of recipe.ingredients) {
      if (rawResources.has(ingredient.itemClassName)) {
        const key = `resource_${ingredient.itemClassName}`;
        variable[key] = (variable[key] ?? 0) + ratePerMachine(ingredient.amount, recipe.time);
      }
    }

    variables[varName] = variable;
  }

  return Solver.Solve({
    optimize: 'objective',
    opType: strategy === OptimizationStrategy.MAX_OUTPUT ? 'max' : 'min',
    constraints,
    variables,
  });
}

function computeEdges(
  planNodes: PlanNode[],
  targets: SolverInput['targets'],
  rawResources: Set<string>,
): PlanEdge[] {
  const edges: PlanEdge[] = [];
  const targetItemClassNames = new Set(targets.map(t => t.itemClassName));

  // Map: itemClassName → { producers, consumers }
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

  // Also ensure raw resources with only consumers are in the map
  for (const resource of rawResources) {
    if (!itemFlows.has(resource)) {
      // Check if any plan node consumes this resource
      const consumers = planNodes.filter(n => n.inputRates[resource] !== undefined);
      if (consumers.length > 0) {
        itemFlows.set(resource, { producers: [], consumers });
      }
    }
  }

  for (const [itemClassName, { producers, consumers }] of itemFlows) {
    const isRawResource = rawResources.has(itemClassName) && producers.length === 0;
    const isTarget = targetItemClassNames.has(itemClassName);

    const totalProduction = isRawResource
      ? consumers.reduce((s, n) => s + (n.inputRates[itemClassName] ?? 0), 0)
      : producers.reduce((s, n) => s + (n.outputRates[itemClassName] ?? 0), 0);

    const totalConsumption = consumers.reduce((s, n) => s + (n.inputRates[itemClassName] ?? 0), 0);
    const surplus = Math.max(0, totalProduction - totalConsumption);

    const sources: Array<{ nodeId: string; rate: number }> = isRawResource
      ? [{ nodeId: `resource_${itemClassName}`, rate: totalProduction }]
      : producers.map(n => ({ nodeId: `recipe_${n.recipeClassName}`, rate: n.outputRates[itemClassName] ?? 0 }));

    const sinks: Array<{ nodeId: string; rate: number }> = [
      ...consumers.map(n => ({ nodeId: `recipe_${n.recipeClassName}`, rate: n.inputRates[itemClassName] ?? 0 })),
      ...(isTarget && surplus > 0.01 ? [{ nodeId: `product_${itemClassName}`, rate: surplus }] : []),
    ];

    if (sources.length === 0 || sinks.length === 0) continue;

    const totalSourceRate = sources.reduce((s, src) => s + src.rate, 0);
    if (totalSourceRate < 0.01) continue;

    // Distribute each source proportionally to all sinks
    for (const source of sources) {
      const fraction = source.rate / totalSourceRate;
      for (const sink of sinks) {
        const rate = sink.rate * fraction;
        if (rate < 0.01) continue;
        edges.push({
          id: `edge_${source.nodeId}_${sink.nodeId}_${itemClassName}`,
          fromNodeId: source.nodeId,
          toNodeId: sink.nodeId,
          itemClassName,
          ratePerMin: rate,
        });
      }
    }
  }

  return edges;
}

function buildInfeasibilityMessage(
  input: SolverInput,
  rawResources: Set<string>,
  producibleItems: Set<string>,
): string {
  // Diagnose: can the problem be solved without resource constraints?
  const unconstrained = buildAndSolve(
    input.availableRecipes,
    rawResources,
    producibleItems,
    input.targets,
    {},
    OptimizationStrategy.MIN_MACHINES,
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

  // Find which resources are bottlenecks
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
  const { targets, availableRecipes, resourcePool, strategy } = input;

  if (targets.length === 0) {
    return { status: 'error', errorMessage: 'No production targets specified.' };
  }

  // Determine producible items (items that can be output by at least one available recipe)
  const producibleItems = new Set<string>();
  for (const recipe of availableRecipes) {
    for (const product of recipe.products) {
      producibleItems.add(product.itemClassName);
    }
  }

  // Validate targets
  for (const target of targets) {
    if (!producibleItems.has(target.itemClassName)) {
      return {
        status: 'error',
        errorMessage: `"${target.itemClassName}" cannot be produced by any available recipe. Unlock more milestones or MAM research.`,
      };
    }
  }

  // Determine raw resources (consumed but not produced by any available recipe)
  const rawResources = new Set<string>();
  for (const recipe of availableRecipes) {
    for (const ingredient of recipe.ingredients) {
      if (!producibleItems.has(ingredient.itemClassName)) {
        rawResources.add(ingredient.itemClassName);
      }
    }
  }

  const resourceLimits = resourcePool.limits;

  const result = buildAndSolve(
    availableRecipes,
    rawResources,
    producibleItems,
    targets,
    resourceLimits,
    strategy,
  );

  if (!result.feasible) {
    const errorMessage = buildInfeasibilityMessage(input, rawResources, producibleItems);
    return { status: 'infeasible', errorMessage };
  }

  // Extract plan nodes from solver result
  const planNodes: PlanNode[] = [];
  for (const recipe of availableRecipes) {
    const x = (result[`recipe_${recipe.className}`] as number | undefined) ?? 0;
    if (x < 0.001) continue;

    const inputRates: Record<string, number> = {};
    const outputRates: Record<string, number> = {};

    for (const ingredient of recipe.ingredients) {
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

  // Compute resource usage
  const resourceUsage: Record<string, number> = {};
  for (const resource of rawResources) {
    const total = planNodes.reduce(
      (sum, node) => sum + (node.inputRates[resource] ?? 0),
      0,
    );
    if (total > 0.001) resourceUsage[resource] = total;
  }

  // Compute edges
  const edges = computeEdges(planNodes, targets, rawResources);

  const totalMachineCount = planNodes.reduce((sum, n) => sum + Math.ceil(n.machineCount), 0);

  return {
    status: 'optimal',
    plan: { nodes: planNodes, edges, resourceUsage, totalMachineCount },
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
