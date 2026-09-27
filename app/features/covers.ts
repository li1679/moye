// 把封面缩到 480×640 以内，转成 JPEG（D-13）。透明区域铺白底。
export async function compressCover(file: Blob, maxWidth = 480, maxHeight = 640, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file);   // 会按 EXIF 方向转正
  try {
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    bitmap.close();
  }
}
