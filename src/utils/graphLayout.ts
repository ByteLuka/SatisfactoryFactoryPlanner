import type { GraphNode } from '../data/planTransformers';
import type { Edge } from '@xyflow/react';
import { NODE_DIMENSIONS } from '../data/planTransformers';

export interface LayoutPosition {
  x: number;
  y: number;
}

export interface LayoutResult {
  nodePositions: Map<string, LayoutPosition>;
  edgeRoutes: Map<string, LayoutPosition[]>;
}

// Matches RecipeNode layout: header ~63px + py-2 8px + handle center within 28px row (14+5=19px)
const RECIPE_HANDLE_FIRST_Y = 90;
const RECIPE_HANDLE_SPACING = 36;

function getNodeDimensions(node: GraphNode): { width: number; height: number } {
  if (node.type === 'resourceNode') return NODE_DIMENSIONS.resource;
  if (node.type === 'productNode') return NODE_DIMENSIONS.product;
  if (node.type === 'importNode') return NODE_DIMENSIONS.import;
  if (node.type === 'byproductNode') return NODE_DIMENSIONS.byproduct;
  if (node.type === 'recipeNode') {
    const d = node.data;
    return NODE_DIMENSIONS.recipe(d.inputRates.length, d.outputRates.length);
  }
  return { width: 200, height: 100 };
}

function buildELKNode(node: GraphNode) {
  const { width, height } = getNodeDimensions(node);

  if (node.type === 'recipeNode') {
    const { inputRates, outputRates } = node.data;
    const ports = [
      ...inputRates.map((ir, i) => ({
        id: `${node.id}__in_${ir.itemClassName}`,
        x: 0,
        y: RECIPE_HANDLE_FIRST_Y + i * RECIPE_HANDLE_SPACING,
        width: 1,
        height: 1,
      })),
      ...outputRates.map((or, i) => ({
        id: `${node.id}__out_${or.itemClassName}`,
        x: width,
        y: RECIPE_HANDLE_FIRST_Y + i * RECIPE_HANDLE_SPACING,
        width: 1,
        height: 1,
      })),
    ];
    return {
      id: node.id,
      width,
      height,
      ports,
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
    };
  }

  if (node.type === 'resourceNode' || node.type === 'importNode') {
    return {
      id: node.id,
      width,
      height,
      ports: [{ id: `${node.id}__out`, x: width, y: height / 2, width: 1, height: 1 }],
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
    };
  }

  if (node.type === 'productNode' || node.type === 'byproductNode') {
    return {
      id: node.id,
      width,
      height,
      ports: [{ id: `${node.id}__in`, x: 0, y: height / 2, width: 1, height: 1 }],
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
    };
  }

  // All GraphNode variants handled above; this branch is unreachable
  throw new Error(`Unknown node type: ${(node as { type: string }).type}`);
}

function buildTopoOrder(nodes: GraphNode[], edges: Edge[]): Map<string, number> {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) { inDegree.set(n.id, 0); adj.set(n.id, []); }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }
  const queue = nodes.filter(n => (inDegree.get(n.id) ?? 0) === 0).map(n => n.id);
  const order = new Map<string, number>();
  let idx = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.set(id, idx++);
    for (const neighbor of adj.get(id) ?? []) {
      const deg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    }
  }
  for (const n of nodes) { if (!order.has(n.id)) order.set(n.id, idx++); }
  return order;
}

export async function computeLayout(
  nodes: GraphNode[],
  edges: Edge[],
): Promise<LayoutResult> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const elk = new ELK();

  const topoOrder = buildTopoOrder(nodes, edges);
  const sortedEdges = [...edges].sort((a, b) => {
    const srcDiff = (topoOrder.get(a.source) ?? 0) - (topoOrder.get(b.source) ?? 0);
    if (srcDiff !== 0) return srcDiff;
    return (topoOrder.get(a.target) ?? 0) - (topoOrder.get(b.target) ?? 0);
  });

  const elkNodes = nodes.map(buildELKNode);

  const elkEdges = sortedEdges.map(e => {
    const id = e.id ?? `${e.source}_${e.target}`;
    const src = e.sourceHandle ? `${e.source}__${e.sourceHandle}` : e.source;
    const tgt = e.targetHandle ? `${e.target}__${e.targetHandle}` : e.target;
    return { id, sources: [src], targets: [tgt] };
  });

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.spacing.nodeNode': '50',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
      'elk.layered.crossingMinimization.semiInteractive': 'false',
      'elk.layered.considerModelOrder.strategy': 'PREFER_EDGES',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '20',
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const layouted = await elk.layout(graph);

  const nodePositions = new Map<string, LayoutPosition>();
  for (const child of layouted.children ?? []) {
    if (child.x !== undefined && child.y !== undefined) {
      nodePositions.set(child.id, { x: child.x, y: child.y });
    }
  }

  const edgeRoutes = new Map<string, LayoutPosition[]>();
  for (const edge of layouted.edges ?? []) {
    const bends: LayoutPosition[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const section of (edge as any).sections ?? []) {
      for (const bp of section.bendPoints ?? []) {
        bends.push({ x: bp.x, y: bp.y });
      }
    }
    edgeRoutes.set(edge.id, bends);
  }

  return { nodePositions, edgeRoutes };
}
