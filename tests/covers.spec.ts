import { test, expect } from './seed';

test('选图后压缩成不超过 480×640 的 JPEG', async ({ page }) => {
  await page.goto('/');
  // 在页面里用 canvas 生成一张 2000×3000 的 PNG
  const dataUrl = await page.evaluate(() => new Promise<string>(resolve => {
    const canvas = document.createElement('canvas');
    canvas.width = 2000; canvas.height = 3000;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#4682b4'; context.fillRect(0, 0, 2000, 3000);
    context.fillStyle = '#eeeeee'; context.fillRect(100, 100, 1800, 2800);
    context.fillStyle = '#333333'; for (let i = 0; i < 40; i++) context.fillRect(150, 150 + i * 70, 1700, 40);
    canvas.toBlob(blob => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob!);
    }, 'image/png');
  }));
  // 新建书籍时通过 #cover-file 上传
  await page.locator('[data-action="new-book"]').click();
  await page.locator('#cover-file').setInputFiles({ name: '大封面.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await expect(page.locator('.cover-picker img')).toBeVisible();
  await page.locator('#book-name').fill('带封面的书');
  await page.locator('#book-form button[type="submit"]').click();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  // 保存后读 IndexedDB 的 cover:<id>：内容是 JPEG，且小于 200 000 字符
  const covers = await page.evaluate(() => new Promise<string[]>(resolve => {
    const result: string[] = [];
    const req = indexedDB.open('local-editing-preview');
    req.onsuccess = () => {
      const db = req.result;
      const cursor = db.transaction('records').objectStore('records').openCursor();
      cursor.onsuccess = () => {
        if (cursor.result) {
          const key = cursor.result.key as string;
          if (key.startsWith('cover:')) result.push((cursor.result.value as { value: string }).value);
          cursor.result.continue();
        } else { db.close(); resolve(result); }
      };
    };
  }));
  expect(covers).toHaveLength(1);
  expect(covers[0].startsWith('"data:image/jpeg')).toBe(true);
  expect(covers[0].length).toBeLessThan(200_000);
});

test('无图封面按书籍 id 稳定分配纸墨题签', async ({ page }) => {
  await page.goto('/');
  const covers = page.locator('.book .cover');
  await expect(covers).toHaveCount(2);
  await expect(covers.nth(0)).toHaveAttribute('style', /--cover-bg:var\(--cover-4\);--cover-ink:var\(--cover-4-ink\)/);
  await expect(covers.nth(1)).toHaveAttribute('style', /--cover-bg:var\(--cover-5\);--cover-ink:var\(--cover-5-ink\)/);
  await expect(covers.nth(0).locator('.cover-label strong')).toHaveText('雨停之后');
  await expect(covers.nth(0).locator('.cover-seal')).toHaveCount(1);
  await expect(covers.nth(0).locator('small')).toHaveText('林间 著');

  await page.locator('[data-action="new-book"]').click();
  await expect(page.locator('.cover-picker .cover-label strong')).toHaveText('书名');
  await expect(page.locator('.cover-picker .cover-seal')).toHaveCount(1);
});

test('长书名预览保持在封面标签内并实时更新', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="new-book"]').click();
  const name = '这是一个很长很长的调试书名用于检查封面标题布局';
  await page.locator('#book-name').fill(name);
  await expect(page.locator('.cover-picker .cover-label strong')).toHaveText(name);
  const boxes = await page.locator('.cover-picker .cover-label, .cover-picker .cover-label strong, .cover-picker .cover-seal').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  }));
  const [label, title, seal] = boxes;
  expect(title.left).toBeGreaterThanOrEqual(label.left);
  expect(title.right).toBeLessThanOrEqual(label.right);
  expect(title.top).toBeGreaterThanOrEqual(label.top);
  expect(title.bottom).toBeLessThanOrEqual(seal.top);
  expect(seal.right).toBeLessThanOrEqual(label.right);
});
