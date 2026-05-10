import { useState, useMemo } from 'react';
import type { Recipe, GameData } from '../../types/domain';
import type { PlanAction } from '../../store/PlanContext';

interface Props {
  availableRecipes: Recipe[];
  disabledRecipes: string[];
  activeRecipeClassNames: Set<string>;
  gameData: GameData;
  dispatch: (action: PlanAction) => void;
}

function getMachineName(recipe: Recipe, buildings: GameData['buildings']): string {
  for (const cn of recipe.producedInClassNames) {
    const building = buildings[cn];
    if (building) return building.name;
  }
  const cn = recipe.producedInClassNames[0] ?? '';
  return cn.replace(/Build_|Mk\d_C|_C$/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim() || 'Other';
}

interface RecipeGroup {
  machineName: string;
  recipes: Recipe[];
}

export function RecipeListPanel({
  availableRecipes,
  disabledRecipes,
  activeRecipeClassNames,
  gameData,
  dispatch,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const disabledSet = useMemo(() => new Set(disabledRecipes), [disabledRecipes]);
  const enabledCount = availableRecipes.length - disabledRecipes.filter(
    cn => availableRecipes.some(r => r.className === cn),
  ).length;

  const groups = useMemo<RecipeGroup[]>(() => {
    const map = new Map<string, Recipe[]>();
    const sorted = [...availableRecipes].sort((a, b) => a.name.localeCompare(b.name));
    for (const recipe of sorted) {
      const machine = getMachineName(recipe, gameData.buildings);
      if (!map.has(machine)) map.set(machine, []);
      map.get(machine)!.push(recipe);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([machineName, recipes]) => ({ machineName, recipes }));
  }, [availableRecipes, gameData.buildings]);

  const filteredGroups = useMemo<RecipeGroup[]>(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map(g => ({
        ...g,
        recipes: g.recipes.filter(r => r.name.toLowerCase().includes(q)),
      }))
      .filter(g => g.recipes.length > 0);
  }, [groups, search]);

  function toggleGroup(machineName: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(machineName)) next.delete(machineName);
      else next.add(machineName);
      return next;
    });
  }

  const allClassNames = availableRecipes.map(r => r.className);

  return (
    <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg overflow-hidden">
      {/* Panel header — always visible */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#2e2e38] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[#e8e8f0] font-semibold text-sm">Recipes</span>
          <span className="text-[10px] bg-[#2e2e38] text-[#8888a0] rounded px-1.5 py-0.5 font-mono">
            {enabledCount}/{availableRecipes.length}
          </span>
        </div>
        <span className="text-[#8888a0] text-xs">{collapsed ? '▶' : '▼'}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-[#3a3a46]">
          {/* Search + bulk actions */}
          <div className="px-4 pt-3 pb-2 flex flex-col gap-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter recipes…"
              className="w-full bg-[#2e2e38] border border-[#3a3a46] rounded-md px-3 py-1.5 text-sm text-[#e8e8f0] placeholder-[#8888a0] focus:outline-none focus:border-[#e8820c]/60"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  dispatch({ type: 'SET_ALL_RECIPES', classNames: allClassNames, enabled: true })
                }
                className="flex-1 text-[10px] py-1 rounded border border-[#3a3a46] bg-[#2e2e38] text-[#8888a0] hover:text-[#e8e8f0] hover:border-[#e8820c]/40 transition-colors"
              >
                Enable all
              </button>
              <button
                onClick={() =>
                  dispatch({ type: 'SET_ALL_RECIPES', classNames: allClassNames, enabled: false })
                }
                className="flex-1 text-[10px] py-1 rounded border border-[#3a3a46] bg-[#2e2e38] text-[#8888a0] hover:text-[#e8e8f0] hover:border-[#f87171]/40 transition-colors"
              >
                Disable all
              </button>
            </div>
          </div>

          {/* Recipe groups */}
          <div className="max-h-[480px] overflow-y-auto px-4 pb-3 flex flex-col gap-3">
            {filteredGroups.map(group => {
              const isGroupCollapsed = collapsedGroups.has(group.machineName);
              const groupClassNames = group.recipes.map(r => r.className);
              const allEnabled = groupClassNames.every(cn => !disabledSet.has(cn));
              const allDisabled = groupClassNames.every(cn => disabledSet.has(cn));

              return (
                <div key={group.machineName}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      onClick={() => toggleGroup(group.machineName)}
                      className="flex-1 flex items-center gap-1.5 text-left"
                    >
                      <span className="text-[#8888a0] text-[9px]">{isGroupCollapsed ? '▶' : '▼'}</span>
                      <span className="text-[#8888a0] text-[10px] font-semibold uppercase tracking-wider">
                        {group.machineName}
                      </span>
                      <span className="text-[10px] text-[#8888a0]/60 font-mono">
                        ({groupClassNames.filter(cn => !disabledSet.has(cn)).length}/{group.recipes.length})
                      </span>
                    </button>
                    {/* Group toggle */}
                    <button
                      onClick={() =>
                        dispatch({
                          type: 'SET_ALL_RECIPES',
                          classNames: groupClassNames,
                          enabled: !allEnabled,
                        })
                      }
                      className="text-[10px] text-[#8888a0] hover:text-[#e8e8f0] transition-colors px-1"
                      title={allEnabled ? 'Disable all in group' : 'Enable all in group'}
                    >
                      {allEnabled ? '✓ all' : allDisabled ? '✕ all' : '~all'}
                    </button>
                  </div>

                  {/* Recipe rows */}
                  {!isGroupCollapsed && (
                    <div className="flex flex-col gap-0.5">
                      {group.recipes.map(recipe => {
                        const isEnabled = !disabledSet.has(recipe.className);
                        const isActive = activeRecipeClassNames.has(recipe.className);

                        return (
                          <div
                            key={recipe.className}
                            className={[
                              'flex items-center gap-2 rounded px-2 py-1 transition-colors',
                              isActive
                                ? 'bg-[#4ade80]/8 border border-[#4ade80]/20'
                                : 'border border-transparent hover:bg-[#2e2e38]',
                              !isEnabled ? 'opacity-50' : '',
                            ].join(' ')}
                          >
                            {/* Toggle */}
                            <button
                              onClick={() =>
                                dispatch({ type: 'TOGGLE_RECIPE', recipeClassName: recipe.className })
                              }
                              className={[
                                'w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors',
                                isEnabled
                                  ? 'bg-[#e8820c] border-[#e8820c]'
                                  : 'bg-transparent border-[#3a3a46] hover:border-[#8888a0]',
                              ].join(' ')}
                              title={isEnabled ? 'Disable recipe' : 'Enable recipe'}
                            >
                              {isEnabled && (
                                <span className="text-white text-[8px] font-bold leading-none">✓</span>
                              )}
                            </button>

                            {/* Recipe name */}
                            <span
                              className={[
                                'flex-1 text-[11px] truncate',
                                isEnabled ? 'text-[#e8e8f0]' : 'text-[#8888a0]',
                              ].join(' ')}
                            >
                              {recipe.alternate && (
                                <span className="text-[#e8820c] font-bold mr-1">Alt:</span>
                              )}
                              {recipe.name.replace(/^Alternate: /, '')}
                            </span>

                            {/* In-use badge */}
                            {isActive && (
                              <span className="text-[9px] font-semibold text-[#4ade80] flex-shrink-0">
                                ●
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredGroups.length === 0 && (
              <p className="text-[#8888a0] text-xs italic text-center py-4">No recipes match filter.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
