import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import { useGameData } from '../hooks/useGameData';
import { useAvailableRecipes } from '../hooks/useAvailableRecipes';
import { useSolver } from '../hooks/useSolver';
import { usePlanContext } from '../store/PlanContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { TargetInputPanel } from '../components/phase2/TargetInputPanel';
import { ProductionGraph } from '../components/phase2/ProductionGraph';
import { RecipeListPanel } from '../components/phase2/RecipeListPanel';
import type { GameData } from '../types/domain';
import { OptimizationStrategy } from '../types/plan';

function Phase2PageInner({ gameData }: { gameData: GameData }) {
  const navigate = useNavigate();
  const { planState, dispatch } = usePlanContext();
  const { solve, status: solverStatus, result } = useSolver();
  const { recipes: availableRecipes, producibleItems } = useAvailableRecipes(gameData);

  useEffect(() => {
    if (result) {
      dispatch({ type: 'SET_SOLVER_RESULT', result });
    }
  }, [result, dispatch]);

  const disabledSet = useMemo(() => new Set(planState.disabledRecipes), [planState.disabledRecipes]);
  const enabledRecipes = useMemo(
    () => availableRecipes.filter(r => !disabledSet.has(r.className)),
    [availableRecipes, disabledSet],
  );

  const activeRecipeClassNames = useMemo<Set<string>>(
    () => new Set(planState.solverResult?.plan?.nodes.map(n => n.recipeClassName) ?? []),
    [planState.solverResult],
  );

  const anyUnratedTarget = planState.targets.some(t => t.ratePerMin === undefined);
  const effectiveStrategy = anyUnratedTarget
    ? OptimizationStrategy.MAX_OUTPUT
    : planState.strategy;

  function handleCompute() {
    solve({
      targets: planState.targets,
      availableRecipes: enabledRecipes,
      resourcePool: planState.resourcePool,
      strategy: effectiveStrategy,
      manualInputs: planState.manualInputs,
    });
  }

  const activePlan =
    planState.solverResult?.status === 'optimal' ? planState.solverResult.plan : undefined;

  const errorMessage =
    planState.solverResult && planState.solverResult.status !== 'optimal'
      ? planState.solverResult.errorMessage
      : undefined;

  return (
    <div className="h-screen overflow-hidden bg-[#1a1a1f] text-[#e8e8f0] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#3a3a46] bg-[#1a1a1f] sticky top-0 z-20">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="text-[#8888a0] hover:text-[#e8e8f0] text-sm transition-colors"
            >
              ← Phase 1
            </button>
            <div>
              <h1 className="text-[#e8820c] font-bold text-lg tracking-wide">
                Satisfactory Factory Planner
              </h1>
              <p className="text-[#8888a0] text-xs mt-0.5">Step 2 of 3 — Production Planner</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {planState.solverMode === 'manual' && (
              <span className="text-xs bg-[#e8820c]/20 text-[#e8820c] border border-[#e8820c]/40 rounded px-2 py-1">
                Manual Mode
              </span>
            )}
            <div className="flex gap-1">
              {[1, 2, 3].map(step => (
                <div
                  key={step}
                  className={`w-2 h-2 rounded-full ${step === 2 ? 'bg-[#e8820c]' : step < 2 ? 'bg-[#e8820c]/40' : 'bg-[#3a3a46]'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main content: sidebar + graph */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <aside className="w-80 flex-shrink-0 border-r border-[#3a3a46] overflow-y-auto p-4 flex flex-col gap-4">
          <TargetInputPanel
            planState={planState}
            dispatch={dispatch}
            producibleItems={producibleItems}
            onCompute={handleCompute}
            solverStatus={solverStatus}
          />

          {/* Plan summary */}
          {activePlan && (
            <div className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-4">
              <h3 className="text-[#e8e8f0] font-semibold text-sm mb-3">Plan Summary</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[#8888a0]">Total machines</span>
                  <span className="text-[#e8e8f0] font-mono">{activePlan.totalMachineCount}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#8888a0]">Distinct recipes</span>
                  <span className="text-[#e8e8f0] font-mono">{activePlan.nodes.length}</span>
                </div>
                {Object.keys(activePlan.resourceUsage).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#3a3a46]">
                    <p className="text-[#8888a0] text-xs font-semibold mb-2">Resource usage</p>
                    {Object.entries(activePlan.resourceUsage).map(([cn, rate]) => {
                      const item = gameData.items[cn];
                      const name = item?.name ?? cn.replace('Desc_', '').replace('_C', '');
                      const unit = item?.liquid ? ' m³/min' : '/min';
                      return (
                        <div key={cn} className="flex justify-between text-xs mb-1">
                          <span className="text-[#8888a0] truncate flex-1">{name}</span>
                          <span className="text-[#e8e8f0] font-mono ml-2">
                            {rate.toFixed(1)}{unit}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recipe toggles */}
          <RecipeListPanel
            availableRecipes={availableRecipes}
            disabledRecipes={planState.disabledRecipes}
            activeRecipeClassNames={activeRecipeClassNames}
            gameData={gameData}
            dispatch={dispatch}
          />
        </aside>

        {/* Graph area */}
        <main className="flex-1 relative min-h-0 h-full">
          {/* Error overlay */}
          {errorMessage && (
            <div className="absolute inset-x-4 top-4 z-10 bg-red-950/80 border border-red-700 rounded-lg p-4 shadow-xl">
              <p className="text-red-400 font-semibold text-sm mb-1">Plan Failed</p>
              <pre className="text-red-300/80 text-xs whitespace-pre-wrap">{errorMessage}</pre>
            </div>
          )}

          {/* Solving overlay */}
          {solverStatus === 'solving' && (
            <div className="absolute inset-0 z-10 bg-[#1a1a1f]/60 flex items-center justify-center">
              <div className="bg-[#25252d] border border-[#3a3a46] rounded-lg px-6 py-4 flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-[#e8820c]/30 border-t-[#e8820c] rounded-full animate-spin" />
                <span className="text-[#e8e8f0] text-sm">Solving production plan…</span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!activePlan && solverStatus === 'idle' && !errorMessage && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-sm">
                <div className="text-6xl mb-4 opacity-20">⬡</div>
                <p className="text-[#8888a0] text-sm">
                  {planState.targets.length === 0
                    ? 'Add production targets on the left, then click Compute.'
                    : 'Click Compute to generate the production plan.'}
                </p>
              </div>
            </div>
          )}

          {/* Graph */}
          {activePlan && (
            <ProductionGraph
              plan={activePlan}
              targets={planState.targets}
              gameData={gameData}
              manualMachineCounts={planState.manualMachineCounts}
              isManualMode={planState.solverMode === 'manual'}
              layoutVersion={planState.layoutVersion}
              dispatch={dispatch}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export function Phase2Page() {
  const loadState = useGameData();

  if (loadState.status === 'loading') return <LoadingSpinner message="Loading game data…" />;

  if (loadState.status === 'error') {
    return (
      <div className="min-h-screen bg-[#1a1a1f] flex items-center justify-center p-8">
        <div className="bg-red-950/50 border border-red-800 rounded-lg p-6 max-w-lg w-full">
          <h2 className="text-red-400 text-lg font-semibold mb-2">Failed to load game data</h2>
          <p className="text-red-300/80 text-sm font-mono">{loadState.error.message}</p>
        </div>
      </div>
    );
  }

  return <Phase2PageInner gameData={loadState.data} />;
}
