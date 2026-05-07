import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export interface ResourceNodeData extends Record<string, unknown> {
  itemClassName: string;
  itemName: string;
  ratePerMin: number;
}

export function ResourceNode({ data }: NodeProps & { data: ResourceNodeData }) {
  return (
    <div
      style={{ minWidth: 180 }}
      className="bg-[#25252d] border border-[#3a3a46] rounded-lg px-4 py-3 shadow-lg"
    >
      <div className="text-[#8888a0] text-[10px] font-semibold uppercase tracking-wider mb-1">
        Raw Resource
      </div>
      <div className="text-[#e8e8f0] text-sm font-semibold truncate">{data.itemName}</div>
      <div className="text-[#e8820c] text-xs mt-1 font-mono">
        {data.ratePerMin.toFixed(1)}/min
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: '#3a3a46', border: '2px solid #8888a0', width: 10, height: 10 }}
      />
    </div>
  );
}
