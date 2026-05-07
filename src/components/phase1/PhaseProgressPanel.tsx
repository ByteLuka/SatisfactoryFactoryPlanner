import { useMemo, useState } from 'react';
import type { GameData, Recipe, Schematic } from '../../types/domain';
import {
  PROJECT_PHASE_MAX_TIER,
  PROJECT_PHASE_LABELS,
  SCHEMATIC_TYPE,
} from '../../types/domain';
import { ProjectPhase } from '../../types/game-state';
import { useGameState } from '../../hooks/useGameState';
import { CircularProgress } from './CircularProgress';
import { SegmentedProgressBar } from './SegmentedProgressBar';

const PHASES = [
  ProjectPhase.Phase1,
  ProjectPhase.Phase2,
  ProjectPhase.Phase3,
  ProjectPhase.Phase4,
  ProjectPhase.Phase5,
] as const;

function getTiersForPhase(phase: number): number[] {
  const maxTier = PROJECT_PHASE_MAX_TIER[phase] ?? 0;
  const prevMaxTier = PROJECT_PHASE_MAX_TIER[phase - 1] ?? 0;
  const tiers: number[] = [];
  for (let t = prevMaxTier + 1; t <= maxTier; t++) tiers.push(t);
  return tiers;
}

function getAvailableRecipeClassNames(
  schematics: Record<string, Schematic>,
  recipes: Record<string, Recipe>,
  unlockedMilestones: string[],
  projectPhase: ProjectPhase,
): Set<string> {
  const available = new Set<string>();
  const unlockedSet = new Set(unlockedMilestones);
  const maxTier = PROJECT_PHASE_MAX_TIER[projectPhase];
  const recipeInSomeSchematic = new Set<string>();

  for (const schematic of Object.values(schematics)) {
    for (const rcn of schematic.unlock.recipeClassNames) {
      recipeInSomeSchematic.add(rcn);
    }

    let isUnlocked = false;
    if (schematic.type === SCHEMATIC_TYPE.MILESTONE && unlockedSet.has(schematic.className)) {
      isUnlocked = true;
    } else if (
      (schematic.type === SCHEMATIC_TYPE.TUTORIAL || schematic.type === SCHEMATIC_TYPE.CUSTOM) &&
      schematic.tier <= maxTier
    ) {
      isUnlocked = true;
    }

    if (isUnlocked) {
      for (const rcn of schematic.unlock.recipeClassNames) {
        available.add(rcn);
      }
    }
  }

  // Recipes not in any schematic unlock are always available (game defaults)
  for (const rcn of Object.keys(recipes)) {
    if (!recipeInSomeSchematic.has(rcn)) {
      available.add(rcn);
    }
  }

  return available;
}

function computeAccessibleItems(
  recipes: Record<string, Recipe>,
  availableRecipeClassNames: Set<string>,
): Set<string> {
  // Items produced by at least one machine/hand recipe
  const allManufacturedItems = new Set<string>();
  for (const recipe of Object.values(recipes)) {
    if (recipe.inMachine || recipe.inHand) {
      for (const product of recipe.products) {
        allManufacturedItems.add(product.itemClassName);
      }
    }
  }

  // Seed with raw resources: items that appear in recipes but are never manufactured
  const accessible = new Set<string>();
  for (const recipe of Object.values(recipes)) {
    for (const ing of recipe.ingredients) {
      if (!allManufacturedItems.has(ing.itemClassName)) accessible.add(ing.itemClassName);
    }
    for (const prod of recipe.products) {
      if (!allManufacturedItems.has(prod.itemClassName)) accessible.add(prod.itemClassName);
    }
  }

  // BFS: add items whose production recipe is available and all ingredients are accessible
  let changed = true;
  while (changed) {
    changed = false;
    for (const recipe of Object.values(recipes)) {
      if (!(recipe.inMachine || recipe.inHand)) continue;
      if (!availableRecipeClassNames.has(recipe.className)) continue;
      if (!recipe.ingredients.every(ing => accessible.has(ing.itemClassName))) continue;
      for (const product of recipe.products) {
        if (!accessible.has(product.itemClassName)) {
          accessible.add(product.itemClassName);
          changed = true;
        }
      }
    }
  }

  return accessible;
}

