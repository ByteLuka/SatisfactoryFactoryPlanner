import { useMemo, useState } from 'react';
import type { GameData } from '../../types/domain';
import { useGameState } from '../../hooks/useGameState';
import { CircularProgress } from './CircularProgress';
import {
  buildAccessibleItemSet,
  buildItemsRequiringAccessibilityCheck,
  buildUnlockedBuildingSet,
  getIneligibilityReasons,
  isAlternateEligible,
} from '../../utils/alternateEligibility';

interface Props {
  gameData: GameData;
}

export function HardDriveSelector({ gameData }: Props) {
  const [search, setSearch] = useState('');
  const { gameState, isAlternateUnlocked, dispatch } = useGameState();

  const itemsRequiringCheck = useMemo(
    () => buildItemsRequiringAccessibilityCheck(gameData),
    [gameData],
  );

  const accessibleItems = useMemo(
    () => buildAccessibleItemSet(gameState, gameData),
    [gameState, gameData],
  );

  const unlockedBuildings = useMemo(
    () => buildUnlockedBuildingSet(gameState, gameData),
    [gameState, gameData],
  );

  const eligibleAlts = useMemo(
    () =>
      gameData.alternates.filter(a =>
        isAlternateEligible(a, gameState, gameData, accessibleItems, itemsRequiringCheck, unlockedBuildings),
      ),
    [gameData, gameState, accessibleItems, itemsRequiringCheck, unlockedBuildings],
  );

  const eligibleCount = eligibleAlts.length;
  const eligibleUnlockedCount = eligibleAlts.filter(a => isAlternateUnlocked(a.className)).length;

  const displayList = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    const source = searchLower
      ? gameData.alternates.filter(a => a.name.toLowerCase().includes(searchLower))
      : gameData.alternates;

    return [...source]
      .map(alt => ({
        alt,
        eligible: isAlternateEligible(alt, gameState, gameData, accessibleItems, itemsRequiringCheck, unlockedBuildings),
      }))
      .sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        return a.alt.name.localeCompare(b.alt.name);
      });
  }, [search, gameData, gameState, accessibleItems, itemsRequiringCheck, unlockedBuildings]);

  return (
    <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[#e8e8f0] text-lg font-semibold">Alternate Recipes</h2>
        <CircularProgress
          value={eligibleUnlockedCount}
          total={eligibleCount}
          onClick={() => {
            const allEligibleUnlocked = eligibleUnlockedCount === eligibleCount;
            eligibleAlts.forEach(a => {
              const unlocked = isAlternateUnlocked(a.className);
              if (allEligibleUnlocked ? unlocked : !unlocked) {
                dispatch({ type: 'TOGGLE_ALTERNATE', className: a.className });
              }
            });
          }}
        />
      </div>
      <p className="text-[#8888a0] text-sm mb-4">
        Check each alternate recipe you have unlocked via Hard Drives in the AWESOME Shop.
      </p>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search alternates…"
        className="w-full bg-[#2e2e38] border border-[#3a3a46] rounded-md px-3 py-2 text-sm text-[#e8e8f0] placeholder-[#8888a0] focus:outline-none focus:border-[#e8820c]/60 mb-3"
      />

      <div className="border border-[#3a3a46] rounded-md overflow-hidden max-h-96 overflow-y-auto">
        {displayList.length === 0 ? (
          <p className="text-[#8888a0] text-sm px-4 py-6 text-center">No alternates match your search.</p>
        ) : (
          <div className="divide-y divide-[#3a3a46]">
            {displayList.map(({ alt, eligible }) => {
              const unlocked = isAlternateUnlocked(alt.className);
              const reasons = eligible
                ? []
                : getIneligibilityReasons(
                    alt,
                    gameState,
                    gameData,
                    accessibleItems,
                    itemsRequiringCheck,
                    unlockedBuildings,
                  );
              return (
                <label
                  key={alt.className}
                  title={reasons.length > 0 ? reasons.join('\n') : undefined}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    eligible
                      ? 'cursor-pointer hover:bg-[#2e2e38]/60'
                      : 'cursor-not-allowed opacity-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={unlocked && eligible}
                    disabled={!eligible}
                    onChange={() => dispatch({ type: 'TOGGLE_ALTERNATE', className: alt.className })}
                    className="w-4 h-4 rounded border-[#3a3a46] bg-[#25252d] accent-[#e8820c] flex-shrink-0 disabled:cursor-not-allowed"
                  />
                  <span className={`flex-1 text-sm ${unlocked && eligible ? 'text-[#e8e8f0]' : 'text-[#8888a0]'}`}>
                    {alt.name}
                  </span>
                  {!eligible && (
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
        )}
      </div>
    </section>
  );
}
