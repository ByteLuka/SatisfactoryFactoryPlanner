import { useState, useRef, useEffect } from 'react';
import type { Item } from '../../types/domain';
import { OptimizationStrategy } from '../../types/plan';
import type { PlanAction } from '../../store/PlanContext';
import type { PlanState } from '../../store/PlanContext';
import { MAP_RESOURCE_POOL_LIMITS, RESOURCE_DISPLAY_NAMES } from '../../data/resources';

interface Props {
  planState: PlanState;
  dispatch: (action: PlanAction) => void;
  producibleItems: Item[];
  onCompute: () => void;
  solverStatus: 'idle' | 'solving';
}

const OPTIMIZATION_LABELS: Partial<Record<OptimizationStrategy, string>> = {
  [OptimizationStrategy.BALANCED]: 'Balanced',
  [OptimizationStrategy.OPT_MACHINES]: 'Optimize machines',
  [OptimizationStrategy.OPT_RECIPES]: 'Optimize recipe diversity',
};

function ItemSearch({
  items,
  onSelect,
  alreadySelected,
  placeholder,
}: {
  items: Item[];
  onSelect: (itemClassName: string) => void;
  alreadySelected: Set<string>;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  const filtered = query.trim()
    ? items.filter(
        i =>
          !alreadySelected.has(i.className) &&
          i.name.toLowerCase().includes(query.toLowerCase()),
      )
    : [];

  const visibleItems = filtered.slice(0, 30);

  function selectItem(className: string) {
    onSelect(className);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
  }

  useEffect(() => {
    setActiveIndex(-1);
    // Auto-select when exactly one result remains
    if (filtered.length === 1) {
      selectItem(filtered[0].className);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length === 1 ? filtered[0]?.className : filtered.length]);

  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || visibleItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (i + 1) % visibleItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (i <= 0 ? visibleItems.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < visibleItems.length) {
        selectItem(visibleItems[activeIndex].className);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-[#2e2e38] border border-[#3a3a46] rounded-md px-3 py-2 text-base text-[#e8e8f0] placeholder-[#8888a0] focus:outline-none focus:border-[#e8820c]/60"
      />
      {open && visibleItems.length > 0 && (
        <div ref={listRef} className="absolute top-full left-0 right-0 z-50 mt-1 bg-[#25252d] border border-[#3a3a46] rounded-md shadow-xl max-h-60 overflow-y-auto">
          {visibleItems.map((item, idx) => (
            <button
              key={item.className}
              ref={idx === activeIndex ? activeItemRef : null}
              onMouseDown={e => {
                e.preventDefault();
                selectItem(item.className);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
              className={[
                'w-full text-left px-3 py-2 text-base text-[#e8e8f0] transition-colors',
                idx === activeIndex ? 'bg-[#3a3a46]' : 'hover:bg-[#2e2e38]',
              ].join(' ')}
            >
              {item.name}
            </button>
          ))}
          {filtered.length > 30 && (
            <div className="px-3 py-2 text-sm text-[#8888a0]">
              {filtered.length - 30} more — type to refine
            </div>
          )}
        </div>
      )}
      {open && query.trim() !== '' && filtered.length === 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[#25252d] border border-[#3a3a46] rounded-md shadow-xl px-3 py-2 text-base text-[#8888a0]">
          No items found
        </div>
      )}
    </div>
  );
}

export function TargetInputPanel({ planState, dispatch, producibleItems, onCompute, solverStatus }: Props) {
  const { targets, manualInputs, resourcePool, strategy, solverMode } = planState;
  const anyUnratedTarget = targets.some(t => t.ratePerMin === undefined);
  const alreadySelectedTargets = new Set(targets.map(t => t.itemClassName));
  const alreadySelectedInputs = new Set(manualInputs.map(mi => mi.itemClassName));
  const isSolving = solverStatus === 'solving';

  const itemByClassName: Record<string, Item> = {};
  for (const item of producibleItems) itemByClassName[item.className] = item;

  // Effective strategy: if any target has no rate, force MAX_OUTPUT
  const effectiveStrategy = anyUnratedTarget ? OptimizationStrategy.MAX_OUTPUT : strategy;

  // Optimization options that are user-selectable (not MAX_OUTPUT — that's implicit)
  const optimizationOptions = [
    OptimizationStrategy.BALANCED,
    OptimizationStrategy.OPT_MACHINES,
    OptimizationStrategy.OPT_RECIPES,
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      {/* Production targets */}
      <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-4">
        <h3 className="text-[#e8e8f0] font-semibold text-base mb-3">Production Targets</h3>

        {targets.length === 0 ? (
          <p className="text-[#8888a0] text-sm mb-3">Add items you want to produce.</p>
        ) : (
          <div className="flex flex-col gap-2 mb-3">
            {targets.map(target => {
              const item = itemByClassName[target.itemClassName];
              return (
                <div
                  key={target.id}
                  className="flex items-center gap-2 bg-[#2e2e38] border border-[#3a3a46] rounded-md px-3 py-2"
                >
                  <span className="flex-1 text-base text-[#e8e8f0] truncate">
                    {item?.name ?? target.itemClassName}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={target.ratePerMin ?? ''}
                    onChange={e => {
                      const val = e.target.value.trim();
                      dispatch({
                        type: 'SET_TARGET_RATE',
                        id: target.id,
                        ratePerMin: val === '' ? undefined : parseFloat(val),
                      });
                    }}
                    placeholder="max"
                    className="w-20 bg-[#1a1a1f] border border-[#3a3a46] rounded px-2 py-1 text-sm text-[#e8e8f0] placeholder-[#8888a0] focus:outline-none focus:border-[#e8820c]/60 text-right"
                  />
                  <span className="text-[#8888a0] text-sm">/min</span>
                  <button
                    onClick={() => dispatch({ type: 'REMOVE_TARGET', id: target.id })}
                    className="text-[#8888a0] hover:text-[#f87171] transition-colors text-sm ml-1"
                    title="Remove target"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {producibleItems.length === 0 ? (
          <p className="text-[#8888a0] text-sm italic">
            No producible items — unlock milestones or MAM research in Phase 1.
          </p>
        ) : (
          <ItemSearch
            items={producibleItems}
            onSelect={cn => dispatch({ type: 'ADD_TARGET', itemClassName: cn })}
            alreadySelected={alreadySelectedTargets}
            placeholder="Search items to produce…"
          />
        )}
      </section>

      {/* Imported inputs */}
      <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-4">
        <h3 className="text-[#e8e8f0] font-semibold text-base mb-1">Imported Inputs</h3>
        <p className="text-[#8888a0] text-sm mb-3">
          Items produced by an external factory. The solver will use them as additional supply.
        </p>

        {manualInputs.length > 0 && (
          <div className="flex flex-col gap-2 mb-3">
            {manualInputs.map(mi => {
              const item = itemByClassName[mi.itemClassName];
              return (
                <div
                  key={mi.id}
                  className="flex items-center gap-2 bg-[#1e1b4b] border border-[#4f46e5]/50 rounded-md px-3 py-2"
                >
                  <span className="flex-1 text-base text-[#e8e8f0] truncate">
                    {item?.name ?? mi.itemClassName}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={mi.ratePerMin}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      dispatch({
                        type: 'SET_MANUAL_INPUT_RATE',
                        id: mi.id,
                        ratePerMin: isNaN(val) ? 0 : val,
                      });
                    }}
                    className="w-20 bg-[#1a1a1f] border border-[#4f46e5]/40 rounded px-2 py-1 text-sm text-[#e8e8f0] focus:outline-none focus:border-[#4f46e5] text-right"
                  />
                  <span className="text-[#8888a0] text-sm">/min</span>
                  <button
                    onClick={() => dispatch({ type: 'REMOVE_MANUAL_INPUT', id: mi.id })}
                    className="text-[#8888a0] hover:text-[#f87171] transition-colors text-sm ml-1"
                    title="Remove input"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {producibleItems.length > 0 && (
          <ItemSearch
            items={producibleItems}
            onSelect={cn => dispatch({ type: 'ADD_MANUAL_INPUT', itemClassName: cn })}
            alreadySelected={alreadySelectedInputs}
            placeholder="Search items to import…"
          />
        )}
      </section>

      {/* Optimization */}
      {targets.length > 0 && (
        <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-4">
          <h3 className="text-[#e8e8f0] font-semibold text-base mb-3">Optimization</h3>

          {anyUnratedTarget ? (
            <div className="text-sm text-[#e8820c] bg-[#e8820c]/10 border border-[#e8820c]/30 rounded-md px-3 py-2">
              Maximizing output — leave rate blank on any target to maximize it. Set a rate on all
              targets to choose a different optimization.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {optimizationOptions.map(s => (
                <label key={s} className="flex items-center gap-3 cursor-pointer">
                  <span
                    className={[
                      'w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                      strategy === s ? 'border-[#e8820c]' : 'border-[#3a3a46]',
                    ].join(' ')}
                  >
                    {strategy === s && <span className="w-2 h-2 rounded-full bg-[#e8820c]" />}
                  </span>
                  <span className="text-base text-[#e8e8f0]">
                    <input
                      type="radio"
                      className="sr-only"
                      checked={strategy === s}
                      onChange={() => dispatch({ type: 'SET_STRATEGY', strategy: s })}
                    />
                    {OPTIMIZATION_LABELS[s]}
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Resource pool */}
      <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-4">
        <h3 className="text-[#e8e8f0] font-semibold text-base mb-3">Resource Pool</h3>
        <div className="flex gap-2 mb-3">
          {(['map', 'custom'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => dispatch({ type: 'SET_RESOURCE_POOL_MODE', mode })}
              className={[
                'flex-1 text-sm py-1.5 rounded border transition-colors',
                resourcePool.mode === mode
                  ? 'bg-[#e8820c]/15 border-[#e8820c] text-[#e8e8f0]'
                  : 'bg-[#2e2e38] border-[#3a3a46] text-[#8888a0] hover:border-[#e8820c]/50',
              ].join(' ')}
            >
              {mode === 'map' ? 'Full map' : 'Custom'}
            </button>
          ))}
        </div>

        {resourcePool.mode === 'custom' && (
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
            {Object.entries(MAP_RESOURCE_POOL_LIMITS).map(([className, defaultLimit]) => {
              const name = RESOURCE_DISPLAY_NAMES[className] ?? className;
              const value = resourcePool.limits[className] ?? defaultLimit;
              return (
                <div key={className} className="flex items-center gap-2">
                  <span className="text-[#8888a0] text-sm flex-1 truncate">{name}</span>
                  <input
                    type="number"
                    min={0}
                    step={60}
                    value={value}
                    onChange={e =>
                      dispatch({
                        type: 'SET_RESOURCE_LIMIT',
                        itemClassName: className,
                        limit: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-24 bg-[#1a1a1f] border border-[#3a3a46] rounded px-2 py-0.5 text-sm text-[#e8e8f0] focus:outline-none focus:border-[#e8820c]/60 text-right"
                  />
                  <span className="text-[#8888a0] text-sm">/min</span>
                </div>
              );
            })}
          </div>
        )}
        {resourcePool.mode === 'map' && (
          <p className="text-[#8888a0] text-sm">
            Using full-map resource totals for all raw materials.
          </p>
        )}
      </section>

      {/* Graph display options */}
      <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-4">
        <h3 className="text-[#e8e8f0] font-semibold text-base mb-3">Graph Display</h3>
        <div className="flex flex-col gap-2">
          {(
            [
              { key: 'showResourceNodes', label: 'Resource nodes', description: 'Show raw material source nodes' },
              { key: 'showByproductNodes', label: 'Byproduct nodes', description: 'Show unused output sink nodes' },
            ] as const
          ).map(({ key, label, description }) => {
            const checked = planState.graphOptions[key];
            return (
              <div key={key} className="flex items-center justify-between gap-3">
                <div className="flex flex-col min-w-0">
                  <span className="text-base text-[#e8e8f0]">{label}</span>
                  <span className="text-xs text-[#8888a0] mt-0.5">{description}</span>
                </div>
                <button
                  onClick={() => dispatch({ type: 'SET_GRAPH_OPTION', key, value: !checked })}
                  className={[
                    'relative w-10 h-5 rounded-full transition-colors flex-shrink-0',
                    checked ? 'bg-[#e8820c]' : 'bg-[#3a3a46]',
                  ].join(' ')}
                  title={`${checked ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
                >
                  <span
                    className={[
                      'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                      checked ? 'translate-x-5' : '',
                    ].join(' ')}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Mode toggle + Compute */}
      <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-4 flex flex-col gap-3">
        {/* Solver / Manual toggle */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[#e8e8f0] text-sm font-semibold">
              {solverMode === 'solver' ? 'Solver mode' : 'Manual mode'}
            </span>
            <span className="text-[#8888a0] text-xs mt-0.5">
              {solverMode === 'solver'
                ? 'LP solver computes optimal machine counts'
                : 'Manually adjust machine counts in the graph'}
            </span>
          </div>
          <button
            onClick={() =>
              dispatch({
                type: 'SET_SOLVER_MODE',
                mode: solverMode === 'solver' ? 'manual' : 'solver',
              })
            }
            className={[
              'relative w-10 h-5 rounded-full transition-colors flex-shrink-0',
              solverMode === 'manual' ? 'bg-[#e8820c]' : 'bg-[#3a3a46]',
            ].join(' ')}
            title={`Switch to ${solverMode === 'solver' ? 'manual' : 'solver'} mode`}
          >
            <span
              className={[
                'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                solverMode === 'manual' ? 'translate-x-5' : '',
              ].join(' ')}
            />
          </button>
        </div>

        {/* Compute button — always visible */}
        <button
          onClick={onCompute}
          disabled={isSolving || targets.length === 0}
          className={[
            'w-full py-2.5 rounded-md font-semibold text-base transition-colors flex items-center justify-center gap-2',
            targets.length === 0
              ? 'bg-[#2e2e38] text-[#8888a0] cursor-not-allowed'
              : isSolving
                ? 'bg-[#e8820c]/60 text-white cursor-wait'
                : 'bg-[#e8820c] hover:bg-[#c4690a] text-white',
          ].join(' ')}
        >
          {isSolving ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Solving…
            </>
          ) : solverMode === 'manual' ? (
            'Re-run Solver'
          ) : (
            'Compute'
          )}
        </button>
      </section>
    </div>
  );
}
