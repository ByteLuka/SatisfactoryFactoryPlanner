import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export interface ImportNodeData extends Record<string, unknown> {
  itemClassName: string;
  itemName: string;
  ratePerMin: number;
}

export function ImportNode({ data }: NodeProps & { data: ImportNodeData }) {
  return (
    <div
      style={{ minWidth: 180 }}
      className="bg-[#1e1b4b] border border-[#4f46e5] rounded-lg px-4 py-3 shadow-lg"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#818cf8' }}>
        Imported Input
      </div>
      <div className="text-[#e8e8f0] text-sm font-semibold truncate">{data.itemName}</div>
      <div className="text-xs mt-1 font-mono" style={{ color: '#a5b4fc' }}>
        {data.ratePerMin.toFixed(1)}/min
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: '#4f46e5', border: '2px solid #818cf8', width: 10, height: 10 }}
      />
    </div>
  );
}
