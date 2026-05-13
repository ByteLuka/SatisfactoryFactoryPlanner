import type { Node, Edge } from '@xyflow/react';
import type { ProductionPlan, ProductionTarget, PlanNode, PlanEdge } from '../types/plan';
import type { GameData } from '../types/domain';
import type { ResourceNodeData } from '../components/phase2/nodes/ResourceNode';
import type { RecipeNodeData } from '../components/phase2/nodes/RecipeNode';
import type { ProductNodeData } from '../components/phase2/nodes/ProductNode';
import type { ImportNodeData } from '../components/phase2/nodes/ImportNode';
import type { ByproductNodeData } from '../components/phase2/nodes/ByproductNode';

export type GraphNode =
  | Node<ResourceNodeData, 'resourceNode'>
  | Node<RecipeNodeData, 'recipeNode'>
  | Node<ProductNodeData, 'productNode'>
  | Node<ImportNodeData, 'importNode'>
  | Node<ByproductNodeData, 'byproductNode'>;

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
  import: { width: 200, height: 90 },
  byproduct: { width: 200, height: 90 },
};

function getMachineName(recipe: { producedInClassNames: string[] }, buildings: GameData['buildings']): string {
  for (const cn of recipe.producedInClassNames) {
    const building = buildings[cn];
    if (building) return building.name;
  }
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
      type: 'resourceNode' as const,
      position: { x: 0, y: 0 },
      data: {
        itemClassName,
        itemName: item?.name ?? itemClassName,
        ratePerMin: rate,
        liquid: item?.liquid ?? false,
      },
    };
  });
}

function buildImportNodesFromEdges(
  edges: PlanEdge[],
  gameData: GameData,
  importUsage: Record<string, number>,
): Node<ImportNodeData, 'importNode'>[] {
  const importNodeIds = new Set(
    edges.filter(e => e.fromNodeId.startsWith('import_')).map(e => e.fromNodeId),
  );

  return Array.from(importNodeIds).map(nodeId => {
    const itemClassName = nodeId.replace('import_', '');
    const item = gameData.items[itemClassName];
    const rate = importUsage[itemClassName] ?? 0;

    return {
      id: nodeId,
      type: 'importNode' as const,
      position: { x: 0, y: 0 },
      data: {
        itemClassName,
        itemName: item?.name ?? itemClassName,
        ratePerMin: rate,
        liquid: item?.liquid ?? false,
      },
    };
  });
}

