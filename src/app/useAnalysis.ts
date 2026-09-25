import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { AnalysisResult } from '../engine';
import type { Stage, WorkerRequest, WorkerResponse } from '../worker/protocol';

export interface FileStatus {
  name: string;
  ok: boolean;
  detail: string;
}

export type State =
  | { screen: 'landing'; files: FileStatus[]; error: string | null }
  | { screen: 'working'; stage: Stage; pct: number; files: FileStatus[] }
  | { screen: 'cards'; result: AnalysisResult; files: FileStatus[] };

type Action =
  | { type: 'start' }
  | { type: 'message'; msg: WorkerResponse }
  | { type: 'reset' };

const initial: State = { screen: 'landing', files: [], error: null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'start':
      return { screen: 'working', stage: 'reading', pct: 0, files: [] };
    case 'reset':
      return initial;
    case 'message': {
      const msg = action.msg;
      if (state.screen !== 'working') return state;
      switch (msg.type) {
        case 'progress':
          return { ...state, stage: msg.stage, pct: msg.pct };
        case 'fileAccepted':
          return { ...state, files: [...state.files, { name: msg.name, ok: true, detail: `${msg.rows} trades read` }] };
        case 'fileRejected':
          return { ...state, files: [...state.files, { name: msg.name, ok: false, detail: msg.message }] };
        case 'result':
          return { screen: 'cards', result: msg.result, files: state.files };
        case 'error':
          return { screen: 'landing', files: state.files, error: msg.message };
      }
    }
  }
}

/** Owns the analysis worker; `clear` terminates it so no data survives. */
export function useAnalysis() {
  const [state, dispatch] = useReducer(reducer, initial);
  const workerRef = useRef<Worker | null>(null);

  const stopWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => stopWorker, [stopWorker]);

  const start = useCallback(
    async (files: File[]) => {
      stopWorker();
      dispatch({ type: 'start' });
      const worker = new Worker(new URL('../worker/analysis.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        dispatch({ type: 'message', msg: e.data });
        if (e.data.type === 'result' || e.data.type === 'error') stopWorker();
      };
      worker.onerror = () => {
        dispatch({ type: 'message', msg: { type: 'error', message: 'Something went wrong. Please try again.' } });
        stopWorker();
      };
      const payload = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() })));
      const request: WorkerRequest = { type: 'analyze', files: payload };
      worker.postMessage(request, payload.map((p) => p.bytes));
    },
    [stopWorker],
  );

  const clear = useCallback(() => {
    stopWorker();
    dispatch({ type: 'reset' });
  }, [stopWorker]);

  return { state, start, clear };
}
