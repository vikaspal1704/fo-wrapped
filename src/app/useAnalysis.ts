import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { AnalysisResult, BrokerId, IstDate, Locale } from '../engine';
import type { Localized, Stage, WorkerRequest, WorkerResponse } from '../worker/protocol';

export interface FileStatus {
  name: string;
  ok: boolean;
  /** Trades read, for accepted files. */
  rows?: number;
  broker?: BrokerId;
  /** Set for an accepted Zerodha P&L statement. */
  statement?: { from: IstDate; to: IstDate };
  /** Why it was rejected, in each language. */
  message?: Localized;
}

export type State =
  | { screen: 'landing'; files: FileStatus[]; error: Localized | null }
  | { screen: 'working'; stage: Stage; pct: number; files: FileStatus[] }
  | { screen: 'cards'; results: Record<Locale, AnalysisResult>; files: FileStatus[] };

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
          return { ...state, files: [...state.files, { name: msg.name, ok: true, rows: msg.rows, broker: msg.broker, statement: msg.statement }] };
        case 'fileRejected':
          return { ...state, files: [...state.files, { name: msg.name, ok: false, message: msg.message }] };
        case 'result':
          return { screen: 'cards', results: msg.results, files: state.files };
        case 'error':
          return { screen: 'landing', files: state.files, error: msg.message };
      }
    }
  }
}

const newWorker = () => new Worker(new URL('../worker/analysis.worker.ts', import.meta.url), { type: 'module' });

/**
 * Owns the analysis worker. A fresh, empty worker is started as soon as the
 * page loads, so its script is already downloaded and the app keeps working
 * if the network drops. Each worker analyses one upload and is then
 * terminated, so no trade data outlives a run; `clear` resets everything.
 */
export function useAnalysis() {
  const [state, dispatch] = useReducer(reducer, initial);
  const activeRef = useRef<Worker | null>(null);
  const spareRef = useRef<Worker | null>(null);

  const stopActive = useCallback(() => {
    activeRef.current?.terminate();
    activeRef.current = null;
  }, []);

  const ensureSpare = useCallback(() => {
    spareRef.current ??= newWorker();
  }, []);

  useEffect(() => {
    ensureSpare();
    return () => {
      stopActive();
      spareRef.current?.terminate();
      spareRef.current = null;
    };
  }, [ensureSpare, stopActive]);

  const start = useCallback(
    async (files: File[]) => {
      stopActive();
      dispatch({ type: 'start' });
      const worker = spareRef.current ?? newWorker();
      spareRef.current = null;
      activeRef.current = worker;
      const finish = () => {
        stopActive();
        ensureSpare();
      };
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        dispatch({ type: 'message', msg: e.data });
        if (e.data.type === 'result' || e.data.type === 'error') finish();
      };
      worker.onerror = () => {
        dispatch({
          type: 'message',
          msg: { type: 'error', message: { en: 'Something went wrong. Please try again.', hi: 'कुछ गड़बड़ हुई। कृपया फिर कोशिश करें।' } },
        });
        finish();
      };
      const payload = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() })));
      const request: WorkerRequest = { type: 'analyze', files: payload };
      worker.postMessage(request, payload.map((p) => p.bytes));
    },
    [stopActive, ensureSpare],
  );

  const clear = useCallback(() => {
    stopActive();
    ensureSpare();
    dispatch({ type: 'reset' });
  }, [stopActive, ensureSpare]);

  return { state, start, clear };
}
