import type { GraphNode } from '../data/planTransformers';
import type { Edge } from '@xyflow/react';
import { NODE_DIMENSIONS } from '../data/planTransformers';

export interface LayoutPosition {
  x: number;
  y: number;
}

function getNodeDimensions(node: GraphNode): { width: number; height: number } {
  if (node.type === 'resourceNode') return NODE_DIMENSIONS.resource;
  if (node.type === 'productNode') return NODE_DIMENSIONS.product;
  if (node.type === 'recipeNode') {
    const d = node.data;
    return NODE_DIMENSIONS.recipe(d.inputRates.length, d.outputRates.length);
  }
  return { width: 200, height: 100 };
}

export async function computeLayout(
  nodes: GraphNode[],
  edges: Edge[],
): Promise<Map<string, LayoutPosition>> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const elk = new ELK();

  const elkNodes = nodes.map(n => {
    const { width, height } = getNodeDimensions(n);
    return {
      id: n.id,
      width,
      height,
    };
  });

  const elkEdges = edges.map(e => ({
    id: e.id ?? `${e.source}_${e.target}`,
    sources: [e.source],
    targets: [e.target],
  }));

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.spacing.nodeNode': '40',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const layouted = await elk.layout(graph);

  const positions = new Map<string, LayoutPosition>();
  for (const child of layouted.children ?? []) {
    if (child.x !== undefined && child.y !== undefined) {
      positions.set(child.id, { x: child.x, y: child.y });
    }
  }

  return positions;
}
