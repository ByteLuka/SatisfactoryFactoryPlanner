declare module 'javascript-lp-solver' {
  interface LPConstraint {
    min?: number;
    max?: number;
    equal?: number;
  }

  interface LPModel {
    optimize: string;
    opType: 'min' | 'max';
    constraints: Record<string, LPConstraint>;
    variables: Record<string, Record<string, number>>;
    integers?: Record<string, number>;
    binaries?: Record<string, number>;
  }

  interface LPResult {
    feasible: boolean;
    result: number;
    bounded?: boolean;
    [key: string]: number | boolean | undefined;
  }

  function Solve(model: LPModel): LPResult;
}
