import { MoyeNative, isNative } from '../native/native';
import { txtFilename } from './text';


export async function saveTextFile(name: string, text: string): Promise<'saved' | 'download' | 'cancelled'> {
  const filename = txtFilename(name);
  return saveDocument(filename, text, 'text/plain');
}

export async function saveDocument(filename: string, text: string, mime: string): Promise<'saved' | 'download' | 'cancelled'> {
  if (!filename.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(filename)) throw new Error('文件名无效');
  if (isNative) {
    const result = await MoyeNative.saveText({ name: filename, text, mime });
    return result.cancelled ? 'cancelled' : 'saved';
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'download';
}
