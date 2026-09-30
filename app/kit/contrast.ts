const hex = (value: string): [number, number, number] | null => {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  return [0, 2, 4].map(offset => Number.parseInt(match[1].slice(offset, offset + 2), 16)) as [number, number, number];
};

const luminance = (value: string): number => {
  const rgb = hex(value);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrastRatio(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function isDarkPaper(paper: string): boolean {
  return contrastRatio(paper, '#ffffff') > contrastRatio(paper, '#000000');
}
