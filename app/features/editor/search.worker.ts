import { SearchIndex } from './search-index';
const index = new SearchIndex();
self.onmessage = event => {
  const { id, patch, query, page } = event.data;
  try { index.patch(patch); self.postMessage({ id, result: index.search(query, page) }); }
  catch (error) { self.postMessage({ id, error: String(error) }); }
};
