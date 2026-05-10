import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type NodeChange,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { ProductionPlan, ProductionTarget, GraphOptions } from '../../types/plan';
import type { GameData } from '../../types/domain';
import type { PlanAction, NodePosition } from '../../store/PlanContext';
import { ResourceNode } from './nodes/ResourceNode';
import { RecipeNode } from './nodes/RecipeNode';
import { ProductNode } from './nodes/ProductNode';
import { ImportNode } from './nodes/ImportNode';
import { ByproductNode } from './nodes/ByproductNode';
import { ELKRouteEdge } from './ELKRouteEdge';
import { transformPlanToGraphData } from '../../data/planTransformers';
import { computeLayout } from '../../utils/graphLayout';

const nodeTypes = {
  resourceNode: ResourceNode,
  recipeNode: RecipeNode,
  productNode: ProductNode,
  importNode: ImportNode,
  byproductNode: ByproductNode,
} as const;

const edgeTypes = {
  elkRoute: ELKRouteEdge,
} as const;

interface Props {
  plan: ProductionPlan;
  targets: ProductionTarget[];
  gameData: GameData;
  manualMachineCounts: Record<string, number>;
  isManualMode: boolean;
  layoutVersion: number;
  graphOptions: GraphOptions;
  dispatch: (action: PlanAction) => void;
}

export function ProductionGraph({
  plan,
  targets,
  gameData,
  manualMachineCounts,
  isManualMode,
  layoutVersion,
  graphOptions,
  dispatch,
}: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [highlightedEdgeIds, setHighlightedEdgeIds] = useState<Set<string>>(new Set());
  const layoutRunRef = useRef(0);

  const handleMachineCountChange = useCallback(
    (recipeClassName: string, count: number) => {
      dispatch({ type: 'SET_MANUAL_MACHINE_COUNT', recipeClassName, count });
    },
    [dispatch],
  );

  // Recompute graph whenever plan, mode, or manual counts change
  useEffect(() => {
    const { nodes: rfNodes, edges: rfEdges } = transformPlanToGraphData(
      plan,
      targets,
      gameData,
      manualMachineCounts,
      isManualMode,
      handleMachineCountChange,
    );

    const hiddenNodeTypes = new Set<string>();
    if (!graphOptions.showResourceNodes) hiddenNodeTypes.add('resourceNode');
    if (!graphOptions.showByproductNodes) hiddenNodeTypes.add('byproductNode');

    const visibleNodes = hiddenNodeTypes.size > 0
      ? rfNodes.filter(n => !hiddenNodeTypes.has(n.type ?? ''))
      : rfNodes;
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    const visibleEdges = hiddenNodeTypes.size > 0
      ? rfEdges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
      : rfEdges;

    const runId = ++layoutRunRef.current;

    computeLayout(visibleNodes, visibleEdges).then(({ nodePositions, edgeRoutes }) => {
      if (layoutRunRef.current !== runId) return; // stale

      const layoutedNodes: Node[] = visibleNodes.map(n => ({
        ...n,
        position: nodePositions.get(n.id) ?? n.position,
      }));

      const layoutedEdges: Edge[] = visibleEdges.map(e => ({
        ...e,
        type: 'elkRoute',
        data: {
          ...((e.data as Record<string, unknown>) ?? {}),
          waypoints: edgeRoutes.get(e.id ?? `${e.source}_${e.target}`) ?? [],
        },
      }));

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      setHighlightedEdgeIds(new Set());
    });
  }, [plan, targets, gameData, isManualMode, layoutVersion, graphOptions, handleMachineCountChange]);

  // Update only data when manual counts change (avoid re-layout)
  useEffect(() => {
    if (!isManualMode) return;
    setNodes(prev =>
      prev.map(n => {
        if (n.type !== 'recipeNode') return n;
        const recipeClassName = (n.data as { recipeClassName: string }).recipeClassName;
        const count = manualMachineCounts[recipeClassName];
        if (count === undefined) return n;
        return {
          ...n,
          data: {
            ...n.data,
            machineCount: count,
            machineCountExact: count,
          },
        };
      }),
    );
  }, [manualMachineCounts, isManualMode]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      onNodesChange(changes);
    },
    [onNodesChange],
  );

  const handleEdgeClick = useCallback((_evt: React.MouseEvent, clickedEdge: Edge) => {
    setHighlightedEdgeIds(prev => {
      const isAlreadyOnly = prev.size === 1 && prev.has(clickedEdge.id);
      return isAlreadyOnly ? new Set() : new Set([clickedEdge.id]);
    });
  }, []);

  const handleNodeClick = useCallback((_evt: React.MouseEvent, node: Node) => {
    setHighlightedEdgeIds(() => {
      const connectedIds = new Set(
        edges.filter(e => e.source === node.id || e.target === node.id).map(e => e.id),
      );
      return connectedIds;
    });
  }, [edges]);

  const handlePaneClick = useCallback(() => {
    setHighlightedEdgeIds(new Set());
  }, []);

  const hasHighlight = highlightedEdgeIds.size > 0;

  const displayEdges = useMemo(() =>
    edges.map(e => ({
      ...e,
      className: highlightedEdgeIds.has(e.id) ? 'edge-highlighted' : undefined,
      data: { ...(e.data as Record<string, unknown>), highlighted: highlightedEdgeIds.has(e.id) },
    })),
    [edges, highlightedEdgeIds],
  );

  return (
    <div className={`w-full h-full relative${hasHighlight ? ' graph-has-highlight' : ''}`}>
      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodesConnectable={false}
        edgesReconnectable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#3a3a46" gap={20} size={1} />
        <Controls
          style={{
            background: '#25252d',
            border: '1px solid #3a3a46',
            borderRadius: 6,
            '--xy-controls-button-background-color': '#25252d',
            '--xy-controls-button-background-color-hover': '#2e2e38',
            '--xy-controls-button-color': '#8888a0',
            '--xy-controls-button-color-hover': '#e8e8f0',
            '--xy-controls-button-border-color': '#3a3a46',
            '--xy-controls-box-shadow': 'none',
          } as React.CSSProperties}
        />
      </ReactFlow>

      {/* Reset layout button */}
      <button
        onClick={() => dispatch({ type: 'RESET_LAYOUT' })}
        className="absolute top-3 right-3 z-10 bg-[#25252d] border border-[#3a3a46] hover:border-[#e8820c]/50 text-[#8888a0] hover:text-[#e8e8f0] text-xs px-3 py-1.5 rounded-md transition-colors shadow"
      >
        Reset layout
      </button>
    </div>
  );
}
