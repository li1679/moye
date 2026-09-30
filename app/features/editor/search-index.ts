import type { SearchDocument, SearchHit } from './text-tools';
type SearchPatch = { upserts: SearchDocument[]; deletes: string[]; order: string[] };
export type SearchResult = { hits: SearchHit[]; total: number };
type Checkpoint = { ordinal: number; document: number; offset: number };
export class SearchIndex {
  private documents = new Map<string, SearchDocument>();
  private order: string[] = [];
  private query: string | undefined;
  private checkpoints: Checkpoint[] = [];
  private total = 0;
  private scans = 0;
  patch(patch: SearchPatch) {
    let changed = patch.upserts.length > 0 || patch.deletes.length > 0 || patch.order.length !== this.order.length || patch.order.some((id, i) => id !== this.order[i]);
    for (const id of patch.deletes) this.documents.delete(id);
    for (const document of patch.upserts) this.documents.set(document.chapterId, document);
    this.order = patch.order;
    if (changed) { this.query = undefined; this.checkpoints = []; }
  }
  search(query: string, page = 0): SearchResult {
    if (!query) return { hits: [], total: 0 };
    if (this.query !== query) {
      this.query = query; this.total = 0; this.checkpoints = []; this.scans++;
      let stride = 50;
      for (let index = 0; index < this.order.length; index++) {
        const document = this.documents.get(this.order[index]);
        if (!document) continue;
        let offset = 0;
        while ((offset = document.body.indexOf(query, offset)) !== -1) {
          if (this.total % stride === 0) this.checkpoints.push({ ordinal: this.total, document: index, offset });
          if (this.checkpoints.length > 4096) {
            stride *= 2;
            this.checkpoints = this.checkpoints.filter(point => point.ordinal % stride === 0);
          }
          this.total++; offset += query.length;
        }
      }
    }
    const first = Math.max(0, Math.trunc(page)) * 50;
    if (first >= this.total) return { hits: [], total: this.total };
    let low = 0, high = this.checkpoints.length - 1;
    while (low < high) { const mid = Math.ceil((low + high) / 2); if (this.checkpoints[mid].ordinal <= first) low = mid; else high = mid - 1; }
    const start = this.checkpoints[low];
    let ordinal = start.ordinal;
    const hits: SearchHit[] = [];
    for (let i = start.document; i < this.order.length && hits.length < 50; i++) {
      const document = this.documents.get(this.order[i]);
      if (!document) continue;
      let offset = i === start.document ? start.offset : 0;
      while (hits.length < 50 && (offset = document.body.indexOf(query, offset)) !== -1) {
        if (ordinal >= first) hits.push({ bookId: document.bookId, chapterId: document.chapterId, title: document.title, bookName: document.bookName, offset, before: document.body.slice(Math.max(0, offset - 24), offset), match: query, after: document.body.slice(offset + query.length, offset + query.length + 45) });
        ordinal++; offset += query.length;
      }
    }
    return { hits, total: this.total };
  }
  get diagnostics() { return { scans: this.scans, checkpoints: this.checkpoints.length, documents: this.documents.size }; }
}
