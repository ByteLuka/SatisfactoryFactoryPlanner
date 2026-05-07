import type { Node, Edge } from '@xyflow/react';
import type { ProductionPlan, ProductionTarget, PlanNode, PlanEdge } from '../types/plan';
import type { GameData } from '../types/domain';
import type { ResourceNodeData } from '../components/phase2/nodes/ResourceNode';
import type { RecipeNodeData } from '../components/phase2/nodes/RecipeNode';
import type { ProductNodeData } from '../components/phase2/nodes/ProductNode';

export type GraphNode =
  | Node<ResourceNodeData, 'resourceNode'>
  | Node<RecipeNodeData, 'recipeNode'>
  | Node<ProductNodeData, 'productNode'>;

export interface GraphData {
  nodes: GraphNode[];
  edges: Edge[];
}

// Estimated node dimensions for ELK layout
export const NODE_DIMENSIONS = {
  resource: { width: 200, height: 90 },
  recipe: (inputCount: number, outputCount: number) => ({
    width: 260,
    height: 110 + Math.max(inputCount, outputCount) * 36,
  }),
  product: { width: 210, height: 110 },
};

function getMachineName(recipe: { producedInClassNames: string[] }, buildings: GameData['buildings']): string {
  for (const cn of recipe.producedInClassNames) {
    const building = buildings[cn];
    if (building) return building.name;
  }
  // Fallback: derive a human name from the className
  const cn = recipe.producedInClassNames[0] ?? '';
  return cn.replace(/Build_|Mk\d_C|_C$/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim() || 'Machine';
}

function buildResourceNodesFromEdges(
  edges: PlanEdge[],
  gameData: GameData,
  resourceUsage: Record<string, number>,
): Node<ResourceNodeData, 'resourceNode'>[] {
  const resourceNodeIds = new Set(
    edges.filter(e => e.fromNodeId.startsWith('resource_')).map(e => e.fromNodeId),
  );

  return Array.from(resourceNodeIds).map(nodeId => {
    const itemClassName = nodeId.replace('resource_', '');
    const item = gameData.items[itemClassName];
    const rate = resourceUsage[itemClassName] ?? 0;

    return {
      id: nodeId,
      type: 'resourceNode',
      position: { x: 0, y: 0 },
      data: {
        itemClassName,
        itemName: item?.name ?? itemClassName,
        ratePerMin: rate,
      },
    };
  });
}

function buildRecipeNodes(
  planNodes: PlanNode[],
  gameData: GameData,
  manualMachineCounts: Record<string, number>,
  isManualMode: boolean,
  onMachineCountChange: (recipeClassName: string, count: number) => void,
): Node<RecipeNodeData, 'recipeNode'>[] {
  return planNodes.map(planNode => {
    const recipe = gameData.recipes[planNode.recipeClassName];
    const machineCountExact = isManualMode
      ? (manualMachineCounts[planNode.recipeClassName] ?? planNode.machineCount)
      : planNode.machineCount;

    const scale = isManualMode
      ? machineCountExact / Math.max(planNode.machineCount, 0.001)
      : 1;

    const inputRates = Object.entries(planNode.inputRates).map(([cn, rate]) => ({
      itemClassName: cn,
      itemName: gameData.items[cn]?.name ?? cn,
      ratePerMin: rate * scale,
    }));
    const outputRates = Object.entries(planNode.outputRates).map(([cn, rate]) => ({
      itemClassName: cn,
      itemName: gameData.items[cn]?.name ?? cn,
      ratePerMin: rate * scale,
    }));

    return {
      id: planNode.id,
      type: 'recipeNode',
      position: { x: 0, y: 0 },
      data: {
        recipeClassName: planNode.recipeClassName,
        recipeName: recipe?.name ?? planNode.recipeClassName,
        machineName: recipe ? getMachineName(recipe, gameData.buildings) : 'Machine',
        machineCount: machineCountExact,
        machineCountExact,
        inputRates,
        outputRates,
        isAlternate: recipe?.alternate ?? false,
        isManualMode,
        onMachineCountChange: (count: number) =>
          onMachineCountChange(planNode.recipeClassName, count),
      },
    };
  });
}

function buildProductNodes(
  targets: ProductionTarget[],
  edges: PlanEdge[],
  gameData: GameData,
  manualMachineCounts: Record<string, number>,
  planNodes: PlanNode[],
  isManualMode: boolean,
): Node<ProductNodeData, 'productNode'>[] {
  return targets.map(target => {
    const nodeId = `product_${target.itemClassName}`;
    const item = gameData.items[target.itemClassName];

    // Sum all edges flowing into this product node
    const achievedRate = edges
      .filter(e => e.toNodeId === nodeId)
      .reduce((sum, e) => sum + e.ratePerMin, 0);

    return {
      id: nodeId,
      type: 'productNode',
      position: { x: 0, y: 0 },
      data: {
        itemClassName: target.itemClassName,
        itemName: item?.name ?? target.itemClassName,
        achievedRate,
        targetRate: target.ratePerMin,
      },
    };
  });
}

function buildRFEdges(planEdges: PlanEdge[], gameData: GameData): Edge[] {
  return planEdges.map(pe => {
    const sourceHandle = pe.fromNodeId.startsWith('resource_')
      ? 'out'
      : `out_${pe.itemClassName}`;
    const targetHandle = pe.toNodeId.startsWith('product_')
      ? 'in'
      : `in_${pe.itemClassName}`;

    const item = gameData.items[pe.itemClassName];
    const isLiquid = item?.liquid ?? false;
    const unit = isLiquid ? 'm³/min' : '/min';
    const rateLabel = `${pe.ratePerMin.toFixed(1)}${unit}`;

    return {
      id: pe.id,
      source: pe.fromNodeId,
      target: pe.toNodeId,
      sourceHandle,
      targetHandle,
      type: 'smoothstep',
      label: rateLabel,
      labelStyle: { fontSize: 10, fill: '#8888a0' },
      labelBgStyle: { fill: '#25252d', fillOpacity: 0.85 },
      style: { stroke: '#3a3a46', strokeWidth: 2 },
      animated: false,
    };
  });
}

export function transformPlanToGraphData(
  plan: ProductionPlan,
  targets: ProductionTarget[],
  gameData: GameData,
  manualMachineCounts: Record<string, number>,
  isManualMode: boolean,
  onMachineCountChange: (recipeClassName: string, count: number) => void,
): GraphData {
  const resourceNodes = buildResourceNodesFromEdges(plan.edges, gameData, plan.resourceUsage);
  const recipeNodes = buildRecipeNodes(
    plan.nodes,
    gameData,
    manualMachineCounts,
    isManualMode,
    onMachineCountChange,
  );
  const productNodes = buildProductNodes(
    targets,
    plan.edges,
    gameData,
    manualMachineCounts,
    plan.nodes,
    isManualMode,
  );

  const rfEdges = buildRFEdges(plan.edges, gameData);

  return {
    nodes: [...resourceNodes, ...recipeNodes, ...productNodes],
    edges: rfEdges,
  };
}

