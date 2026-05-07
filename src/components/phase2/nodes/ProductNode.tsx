import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export interface ProductNodeData extends Record<string, unknown> {
  itemClassName: string;
  itemName: string;
  achievedRate: number;
  targetRate?: number;
}

export function ProductNode({ data }: NodeProps & { data: ProductNodeData }) {
  const hasTarget = data.targetRate !== undefined;
  const met = !hasTarget || data.achievedRate >= data.targetRate! - 0.05;
  const rateColor = hasTarget ? (met ? '#4ade80' : '#f87171') : '#e8820c';

  return (
    <div
      style={{ minWidth: 200 }}
      className="bg-[#25252d] border-2 border-[#e8820c] rounded-lg px-4 py-3 shadow-lg"
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: '#e8820c', border: '2px solid #c4690a', width: 10, height: 10 }}
      />

      <div className="text-[#8888a0] text-[10px] font-semibold uppercase tracking-wider mb-1">
        Production Target
      </div>
      <div className="text-[#e8e8f0] text-sm font-semibold truncate mb-2">{data.itemName}</div>

      <div className="flex items-baseline gap-1">
        <span style={{ color: rateColor }} className="text-base font-bold font-mono">
          {data.achievedRate.toFixed(1)}
        </span>
        {hasTarget && (
          <>
            <span className="text-[#8888a0] text-xs">/</span>
            <span className="text-[#8888a0] text-xs font-mono">{data.targetRate!.toFixed(1)}</span>
          </>
        )}
        <span className="text-[#8888a0] text-xs">/min</span>
      </div>

      {hasTarget && !met && (
        <div className="mt-1 text-[10px] text-[#f87171]">
          Shortfall: {(data.targetRate! - data.achievedRate).toFixed(1)}/min
        </div>
      )}
    </div>
  );
}