function buildRecipeNodes(
  planNodes: PlanNode[],
  gameData: GameData,
  manualMachineCounts: Record<string, number>,
  isManualMode: boolean,
  targetItemClassNames: string[],
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
      liquid: gameData.items[cn]?.liquid ?? false,
    }));
    const outputRates = Object.entries(planNode.outputRates).map(([cn, rate]) => ({
      itemClassName: cn,
      itemName: gameData.items[cn]?.name ?? cn,
      ratePerMin: rate * scale,
      liquid: gameData.items[cn]?.liquid ?? false,
    }));

    return {
      id: planNode.id,
      type: 'recipeNode' as const,
      position: { x: 0, y: 0 },
      data: {
        recipeClassName: planNode.recipeClassName,
        recipeName: recipe?.name ?? planNode.recipeClassName,
        machineName: recipe ? getMachineName(recipe, gameData.buildings) : 'Machine',
        machineCount: machineCountExact,
        machineCountExact,
        inputRates,
        outputRates,
        targetItemClassNames,
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
): Node<ProductNodeData, 'productNode'>[] {
  return targets.map(target => {
    const nodeId = `product_${target.itemClassName}`;
    const item = gameData.items[target.itemClassName];

    const achievedRate = edges
      .filter(e => e.toNodeId === nodeId)
      .reduce((sum, e) => sum + e.ratePerMin, 0);

    return {
      id: nodeId,
      type: 'productNode' as const,
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

function buildByproductNodesFromEdges(
  edges: PlanEdge[],
  gameData: GameData,
): Node<ByproductNodeData, 'byproductNode'>[] {
  const byproductNodeIds = new Set(
    edges.filter(e => e.toNodeId.startsWith('byproduct_')).map(e => e.toNodeId),
  );

  return Array.from(byproductNodeIds).map(nodeId => {
    const itemClassName = nodeId.replace('byproduct_', '');
    const item = gameData.items[itemClassName];
    const rate = edges
      .filter(e => e.toNodeId === nodeId)
      .reduce((sum, e) => sum + e.ratePerMin, 0);

    return {
      id: nodeId,
      type: 'byproductNode' as const,
      position: { x: 0, y: 0 },
      data: {
        itemClassName,
        itemName: item?.name ?? itemClassName,
        ratePerMin: rate,
        liquid: item?.liquid ?? false,
      },
    };
  });
}

function getEdgeEndpointColors(
  fromNodeId: string,
  toNodeId: string,
  itemClassName: string,
  targetItemSet: Set<string>,
): { sourceColor: string; targetColor: string } {
  let sourceColor: string;
  if (fromNodeId.startsWith('resource_')) {
    sourceColor = '#2dd4bf';
  } else if (fromNodeId.startsWith('import_')) {
    sourceColor = '#818cf8';
  } else {
    sourceColor = targetItemSet.has(itemClassName) ? '#4ade80' : '#fbbf24';
  }

  let targetColor: string;
  if (toNodeId.startsWith('product_')) {
    targetColor = '#e8820c';
  } else if (toNodeId.startsWith('byproduct_')) {
    targetColor = '#fb7185';
  } else {
    targetColor = '#60a5fa';
  }

  return { sourceColor, targetColor };
}

function buildRFEdges(planEdges: PlanEdge[], gameData: GameData, targetItemSet: Set<string>): Edge[] {
  return planEdges.map(pe => {
    const isFromResource = pe.fromNodeId.startsWith('resource_');
    const isFromImport = pe.fromNodeId.startsWith('import_');
    const isToProduct = pe.toNodeId.startsWith('product_');
    const isToByproduct = pe.toNodeId.startsWith('byproduct_');

    const sourceHandle = isFromResource || isFromImport ? 'out' : `out_${pe.itemClassName}`;
    const targetHandle = isToProduct || isToByproduct ? 'in' : `in_${pe.itemClassName}`;

    const item = gameData.items[pe.itemClassName];
    const isLiquid = item?.liquid ?? false;
    const unit = isLiquid ? 'm³/min' : '/min';
    const rateLabel = `${pe.ratePerMin.toFixed(1)}${unit}`;

    const { sourceColor, targetColor } = getEdgeEndpointColors(
      pe.fromNodeId, pe.toNodeId, pe.itemClassName, targetItemSet,
    );

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
      style: { stroke: '#606072', strokeWidth: 2 },
      animated: false,
      data: { sourceColor, targetColor },
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
  const targetItemClassNames = targets.map(t => t.itemClassName);
  const targetItemSet = new Set(targetItemClassNames);

  const resourceNodes = buildResourceNodesFromEdges(plan.edges, gameData, plan.resourceUsage);
  const importNodes = buildImportNodesFromEdges(plan.edges, gameData, plan.importUsage ?? {});
  const recipeNodes = buildRecipeNodes(
    plan.nodes,
    gameData,
    manualMachineCounts,
    isManualMode,
    targetItemClassNames,
    onMachineCountChange,
  );
  const productNodes = buildProductNodes(targets, plan.edges, gameData);
  const byproductNodes = buildByproductNodesFromEdges(plan.edges, gameData);
  const rfEdges = buildRFEdges(plan.edges, gameData, targetItemSet);

  return {
    nodes: [...resourceNodes, ...importNodes, ...recipeNodes, ...productNodes, ...byproductNodes],
    edges: rfEdges,
  };
}
