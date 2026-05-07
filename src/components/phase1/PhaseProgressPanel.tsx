import { useState } from 'react';
import type { GameData, Schematic } from '../../types/domain';
import { PROJECT_PHASE_MAX_TIER, PROJECT_PHASE_LABELS } from '../../types/domain';
import { ProjectPhase } from '../../types/game-state';
import { useGameState } from '../../hooks/useGameState';
import { CircularProgress } from './CircularProgress';

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

function TierSection({
  tier,
  milestones,
  disabled,
}: {
  tier: number;
  milestones: Schematic[];
  disabled: boolean;
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
        <span className={`flex-1 text-sm font-semibold ${disabled ? 'text-[#555560]' : 'text-[#e8e8f0]'}`}>
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
          return (
            <label
              key={milestone.className}
              className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                disabled
                  ? 'opacity-40 cursor-not-allowed'
                  : 'cursor-pointer hover:bg-[#2e2e38]/60'
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
              <span className={`text-sm ${checked ? 'text-[#e8e8f0]' : 'text-[#8888a0]'}`}>
                {milestone.name}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function PhaseRow({ phase, gameData }: { phase: ProjectPhase; gameData: GameData }) {
  const [expanded, setExpanded] = useState(false);
  const { gameState, isMilestoneUnlocked, dispatch } = useGameState();

  const isCompleted = gameState.projectPhase >= phase;
  const tiers = getTiersForPhase(phase);
  const hasExpandableTiers = tiers.length > 0;

  const allClassNames = tiers.flatMap(t =>
    (gameData.milestonesByTier[t] ?? []).map(m => m.className),
  );
  const checkedCount = allClassNames.filter(cn => isMilestoneUnlocked(cn)).length;
  const totalCount = allClassNames.length;
  const allChecked = totalCount > 0 && checkedCount === totalCount;

  function handleProgressClick(e: React.MouseEvent) {
    e.stopPropagation();
    for (const tier of tiers) {
      const classNames = (gameData.milestonesByTier[tier] ?? []).map(m => m.className);
      dispatch({ type: 'SET_ALL_MILESTONES_FOR_TIER', tier, classNames, checked: !allChecked });
    }
  }

  function handleToggleExpand(e: React.MouseEvent) {
    e.stopPropagation();
    setExpanded(prev => !prev);
  }

  return (
    <div
      className={[
        'border rounded-lg overflow-hidden transition-colors',
        isCompleted ? 'border-[#e8820c]/40' : 'border-[#3a3a46]',
      ].join(' ')}
    >
      <div
        onClick={() => dispatch({ type: 'SET_PROJECT_PHASE', phase })}
        className={[
          'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors select-none',
          isCompleted
            ? 'bg-[#e8820c]/10 hover:bg-[#e8820c]/15'
            : 'bg-[#2e2e38] hover:bg-[#3a3a46]/50',
        ].join(' ')}
      >
        {/* Completion dot */}
        <span
          className={[
            'w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
            isCompleted ? 'border-[#e8820c]' : 'border-[#3a3a46]',
          ].join(' ')}
        >
          {isCompleted && <span className="w-2.5 h-2.5 rounded-full bg-[#e8820c]" />}
        </span>

        {/* Expand chevron */}
        {hasExpandableTiers ? (
          <button
            onClick={handleToggleExpand}
            className="flex-shrink-0 text-[#8888a0] hover:text-[#e8e8f0] transition-colors"
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
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Phase label */}
        <span
          className={[
            'flex-1 text-sm font-medium',
            isCompleted ? 'text-[#e8e8f0]' : 'text-[#8888a0]',
          ].join(' ')}
        >
          {PROJECT_PHASE_LABELS[phase]}
        </span>

        {/* Phase-level progress circle */}
        {hasExpandableTiers && totalCount > 0 && (
          <CircularProgress
            value={checkedCount}
            total={totalCount}
            onClick={handleProgressClick}
            title={allChecked ? 'Uncheck all milestones in this phase' : 'Check all milestones in this phase'}
          />
        )}
      </div>

      {expanded && hasExpandableTiers && (
        <div className="px-4 pb-4 pt-3 flex flex-col gap-3 bg-[#1a1a1f]/40">
          {tiers.map(tier => (
            <TierSection
              key={tier}
              tier={tier}
              milestones={gameData.milestonesByTier[tier] ?? []}
              disabled={!isCompleted}
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

  function handleToggleAll(e: React.MouseEvent) {
    e.stopPropagation();
    for (const [tierStr, milestones] of Object.entries(gameData.milestonesByTier)) {
      const tier = Number(tierStr);
      const classNames = milestones.map(m => m.className);
      dispatch({ type: 'SET_ALL_MILESTONES_FOR_TIER', tier, classNames, checked: !allChecked });
    }
  }

  return (
    <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[#e8e8f0] text-lg font-semibold">Space Elevator & HUB Milestones</h2>
        <CircularProgress value={unlockedCount} total={totalMilestones} onClick={handleToggleAll} />
      </div>
      <p className="text-[#8888a0] text-sm mb-4">
        Click a phase to mark it as your highest completed Space Elevator phase. Expand to check
        individual HUB milestones — use the circle to toggle all at once.
      </p>

      <div className="flex flex-col gap-2">
        {PHASES.map(phase => (
          <PhaseRow key={phase} phase={phase} gameData={gameData} />
        ))}
      </div>
    </section>
  );
}
