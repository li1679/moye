import { MoyeNative } from './native';

type SharePayload = { name?: string; data?: string; error?: string };
type ShareHandler = (file: File) => void | Promise<void>;

let handler: ShareHandler | null = null;

export function registerShareHandler(next: ShareHandler): void {
  handler = next;
}

export async function receiveShare(payload: SharePayload): Promise<void> {
  if (payload.error) throw new Error(payload.error);
  if (!payload.data) throw new Error('分享内容为空');
  if (!handler) throw new Error('分享导入尚未准备好');
  const binary = atob(payload.data);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const file = new File([bytes], payload.name || '分享的文本.txt', { type: 'text/plain' });
  await handler(file);
}

export function installNativeShareListener(): void {
  void MoyeNative.addListener('shareReceived', payload => {
    void receiveShare(payload).catch(error => {
      document.dispatchEvent(new CustomEvent('moye:share-error', { detail: error instanceof Error ? error.message : String(error) }));
    });
  });
}
