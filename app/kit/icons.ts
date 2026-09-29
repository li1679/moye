import {
  ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpDown, ArrowUpToLine, Archive, BookOpenText, BookPlus, Check,
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleCheck, CircleMinus, CirclePlus, Copy, EllipsisVertical, Eraser,
  Feather, FileInput, FileOutput, FilePlus2, FolderInput, FolderPlus, Folders, GripVertical, Info, Keyboard, LayoutGrid,
  List, ListOrdered, Moon, Pencil, PencilLine, Plus, Redo2, Repeat2, Replace, Rows3, Search, Settings, Settings2,
  SlidersHorizontal, Square, SquareCheck, SquareCheckBig, SquareMinus, Sun, TextSearch, Trash2, Undo2, WandSparkles, X,
  type IconNode,
} from 'lucide';

const ICONS = {
  'arrow-down-to-line': ArrowDownToLine, 'arrow-left-to-line': ArrowLeftToLine, 'arrow-right-to-line': ArrowRightToLine,
  'arrow-up-down': ArrowUpDown, 'arrow-up-to-line': ArrowUpToLine, archive: Archive, 'book-open-text': BookOpenText,
  'book-plus': BookPlus, check: Check, 'chevron-down': ChevronDown, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight,
  'chevron-up': ChevronUp, 'circle-check': CircleCheck, 'circle-minus': CircleMinus, 'circle-plus': CirclePlus, copy: Copy,
  'ellipsis-vertical': EllipsisVertical, eraser: Eraser, feather: Feather, 'file-input': FileInput, 'file-output': FileOutput,
  'file-plus-2': FilePlus2, 'folder-input': FolderInput, 'folder-plus': FolderPlus, folders: Folders, 'grip-vertical': GripVertical,
  info: Info, keyboard: Keyboard, 'layout-grid': LayoutGrid, list: List, 'list-ordered': ListOrdered, moon: Moon, pencil: Pencil,
  'pencil-line': PencilLine, plus: Plus, 'redo-2': Redo2, 'repeat-2': Repeat2, replace: Replace, 'rows-3': Rows3, search: Search,
  settings: Settings, 'settings-2': Settings2, 'sliders-horizontal': SlidersHorizontal, square: Square, 'square-check': SquareCheck,
  'square-check-big': SquareCheckBig, 'square-minus': SquareMinus, sun: Sun, 'text-search': TextSearch, 'trash-2': Trash2,
  'undo-2': Undo2, 'wand-sparkles': WandSparkles, x: X,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

const attributes = (record: Record<string, string | number>) =>
  Object.entries(record).map(([key, value]) => `${key}="${String(value).replace(/"/g, '&quot;')}"`).join(' ');
const cache = new Map<IconName, string>();

export function icon(name: IconName): string {
  let svg = cache.get(name);
  if (!svg) {
    const children = ICONS[name][2] ?? [];
    const body = children.map(([tag, attrs]) => `<${tag} ${attributes(attrs)}/>`).join('');
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="lucide lucide-${name}">${body}</svg>`;
    cache.set(name, svg);
  }
  return svg;
}
