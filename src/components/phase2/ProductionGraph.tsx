import { useEffect, useCallback, useRef } from 'react';
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

import type { ProductionPlan, ProductionTarget } from '../../types/plan';
import type { GameData } from '../../types/domain';
import type { PlanAction, NodePosition } from '../../store/PlanContext';
import { ResourceNode } from './nodes/ResourceNode';
import { RecipeNode } from './nodes/RecipeNode';
import { ProductNode } from './nodes/ProductNode';
import { ImportNode } from './nodes/ImportNode';
import { transformPlanToGraphData } from '../../data/planTransformers';
import { computeLayout } from '../../utils/graphLayout';

const nodeTypes = {
  resourceNode: ResourceNode,
  recipeNode: RecipeNode,
  productNode: ProductNode,
  importNode: ImportNode,
} as const;

interface Props {
  plan: ProductionPlan;
  targets: ProductionTarget[];
  gameData: GameData;
  manualMachineCounts: Record<string, number>;
  isManualMode: boolean;
  layoutVersion: number;
  dispatch: (action: PlanAction) => void;
}

export function ProductionGraph({
  plan,
  targets,
  gameData,
  manualMachineCounts,
  isManualMode,
  layoutVersion,
  dispatch,
}: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
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

    const runId = ++layoutRunRef.current;

    computeLayout(rfNodes, rfEdges).then(positions => {
      if (layoutRunRef.current !== runId) return; // stale

      const layoutedNodes: Node[] = rfNodes.map(n => ({
        ...n,
        position: positions.get(n.id) ?? n.position,
      }));

      setNodes(layoutedNodes);
      setEdges(rfEdges);
    });
  }, [plan, targets, gameData, isManualMode, layoutVersion, handleMachineCountChange]);

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

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#3a3a46" gap={20} size={1} />
        <Controls
          style={{ background: '#25252d', border: '1px solid #3a3a46', borderRadius: 6 }}
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
