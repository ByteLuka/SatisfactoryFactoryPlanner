import { useEffect, useMemo } from 'react';
import { useGameData } from '../hooks/useGameData';
import { useAvailableRecipes } from '../hooks/useAvailableRecipes';
import { useSolver } from '../hooks/useSolver';
import { usePlanContext } from '../store/PlanContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { AppHeader } from '../components/AppHeader';
import { TargetInputPanel } from '../components/phase2/TargetInputPanel';
import { ProductionGraph } from '../components/phase2/ProductionGraph';
import { RecipeListPanel } from '../components/phase2/RecipeListPanel';
import type { GameData } from '../types/domain';
import { OptimizationStrategy } from '../types/plan';
import type { RecipePowerCoefficient } from '../types/plan';
import { MAP_RESOURCE_POOL_LIMITS } from '../data/resources';

function Phase2PageInner({ gameData }: { gameData: GameData }) {
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

  const recipePowerCoefficients = useMemo<Record<string, RecipePowerCoefficient>>(() => {
    const coefficients: Record<string, RecipePowerCoefficient> = {};
    for (const recipe of enabledRecipes) {
      const buildingClassName = recipe.producedInClassNames.find(cn => gameData.buildings[cn]);
      const building = buildingClassName ? gameData.buildings[buildingClassName] : undefined;
      if (!building || !Number.isFinite(building.powerConsumption)) continue;
      const basePower = recipe.isVariablePower
        ? (recipe.minPower + recipe.maxPower) / 2
        : building.powerConsumption;
      coefficients[recipe.className] = {
        basePower,
        exponent: building.powerConsumptionExponent,
      };
    }
    return coefficients;
  }, [enabledRecipes, gameData.buildings]);

  function handleCompute() {
    solve({
      targets: planState.targets,
      availableRecipes: enabledRecipes,
      resourcePool: planState.resourcePool.mode === 'map'
          ? { mode: 'map' as const, limits: MAP_RESOURCE_POOL_LIMITS }
          : planState.resourcePool,
      strategy: effectiveStrategy,
      manualInputs: planState.manualInputs,
      recipePowerCoefficients,
    });
  }

  const activePlan =
    planState.solverResult?.status === 'optimal' ? planState.solverResult.plan : undefined;

  const powerStats = useMemo(() => {
    if (!activePlan) return null;

    let minNotUnderclocked = 0;
    let maxNotUnderclocked = 0;
    let minUnderclocked = 0;
    let maxUnderclocked = 0;
    let totalPowerProduced = 0;

    for (const node of activePlan.nodes) {
      const recipe = gameData.recipes[node.recipeClassName];
      if (!recipe) continue;
      const buildingClassName = recipe.producedInClassNames.find(cn => gameData.buildings[cn]);
      const building = buildingClassName ? gameData.buildings[buildingClassName] : undefined;
      if (!building) continue;

      if (!Number.isFinite(building.powerConsumption) || !Number.isFinite(building.powerConsumptionExponent)) continue;

      const exact = planState.manualMachineCounts[node.id] ?? node.machineCount;
      const ceiled = Math.ceil(exact);
      const full = Math.floor(exact);
      const frac = exact - full;
      const exponent = building.powerConsumptionExponent;

      if (building.powerProduction > 0) {
        // Power production scales linearly with clock speed: exact fractional count * MW per machine
        totalPowerProduced += exact * building.powerProduction;
        continue;
      }

      const basePowerMin = recipe.isVariablePower ? recipe.minPower : building.powerConsumption;
      const basePowerMax = recipe.isVariablePower ? recipe.maxPower : building.powerConsumption;

      minNotUnderclocked += ceiled * basePowerMin;
      maxNotUnderclocked += ceiled * basePowerMax;

      const underclockedMin = full * basePowerMin + (frac > 0 ? basePowerMin * Math.pow(frac, exponent) : 0);
      const underclockedMax = full * basePowerMax + (frac > 0 ? basePowerMax * Math.pow(frac, exponent) : 0);
      minUnderclocked += underclockedMin;
      maxUnderclocked += underclockedMax;
    }

    return { minNotUnderclocked, maxNotUnderclocked, minUnderclocked, maxUnderclocked, totalPowerProduced };
  }, [activePlan, gameData, planState.manualMachineCounts]);

  const errorMessage =
    planState.solverResult && planState.solverResult.status !== 'optimal'
      ? planState.solverResult.errorMessage
      : undefined;

  return (
    <div className="h-screen overflow-hidden bg-[#1a1a1f] text-[#e8e8f0] flex flex-col">
      <AppHeader
        step={2}
        subtitle="Step 2 of 3 — Production Planner"
        backTo="/phase1"
        backLabel="Phase 1"
        rightExtra={
          planState.solverMode === 'manual' ? (
            <span className="text-xs bg-[#e8820c]/20 text-[#e8820c] border border-[#e8820c]/40 rounded px-2 py-1">
              Manual Mode
            </span>
          ) : undefined
        }
      />

      {/* Main content: sidebar + graph */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <aside className="w-80 flex-shrink-0 border-r border-[#3a3a46] overflow-y-auto">
          <div className="p-4 flex flex-col gap-4">
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
                <h3 className="text-[#e8e8f0] font-semibold text-base mb-3">Plan Summary</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8888a0]">Total machines</span>
                    <span className="text-[#e8e8f0] font-mono">{activePlan.totalMachineCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8888a0]">Distinct recipes</span>
                    <span className="text-[#e8e8f0] font-mono">{activePlan.nodes.length}</span>
                  </div>
                  {powerStats && (
                    <div className="mt-3 pt-3 border-t border-[#3a3a46]">
                      <p className="text-[#8888a0] text-sm font-semibold mb-2">Power usage</p>
                      <div className="mb-2">
                        <p className="text-[#8888a0] text-sm mb-1">All at 100% clock</p>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-[#8888a0] pl-2">Min</span>
                          <span className="text-[#e8e8f0] font-mono">{powerStats.minNotUnderclocked.toFixed(1)} MW</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-[#8888a0] pl-2">Max</span>
                          <span className="text-[#e8e8f0] font-mono">{powerStats.maxNotUnderclocked.toFixed(1)} MW</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[#8888a0] text-sm mb-1">With underclocking</p>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-[#8888a0] pl-2">Min</span>
                          <span className="text-[#e8e8f0] font-mono">{powerStats.minUnderclocked.toFixed(1)} MW</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-[#8888a0] pl-2">Max</span>
                          <span className="text-[#e8e8f0] font-mono">{powerStats.maxUnderclocked.toFixed(1)} MW</span>
                        </div>
                      </div>
                      {powerStats.totalPowerProduced > 0 && (
                        <div className="mt-3 pt-3 border-t border-[#3a3a46]">
                          <p className="text-[#8888a0] text-sm font-semibold mb-2">Power produced</p>
                          <div className="flex justify-between text-sm">
                            <span className="text-[#8888a0] pl-2">Total</span>
                            <span className="text-[#4ade80] font-mono">{powerStats.totalPowerProduced.toFixed(0)} MW</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {Object.keys(activePlan.resourceUsage).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[#3a3a46]">
                      <p className="text-[#8888a0] text-sm font-semibold mb-2">Resource usage</p>
                      {Object.entries(activePlan.resourceUsage).map(([cn, rate]) => {
                        const item = gameData.items[cn];
                        const name = item?.name ?? cn.replace('Desc_', '').replace('_C', '');
                        const unit = item?.liquid ? ' m³/min' : '/min';
                        return (
                          <div key={cn} className="flex justify-between text-sm mb-1">
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
          </div>
        </aside>

        {/* Graph area */}
        <main className="flex-1 relative min-h-0 h-full">
          {/* Error overlay */}
          {errorMessage && (
            <div className="absolute inset-x-4 top-4 z-10 bg-red-950/80 border border-red-700 rounded-lg p-4 shadow-xl">
              <p className="text-red-400 font-semibold text-base mb-1">Plan Failed</p>
              <pre className="text-red-300/80 text-sm whitespace-pre-wrap">{errorMessage}</pre>
            </div>
          )}

          {/* Solving overlay */}
          {solverStatus === 'solving' && (
            <div className="absolute inset-0 z-10 bg-[#1a1a1f]/60 flex items-center justify-center">
              <div className="bg-[#25252d] border border-[#3a3a46] rounded-lg px-6 py-4 flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-[#e8820c]/30 border-t-[#e8820c] rounded-full animate-spin" />
                <span className="text-[#e8e8f0] text-base">Solving production plan…</span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!activePlan && solverStatus === 'idle' && !errorMessage && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-sm">
                <div className="text-6xl mb-4 opacity-20">⬡</div>
                <p className="text-[#8888a0] text-base">
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
              graphOptions={planState.graphOptions}
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
          <h2 className="text-red-400 text-xl font-semibold mb-2">Failed to load game data</h2>
          <p className="text-red-300/80 text-base font-mono">{loadState.error.message}</p>
        </div>
      </div>
    );
  }

  return <Phase2PageInner gameData={loadState.data} />;
}
