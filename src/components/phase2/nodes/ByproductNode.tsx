import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export interface ByproductNodeData extends Record<string, unknown> {
  itemClassName: string;
  itemName: string;
  ratePerMin: number;
  liquid: boolean;
}

export function ByproductNode({ data }: NodeProps & { data: ByproductNodeData }) {
  const unit = data.liquid ? ' m³/min' : '/min';

  return (
    <div
      style={{ minWidth: 180, background: '#2d1320', border: '1px solid #be185d' }}
      className="rounded-lg px-4 py-3 shadow-lg"
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: '#be185d', border: '2px solid #fb7185', width: 10, height: 10 }}
      />

      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#fb7185' }}>
        Byproduct
      </div>
      <div className="text-[#e8e8f0] text-sm font-semibold truncate">{data.itemName}</div>
      <div className="text-xs mt-1 font-mono" style={{ color: '#fda4af' }}>
        {data.ratePerMin.toFixed(1)}{unit}
      </div>
    </div>
  );
}
