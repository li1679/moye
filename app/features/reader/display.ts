import type { Chapter, ReadPrefs } from '../../data/schema';
import { formatText } from '../editor/text-tools';

type Tidy = ReadPrefs['tidy'];
type CachedDisplay = Partial<Record<Exclude<Tidy, '关'>, string>>;

const displayCache = new Map<string, CachedDisplay>();

export function displayBody(chapter: Pick<Chapter, 'body'>, tidy: Tidy): string {
  if (tidy === '关') return chapter.body;
  let cached = displayCache.get(chapter.body);
  if (!cached) {
    cached = {};
    displayCache.set(chapter.body, cached);
  }
  const hit = cached[tidy];
  if (hit !== undefined) return hit;
  const result = formatText(chapter.body, { indent: true, spaces: true, paragraph: tidy === '紧凑' ? 0 : 1 });
  cached[tidy] = result;
  return result;
}
