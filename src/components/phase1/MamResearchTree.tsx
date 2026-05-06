import { useState } from 'react';
import type { GameData, MamTree } from '../../types/domain';
import { useGameState } from '../../hooks/useGameState';

interface Props {
  gameData: GameData;
}

interface TreeSectionProps {
  tree: MamTree;
}

function TreeSection({ tree }: TreeSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const { isMamResearched, dispatch } = useGameState();

  const checkedCount = tree.nodes.filter(n => isMamResearched(n.className)).length;
  const allChecked = checkedCount === tree.nodes.length;

  function handleToggleAll() {
    tree.nodes.forEach(node => {
      const isResearched = isMamResearched(node.className);
      if (allChecked ? isResearched : !isResearched) {
        dispatch({ type: 'TOGGLE_MAM_RESEARCH', className: node.className });
      }
    });
  }

  return (
    <div className="border border-[#3a3a46] rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full bg-[#2e2e38] px-4 py-2.5 flex items-center justify-between hover:bg-[#33333f] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span
            className={`text-[#8888a0] text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
          <span className="text-[#e8e8f0] text-sm font-semibold">{tree.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#8888a0] text-xs">
            {checkedCount}/{tree.nodes.length}
          </span>
          {checkedCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-[#e8820c]" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-[#3a3a46]">
          <div className="px-4 py-2 flex justify-end">
            <button
              onClick={e => { e.stopPropagation(); handleToggleAll(); }}
              className="text-xs text-[#8888a0] hover:text-[#e8820c] transition-colors"
            >
              {allChecked ? 'Uncheck all' : 'Check all'}
            </button>
          </div>
          {tree.nodes.map(node => {
            const researched = isMamResearched(node.className);
            return (
              <label
                key={node.className}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#2e2e38]/60 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={researched}
                  onChange={() =>
                    dispatch({ type: 'TOGGLE_MAM_RESEARCH', className: node.className })
                  }
                  className="w-4 h-4 rounded border-[#3a3a46] bg-[#25252d] accent-[#e8820c] cursor-pointer"
                />
                <span className={`text-sm ${researched ? 'text-[#e8e8f0]' : 'text-[#8888a0]'}`}>
                  {node.name}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MamResearchTree({ gameData }: Props) {
  const { gameState } = useGameState();

  const totalNodes = gameData.mamTrees.reduce((sum, t) => sum + t.nodes.length, 0);
  const researchedCount = gameState.completedMamResearch.length;

  return (
    <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[#e8e8f0] text-lg font-semibold">MAM Research</h2>
        <span className="text-[#8888a0] text-sm">
          {researchedCount} / {totalNodes}
        </span>
      </div>
      <p className="text-[#8888a0] text-sm mb-4">
        Check each research node you have completed in the Molecular Analysis Machine.
        Click a tree name to expand it.
      </p>

      <div className="flex flex-col gap-2">
        {gameData.mamTrees.map(tree => (
          <TreeSection key={tree.id} tree={tree} />
        ))}
      </div>
    </section>
  );
}
