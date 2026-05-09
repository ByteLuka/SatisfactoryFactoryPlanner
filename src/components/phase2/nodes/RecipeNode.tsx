import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { useState, useRef, useEffect } from 'react';

export interface ItemRate {
  itemClassName: string;
  itemName: string;
  ratePerMin: number;
  liquid: boolean;
}

export interface RecipeNodeData extends Record<string, unknown> {
  recipeClassName: string;
  recipeName: string;
  machineName: string;
  machineCount: number;
  machineCountExact: number;
  inputRates: ItemRate[];
  outputRates: ItemRate[];
  targetItemClassNames: string[];
  isAlternate: boolean;
  isManualMode: boolean;
  onMachineCountChange: (count: number) => void;
}

const INPUT_COLOR = '#60a5fa';    // blue-400 — consumed ingredients
const OUTPUT_COLOR = '#4ade80';   // green-400 — target products
const BYPRODUCT_COLOR = '#fbbf24'; // amber-400 — byproducts (non-target outputs)

const HANDLE_SPACING = 36;
const HANDLE_OFFSET_START = 56;

function handleTop(index: number): number {
  return HANDLE_OFFSET_START + index * HANDLE_SPACING;
}

export function RecipeNode({ data, selected }: NodeProps & { data: RecipeNodeData; selected?: boolean }) {
  const [editingCount, setEditingCount] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const displayCount = Math.ceil(data.machineCountExact);
  const isExact = Math.abs(data.machineCountExact - displayCount) < 0.01;
  const targetSet = new Set(data.targetItemClassNames);

  useEffect(() => {
    if (editingCount && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCount]);

  function startEdit() {
    if (!data.isManualMode) return;
    setInputValue(data.machineCountExact.toFixed(2));
    setEditingCount(true);
  }

  function commitEdit() {
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed) && parsed >= 0) {
      data.onMachineCountChange(parsed);
    }
    setEditingCount(false);
  }

  return (
    <div
      style={{ minWidth: 240 }}
      className={[
        'bg-[#25252d] rounded-lg shadow-lg overflow-visible',
        selected ? 'border-2 border-[#e8820c]' : 'border border-[#3a3a46]',
      ].join(' ')}
    >
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-[#3a3a46]">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[#e8e8f0] text-sm font-semibold truncate flex-1">{data.recipeName}</span>
          {data.isAlternate && (
            <span className="text-[10px] font-bold bg-[#e8820c]/20 text-[#e8820c] border border-[#e8820c]/40 rounded px-1.5 py-0.5 flex-shrink-0">
              ALT
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1">
          <span className="text-[#8888a0] text-xs">{data.machineName}</span>
          <span className="text-[#3a3a46]">×</span>
          {editingCount ? (
            <input
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') setEditingCount(false);
              }}
              className="w-16 bg-[#1a1a1f] border border-[#e8820c]/60 rounded px-1 py-0.5 text-xs text-[#e8e8f0] focus:outline-none nodrag"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              title={isExact ? undefined : `${data.machineCountExact.toFixed(3)} exact`}
              onClick={startEdit}
              className={[
                'text-xs font-mono text-[#e8e8f0]',
                data.isManualMode ? 'cursor-pointer hover:text-[#e8820c] underline decoration-dotted' : '',
              ].join(' ')}
            >
              {displayCount}
              {!isExact && <span className="text-[#8888a0] ml-0.5">*</span>}
            </span>
          )}
        </div>
      </div>

      {/* I/O rates */}
      <div className="flex">
        {/* Inputs */}
        <div className="flex-1 px-3 py-2 space-y-2 border-r border-[#3a3a46] relative">
          {data.inputRates.map((ir) => (
            <div key={ir.itemClassName} className="relative" style={{ height: 28 }}>
              <Handle
                type="target"
                position={Position.Left}
                id={`in_${ir.itemClassName}`}
                style={{ background: '#1e3a5f', border: `2px solid ${INPUT_COLOR}`, width: 10, height: 10, top: 14, left: -16 }}
              />
              <div className="flex flex-col">
                <span className="text-[10px] truncate leading-tight" style={{ color: INPUT_COLOR }}>{ir.itemName}</span>
                <span className="text-[10px] font-mono" style={{ color: INPUT_COLOR }}>{ir.ratePerMin.toFixed(1)}{ir.liquid ? ' m³/min' : '/min'}</span>
              </div>
            </div>
          ))}
          {data.inputRates.length === 0 && (
            <div className="text-[#8888a0] text-[10px] italic">No inputs</div>
          )}
        </div>

        {/* Outputs */}
        <div className="flex-1 px-3 py-2 space-y-2 relative">
          {data.outputRates.map((or) => {
            const isTarget = targetSet.has(or.itemClassName);
            const color = isTarget ? OUTPUT_COLOR : BYPRODUCT_COLOR;
            return (
              <div key={or.itemClassName} className="relative" style={{ height: 28 }}>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`out_${or.itemClassName}`}
                  style={{ background: isTarget ? '#14532d' : '#451a03', border: `2px solid ${color}`, width: 10, height: 10, top: 14, right: -16 }}
                />
                <div className="flex flex-col items-end">
                  <span className="text-[10px] truncate leading-tight" style={{ color }}>{or.itemName}</span>
                  <span className="text-[10px] font-mono" style={{ color }}>{or.ratePerMin.toFixed(1)}{or.liquid ? ' m³/min' : '/min'}</span>
                </div>
              </div>
            );
          })}
          {data.outputRates.length === 0 && (
            <div className="text-[#8888a0] text-[10px] italic text-right">No outputs</div>
          )}
        </div>
      </div>
    </div>
  );
}
