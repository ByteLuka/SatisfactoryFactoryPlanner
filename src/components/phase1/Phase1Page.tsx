import { useNavigate } from 'react-router-dom';
import { useGameData } from '../../hooks/useGameData';
import { useGameState } from '../../hooks/useGameState';
import { LoadingSpinner } from '../LoadingSpinner';
import { AppHeader } from '../AppHeader';
import { PhaseProgressPanel } from './PhaseProgressPanel';
import { MamResearchTree } from './MamResearchTree';
import { HardDriveSelector } from './HardDriveSelector';
import type { GameData } from '../../types/domain';

function Phase1PageInner({ gameData }: { gameData: GameData }) {
  const navigate = useNavigate();
  const { dispatch } = useGameState();

  function handleUnlockAll() {
    const milestoneClassNames = Object.values(gameData.milestonesByTier).flat().map(m => m.className);
    const mamClassNames = gameData.mamTrees.flatMap(t => t.nodes.map(n => n.className));
    const alternateClassNames = gameData.alternates.map(a => a.className);
    dispatch({ type: 'UNLOCK_ALL', milestoneClassNames, mamClassNames, alternateClassNames });
  }

  return (
    <div className="min-h-screen bg-[#1a1a1f] text-[#e8e8f0] flex flex-col">
      <AppHeader step={1} subtitle="Step 1 of 3 — Game State" backTo="/" backLabel="Home" />

      {/* Content */}
      <main className="max-w-5xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[#e8e8f0] text-3xl font-bold mb-1">What's your game progress?</h2>
            <p className="text-[#8888a0] text-base">
              Tell us where you are in the game so the planner can show only what's available to you.
            </p>
          </div>
          <button
            onClick={handleUnlockAll}
            className="flex-shrink-0 bg-[#2e2e38] hover:bg-[#3a3a46] border border-[#3a3a46] hover:border-[#e8820c]/50 text-[#8888a0] hover:text-[#e8e8f0] text-sm font-medium px-3 py-2 rounded-md transition-colors whitespace-nowrap"
            title="Set Phase 5 and check all milestones, MAM research, and alternate recipes"
          >
            Unlock everything
          </button>
        </div>

        <PhaseProgressPanel gameData={gameData} />
        <MamResearchTree gameData={gameData} />
        <HardDriveSelector gameData={gameData} />

        <div className="flex justify-end pb-8">
          <button
            onClick={() => navigate('/phase2')}
            className="bg-[#e8820c] hover:bg-[#c4690a] text-white font-semibold px-6 py-3 rounded-md transition-colors text-sm"
          >
            Continue to Production Targets →
          </button>
        </div>
      </main>
    </div>
  );
}

export function Phase1Page() {
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

  return <Phase1PageInner gameData={loadState.data} />;
}
