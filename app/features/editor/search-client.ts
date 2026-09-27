import type { SearchDocument } from './text-tools';
import type { SearchResult } from './search-index';
export class SearchClient {
  private worker?: Worker;
  private previous = new Map<string, SearchDocument>();
  private sequence = 0;
  private pending = new Map<number, { resolve: (result: SearchResult) => void; reject: (error: Error) => void }>();
  search(documents: SearchDocument[], query: string, page: number): Promise<SearchResult> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = event => {
        const pending = this.pending.get(event.data.id);
        if (!pending) return;
        this.pending.delete(event.data.id);
        if (event.data.error) pending.reject(new Error(event.data.error)); else pending.resolve(event.data.result);
      };
      this.worker.onerror = event => this.dispose(new Error(event.message || '搜索线程未完成'));
      this.worker.onmessageerror = () => this.dispose(new Error('搜索结果无法读取'));
    }
    const next = new Map(documents.map(document => [document.chapterId, document]));
    const upserts = documents.filter(document => {
      const old = this.previous.get(document.chapterId);
      return !old || old.body !== document.body || old.title !== document.title || old.bookName !== document.bookName || old.bookId !== document.bookId;
    });
    const deletes = [...this.previous.keys()].filter(id => !next.has(id));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker!.postMessage({ id, patch: { upserts, deletes, order: documents.map(document => document.chapterId) }, query, page });
        this.previous = next;
      } catch (error) { this.dispose(error instanceof Error ? error : new Error(String(error))); }
    });
  }
  cancel() {
    for (const pending of this.pending.values()) pending.reject(new DOMException('搜索已更新', 'AbortError'));
    this.pending.clear();
  }
  dispose(error = new Error('搜索已关闭')) {
    this.worker?.terminate(); this.worker = undefined; this.previous.clear();
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
