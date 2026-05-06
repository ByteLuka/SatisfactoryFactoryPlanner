import { ProjectPhase } from '../../types/game-state';
import { PROJECT_PHASE_LABELS } from '../../types/domain';
import { useGameState } from '../../hooks/useGameState';

const PHASES = [
  ProjectPhase.Phase1,
  ProjectPhase.Phase2,
  ProjectPhase.Phase3,
  ProjectPhase.Phase4,
  ProjectPhase.Phase5,
] as const;

export function ProjectPhaseSelector() {
  const { gameState, dispatch } = useGameState();

  return (
    <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-6">
      <h2 className="text-[#e8e8f0] text-lg font-semibold mb-1">Space Elevator Phase</h2>
      <p className="text-[#8888a0] text-sm mb-4">
        Select the highest project phase you have completed at the Space Elevator.
      </p>

      <div className="flex flex-col gap-2">
        {PHASES.map(phase => {
          const isSelected = gameState.projectPhase === phase;
          return (
            <button
              key={phase}
              onClick={() => dispatch({ type: 'SET_PROJECT_PHASE', phase })}
              className={[
                'flex items-center gap-3 px-4 py-3 rounded-md border text-left transition-colors',
                isSelected
                  ? 'bg-[#e8820c]/15 border-[#e8820c] text-[#e8e8f0]'
                  : 'bg-[#2e2e38] border-[#3a3a46] text-[#8888a0] hover:border-[#e8820c]/50 hover:text-[#e8e8f0]',
              ].join(' ')}
            >
              <span
                className={[
                  'w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                  isSelected ? 'border-[#e8820c]' : 'border-[#3a3a46]',
                ].join(' ')}
              >
                {isSelected && (
                  <span className="w-2.5 h-2.5 rounded-full bg-[#e8820c]" />
                )}
              </span>
              <span className="text-sm font-medium">{PROJECT_PHASE_LABELS[phase]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
