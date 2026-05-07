import { useRef, useState, useCallback, useEffect } from 'react';
import type { SolverInput, SolverOutput, WorkerToMain } from '../types/plan';

export type SolverStatus = 'idle' | 'solving';

export interface UseSolverReturn {
  solve: (input: SolverInput) => void;
  status: SolverStatus;
  result: SolverOutput | null;
  cancel: () => void;
}

function createWorker(onMessage: (msg: WorkerToMain) => void): Worker {
  const worker = new Worker(
    new URL('../workers/solver.worker.ts', import.meta.url),
    { type: 'module' },
  );
  worker.onmessage = (e: MessageEvent<WorkerToMain>) => onMessage(e.data);
  return worker;
}

export function useSolver(): UseSolverReturn {
  const [status, setStatus] = useState<SolverStatus>('idle');
  const [result, setResult] = useState<SolverOutput | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const handleMessage = useCallback((msg: WorkerToMain) => {
    if (msg.type === 'SOLVE_RESULT') {
      setResult(msg.payload);
      setStatus('idle');
    } else if (msg.type === 'SOLVE_ERROR') {
      setResult({ status: 'error', errorMessage: msg.payload.message });
      setStatus('idle');
    }
  }, []);

  useEffect(() => {
    workerRef.current = createWorker(handleMessage);
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [handleMessage]);

  const solve = useCallback((input: SolverInput) => {
    if (!workerRef.current) return;
    setStatus('solving');
    workerRef.current.postMessage({ type: 'SOLVE', payload: input });
  }, []);

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = createWorker(handleMessage);
    setStatus('idle');
  }, [handleMessage]);

  return { solve, status, result, cancel };
}
