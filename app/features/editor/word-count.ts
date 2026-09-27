import { countCharacters } from './text-tools';

type CountResponse = { id: number; count: number };
type WorkerLike = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: ((event: MessageEvent<CountResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

export type WordCountClient = {
  count(text: string): Promise<number | null>;
  dispose(): void;
};

export function createWordCountClient(): WordCountClient {
  let worker: WorkerLike | null = null;
  let nextId = 0;
  let latestId = 0;
  const pending = new Map<number, { resolve: (count: number | null) => void; reject: (error: unknown) => void }>();

  const useWorker = () => {
    if (worker || typeof Worker === 'undefined') return worker;
    worker = new Worker(new URL('./word-count.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = event => {
      const request = pending.get(event.data.id);
      if (!request) return;
      pending.delete(event.data.id);
      if (event.data.id !== latestId) return request.resolve(null);
      request.resolve(event.data.count);
    };
    worker.onerror = event => {
      for (const request of pending.values()) request.reject(event.error ?? new Error(event.message));
      pending.clear();
    };
    return worker;
  };

  return {
    count(text) {
      const id = ++nextId;
      latestId = id;
      const activeWorker = useWorker();
      if (!activeWorker) return Promise.resolve(countCharacters(text));
      return new Promise<number | null>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        activeWorker.postMessage({ id, text });
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      for (const request of pending.values()) request.reject(new Error('字数统计已取消'));
      pending.clear();
    },
  };
}
