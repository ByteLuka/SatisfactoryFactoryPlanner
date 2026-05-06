export enum ProjectPhase {
  Phase1 = 1,
  Phase2 = 2,
  Phase3 = 3,
  Phase4 = 4,
  Phase5 = 5,
}

/**
 * The player's declared game progress. This is the output of Phase 1 of the planner
 * and the input to all subsequent phases.
 */
export interface GameState {
  /** Highest Space Elevator project phase the player has completed. */
  projectPhase: ProjectPhase;
  /** EST_Milestone schematic classNames the player has unlocked at the HUB. */
  unlockedMilestones: string[];
  /** EST_MAM schematic classNames the player has researched. */
  completedMamResearch: string[];
  /** EST_Alternate schematic classNames representing alternate recipes found via Hard Drives. */
  unlockedAlternates: string[];
}

export function createInitialGameState(): GameState {
  return {
    projectPhase: ProjectPhase.Phase1,
    unlockedMilestones: [],
    completedMamResearch: [],
    unlockedAlternates: [],
  };
}
