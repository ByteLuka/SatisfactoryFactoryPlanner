import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export interface ResourceNodeData extends Record<string, unknown> {
  itemClassName: string;
  itemName: string;
  ratePerMin: number;
  liquid: boolean;
}

export function ResourceNode({ data }: NodeProps & { data: ResourceNodeData }) {
  return (
    <div
      style={{ minWidth: 180, background: '#0d2b2b', border: '1px solid #0d9488' }}
      className="rounded-lg px-4 py-3 shadow-lg"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#5eead4' }}>
        Raw Resource
      </div>
      <div className="text-[#e8e8f0] text-sm font-semibold truncate">{data.itemName}</div>
      <div className="text-xs mt-1 font-mono" style={{ color: '#2dd4bf' }}>
        {data.ratePerMin.toFixed(1)}{data.liquid ? ' m³/min' : '/min'}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: '#0d9488', border: '2px solid #2dd4bf', width: 10, height: 10 }}
      />
    </div>
  );
}
