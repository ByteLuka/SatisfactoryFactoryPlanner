import { useState } from 'react';
import type { GameData, Schematic } from '../../types/domain';
import { useGameState } from '../../hooks/useGameState';

interface Props {
  gameData: GameData;
}

export function HardDriveSelector({ gameData }: Props) {
  const [search, setSearch] = useState('');
  const { gameState, isAlternateUnlocked, dispatch } = useGameState();

  const filtered = search.trim()
    ? gameData.alternates.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()),
      )
    : gameData.alternates;

  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));

  const unlockedCount = gameState.unlockedAlternates.length;
  const totalCount = gameData.alternates.length;

  return (
    <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[#e8e8f0] text-lg font-semibold">Alternate Recipes</h2>
        <span className="text-[#8888a0] text-sm">
          {unlockedCount} / {totalCount}
        </span>
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
        {sorted.length === 0 ? (
          <p className="text-[#8888a0] text-sm px-4 py-6 text-center">No alternates match your search.</p>
        ) : (
          <div className="divide-y divide-[#3a3a46]">
            {sorted.map(alt => {
              const unlocked = isAlternateUnlocked(alt.className);
              return (
                <label
                  key={alt.className}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#2e2e38]/60 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={unlocked}
                    onChange={() =>
                      dispatch({ type: 'TOGGLE_ALTERNATE', className: alt.className })
                    }
                    className="w-4 h-4 rounded border-[#3a3a46] bg-[#25252d] accent-[#e8820c] cursor-pointer flex-shrink-0"
                  />
                  <span className={`text-sm ${unlocked ? 'text-[#e8e8f0]' : 'text-[#8888a0]'}`}>
                    {alt.name}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
