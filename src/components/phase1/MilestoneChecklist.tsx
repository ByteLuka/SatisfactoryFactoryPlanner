import type { GameData, Schematic } from '../../types/domain';
import { PROJECT_PHASE_MAX_TIER } from '../../types/domain';
import { useGameState } from '../../hooks/useGameState';

interface Props {
  gameData: GameData;
}

interface TierSectionProps {
  tier: number;
  milestones: Schematic[];
}

function TierSection({ tier, milestones }: TierSectionProps) {
  const { gameState, isMilestoneUnlocked, dispatch } = useGameState();

  const classNames = milestones.map(m => m.className);
  const allChecked = classNames.every(cn => isMilestoneUnlocked(cn));
  const someChecked = classNames.some(cn => isMilestoneUnlocked(cn));

  function handleToggleTier() {
    dispatch({
      type: 'SET_ALL_MILESTONES_FOR_TIER',
      tier,
      classNames,
      checked: !allChecked,
    });
  }

  return (
    <div className="border border-[#3a3a46] rounded-md overflow-hidden">
      <div className="bg-[#2e2e38] px-4 py-2.5 flex items-center justify-between">
        <span className="text-[#e8e8f0] text-sm font-semibold">Tier {tier}</span>
        <button
          onClick={handleToggleTier}
          className="text-xs text-[#8888a0] hover:text-[#e8820c] transition-colors"
        >
          {allChecked ? 'Uncheck all' : 'Check all'}
        </button>
      </div>

      <div className="divide-y divide-[#3a3a46]">
        {milestones.map(milestone => {
          const checked = isMilestoneUnlocked(milestone.className);
          return (
            <label
              key={milestone.className}
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#2e2e38]/60 transition-colors"
            >
              <input
                type="checkbox"
                checked={checked}
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

export function MilestoneChecklist({ gameData }: Props) {
  const { gameState } = useGameState();
  const maxTier = PROJECT_PHASE_MAX_TIER[gameState.projectPhase];

  const availableTiers = Object.keys(gameData.milestonesByTier)
    .map(Number)
    .filter(tier => tier <= maxTier)
    .sort((a, b) => a - b);

  const totalCount = availableTiers.reduce(
    (sum, tier) => sum + (gameData.milestonesByTier[tier]?.length ?? 0),
    0,
  );
  const unlockedCount = gameState.unlockedMilestones.filter(cn =>
    availableTiers.some(tier => gameData.milestonesByTier[tier]?.some(m => m.className === cn)),
  ).length;

  return (
    <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[#e8e8f0] text-lg font-semibold">HUB Milestones</h2>
        <span className="text-[#8888a0] text-sm">
          {unlockedCount} / {totalCount}
        </span>
      </div>
      <p className="text-[#8888a0] text-sm mb-4">
        Check each milestone you have completed at the HUB terminal. Only milestones available in
        your selected phase are shown.
      </p>

      <div className="flex flex-col gap-3">
        {availableTiers.map(tier => (
          <TierSection
            key={tier}
            tier={tier}
            milestones={gameData.milestonesByTier[tier] ?? []}
          />
        ))}
      </div>
    </section>
  );
}
