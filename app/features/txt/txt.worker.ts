import { decodeText, parseText, type Encoding } from './text';

self.onmessage = async (event: MessageEvent<{ bytes: ArrayBuffer; filename: string; encoding: Encoding; mode: 'auto' | 'single' }>) => {
  try {
    const { bytes, filename, encoding, mode } = event.data;
    const decoded = decodeText(new Uint8Array(bytes), encoding);
    const parsed = parseText(decoded.text, filename, mode);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    self.postMessage({ result: { ...parsed, encoding: decoded.encoding, hash } });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
