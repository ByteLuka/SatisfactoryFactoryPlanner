import { useNavigate } from 'react-router-dom';
import { useGameState } from '../hooks/useGameState';

export function Phase2Placeholder() {
  const navigate = useNavigate();
  const { gameState } = useGameState();

  return (
    <div className="min-h-screen bg-[#1a1a1f] text-[#e8e8f0]">
      <header className="border-b border-[#3a3a46] bg-[#1a1a1f] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-[#e8820c] font-bold text-lg tracking-wide">
              Satisfactory Factory Planner
            </h1>
            <p className="text-[#8888a0] text-xs mt-0.5">Step 2 of 3 — Production Targets</p>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3].map(step => (
              <div
                key={step}
                className={`w-2 h-2 rounded-full ${step === 2 ? 'bg-[#e8820c]' : step < 2 ? 'bg-[#e8820c]/40' : 'bg-[#3a3a46]'}`}
              />
            ))}
          </div>
        </div>
      </header>

      {/* TODO Phase 2: implement production target input and solver logic */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-8 text-center">
          <h2 className="text-[#e8e8f0] text-xl font-semibold mb-2">Coming soon</h2>
          <p className="text-[#8888a0] text-sm mb-6">
            Phase 2 will let you specify production targets and solve the optimal factory layout
            using the recipes and buildings unlocked in your current game state.
          </p>

          <div className="bg-[#2e2e38] rounded-md p-4 text-left mb-6 text-xs font-mono text-[#8888a0]">
            <p className="mb-1 text-[#e8820c]">// Game state from Phase 1:</p>
            <p>phase: {gameState.projectPhase}</p>
            <p>milestones: {gameState.unlockedMilestones.length} unlocked</p>
            <p>mam research: {gameState.completedMamResearch.length} completed</p>
            <p>alternates: {gameState.unlockedAlternates.length} unlocked</p>
          </div>

          <button
            onClick={() => navigate('/')}
            className="text-[#8888a0] hover:text-[#e8e8f0] text-sm transition-colors"
          >
            ← Back to Game State
          </button>
        </div>
      </main>
    </div>
  );
}