function TierSection({
  tier,
  milestones,
  disabled,
  accessibleItems,
  items,
}: {
  tier: number;
  milestones: Schematic[];
  disabled: boolean;
  accessibleItems: Set<string>;
  items: GameData['items'];
}) {
  const { isMilestoneUnlocked, dispatch } = useGameState();

  const classNames = milestones.map(m => m.className);
  const checkedCount = classNames.filter(cn => isMilestoneUnlocked(cn)).length;
  const allChecked = checkedCount === classNames.length;

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    dispatch({ type: 'SET_ALL_MILESTONES_FOR_TIER', tier, classNames, checked: !allChecked });
  }

  return (
    <div className="border border-[#3a3a46] rounded-md overflow-hidden">
      <div className="bg-[#2e2e38] px-4 py-2 flex items-center gap-3">
        <span
          className={`flex-1 text-sm font-semibold ${disabled ? 'text-[#555560]' : 'text-[#e8e8f0]'}`}
        >
          Tier {tier}
        </span>
        {!disabled && (
          <CircularProgress
            value={checkedCount}
            total={classNames.length}
            onClick={handleToggle}
          />
        )}
      </div>

      <div className="divide-y divide-[#3a3a46]">
        {milestones.map(milestone => {
          const checked = isMilestoneUnlocked(milestone.className);
          const missingItems = disabled
            ? []
            : milestone.cost
                .filter(c => !accessibleItems.has(c.itemClassName))
                .map(c => items[c.itemClassName]?.name ?? c.itemClassName);
          const isLocked = !disabled && !checked && missingItems.length > 0;

          return (
            <label
              key={milestone.className}
              title={isLocked ? `Missing: ${missingItems.join(', ')}` : undefined}
              className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-[#2e2e38]/60'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() =>
                  dispatch({ type: 'TOGGLE_MILESTONE', className: milestone.className })
                }
                className="w-4 h-4 rounded border-[#3a3a46] bg-[#25252d] accent-[#e8820c] cursor-pointer"
              />
              <span
                className={`flex-1 text-sm ${
                  disabled ? 'text-[#555560]' : checked ? 'text-[#e8e8f0]' : 'text-[#8888a0]'
                }`}
              >
                {milestone.name}
              </span>
              {isLocked && (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="flex-shrink-0 text-[#8888a0]"
                  aria-hidden="true"
                >
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                </svg>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function PhaseRow({
  phase,
  gameData,
  accessibleItems,
}: {
  phase: ProjectPhase;
  gameData: GameData;
  accessibleItems: Set<string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const { gameState, isMilestoneUnlocked, dispatch } = useGameState();

  const isActive = gameState.projectPhase >= phase;
  const tiers = getTiersForPhase(phase);
  const hasExpandableTiers = tiers.length > 0;

  const allClassNames = tiers.flatMap(t =>
    (gameData.milestonesByTier[t] ?? []).map(m => m.className),
  );
  const checkedCount = allClassNames.filter(cn => isMilestoneUnlocked(cn)).length;
  const totalCount = allClassNames.length;
  const allChecked = totalCount > 0 && checkedCount === totalCount;

  function handleRowClick() {
    if (hasExpandableTiers) setExpanded(prev => !prev);
  }

  function handleDotClick(e: React.MouseEvent) {
    e.stopPropagation();
    dispatch({ type: 'SET_PROJECT_PHASE', phase });
    const maxTier = PROJECT_PHASE_MAX_TIER[phase];
    for (const [tierStr, milestones] of Object.entries(gameData.milestonesByTier)) {
      const tier = Number(tierStr);
      if (tier > maxTier) {
        dispatch({
          type: 'SET_ALL_MILESTONES_FOR_TIER',
          tier,
          classNames: milestones.map(m => m.className),
          checked: false,
        });
      }
    }
  }

  function handleChevronClick(e: React.MouseEvent) {
    e.stopPropagation();
    setExpanded(prev => !prev);
  }

  function handleBarClick(e: React.MouseEvent) {
    e.stopPropagation();
    for (const tier of tiers) {
      const classNames = (gameData.milestonesByTier[tier] ?? []).map(m => m.className);
      dispatch({ type: 'SET_ALL_MILESTONES_FOR_TIER', tier, classNames, checked: !allChecked });
    }
  }

  return (
    <div
      className={[
        'border rounded-lg overflow-hidden transition-colors',
        isActive ? 'border-[#e8820c]/40' : 'border-[#3a3a46]',
      ].join(' ')}
    >
      <div
        onClick={handleRowClick}
        className={[
          'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors select-none',
          isActive
            ? 'bg-[#e8820c]/10 hover:bg-[#e8820c]/15'
            : 'bg-[#2e2e38] hover:bg-[#3a3a46]/50',
        ].join(' ')}
      >
        {/* Phase activation dot — click to set/change project phase */}
        <button
          onClick={handleDotClick}
          title={isActive ? 'Phase active' : 'Set as current phase'}
          className={[
            'w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
            'transition-colors hover:border-[#e8820c]',
            isActive ? 'border-[#e8820c]' : 'border-[#3a3a46]',
          ].join(' ')}
        >
          {isActive && <span className="w-2.5 h-2.5 rounded-full bg-[#e8820c]" />}
        </button>

        {/* Phase label */}
        <span
          className={[
            'flex-1 text-sm font-medium',
            isActive ? 'text-[#e8e8f0]' : 'text-[#8888a0]',
          ].join(' ')}
        >
          {PROJECT_PHASE_LABELS[phase]}
        </span>

        {/* Segmented milestone progress bar — click to toggle all */}
        {totalCount > 0 && (
          <div
            onClick={handleBarClick}
            className="flex-shrink-0 w-24 cursor-pointer py-1"
            title={allChecked ? 'Uncheck all milestones' : 'Check all milestones'}
            role="button"
            aria-label={allChecked ? 'Uncheck all milestones' : 'Check all milestones'}
          >
            <SegmentedProgressBar value={checkedCount} total={totalCount} />
          </div>
        )}

        {/* Expand chevron */}
        {hasExpandableTiers && (
          <button
            onClick={handleChevronClick}
            className="flex-shrink-0 text-[#8888a0] hover:text-[#e8e8f0] transition-colors p-0.5 -mr-0.5"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            >
              <path
                d="M6 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {expanded && hasExpandableTiers && (
        <div className="px-4 pb-4 pt-3 flex flex-col gap-3 bg-[#1a1a1f]/40">
          {tiers.map(tier => (
            <TierSection
              key={tier}
              tier={tier}
              milestones={gameData.milestonesByTier[tier] ?? []}
              disabled={!isActive}
              accessibleItems={accessibleItems}
              items={gameData.items}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PhaseProgressPanel({ gameData }: { gameData: GameData }) {
  const { gameState, dispatch } = useGameState();

  const totalMilestones = Object.values(gameData.milestonesByTier).reduce(
    (sum, ms) => sum + ms.length,
    0,
  );
  const unlockedCount = gameState.unlockedMilestones.length;
  const allChecked = unlockedCount === totalMilestones;

  const accessibleItems = useMemo(() => {
    const availableRecipes = getAvailableRecipeClassNames(
      gameData.schematics,
      gameData.recipes,
      gameState.unlockedMilestones,
      gameState.projectPhase,
    );
    return computeAccessibleItems(gameData.recipes, availableRecipes);
  }, [gameData, gameState.unlockedMilestones, gameState.projectPhase]);

  function handleToggleAll(e: React.MouseEvent) {
    e.stopPropagation();
    const targetChecked = !allChecked;
    for (const [tierStr, milestones] of Object.entries(gameData.milestonesByTier)) {
      const tier = Number(tierStr);
      const classNames = milestones.map(m => m.className);
      dispatch({ type: 'SET_ALL_MILESTONES_FOR_TIER', tier, classNames, checked: targetChecked });
    }
    dispatch({
      type: 'SET_PROJECT_PHASE',
      phase: targetChecked ? ProjectPhase.Phase5 : ProjectPhase.Phase1,
    });
  }

  return (
    <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[#e8e8f0] text-lg font-semibold">Space Elevator & HUB Milestones</h2>
        <CircularProgress value={unlockedCount} total={totalMilestones} onClick={handleToggleAll} />
      </div>
      <p className="text-[#8888a0] text-sm mb-4">
        Click a phase to set it as active and expand its tiers. Click the milestone bar to toggle
        all. A lock icon means the milestone's materials aren't yet producible.
      </p>

      <div className="flex flex-col gap-2">
        {PHASES.map(phase => (
          <PhaseRow key={phase} phase={phase} gameData={gameData} accessibleItems={accessibleItems} />
        ))}
      </div>
    </section>
  );
}
