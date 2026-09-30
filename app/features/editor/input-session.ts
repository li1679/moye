import type { SelectionPosition } from '../../data/schema';

type InputLike = {
  inputType: string;
  data?: string | null;
  dataTransfer?: DataTransfer | null;
};

export type InputEdit = {
  offset: number;
  before: string;
  after: string;
  inputType: string;
};

const textFrom = (event: InputLike): string | null => {
  if (event.inputType === 'insertText' || event.inputType === 'insertCompositionText') return event.data ?? '';
  if (event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop') {
    return event.dataTransfer?.getData('text/plain') ?? null;
  }
  return '';
};

export function extractInputEdit(value: string, selection: Pick<SelectionPosition, 'start' | 'end'>, event: InputLike): InputEdit | null {
  const start = Math.max(0, Math.min(selection.start, value.length));
  const end = Math.max(start, Math.min(selection.end, value.length));
  const inserted = textFrom(event);
  if (inserted === null) return null;
  let replacement: string;
  switch (event.inputType) {
    case 'insertText':
    case 'insertCompositionText':
    case 'insertFromPaste':
    case 'insertFromDrop':
      replacement = inserted;
      break;
    case 'deleteContentBackward':
      if (start !== end) { replacement = ''; break; }
      if (start === 0) return null;
      replacement = '';
      return { offset: start - 1, before: value.slice(start - 1, end), after: value.slice(0, start - 1) + value.slice(end), inputType: event.inputType };
    case 'deleteContentForward':
      if (start !== end) { replacement = ''; break; }
      if (end === value.length) return null;
      replacement = '';
      return { offset: start, before: value.slice(start, end + 1), after: value.slice(0, start) + value.slice(end + 1), inputType: event.inputType };
    case 'deleteByCut':
    case 'deleteContent':
      replacement = '';
      break;
    default:
      return null;
  }
  return { offset: start, before: value.slice(start, end), after: value.slice(0, start) + replacement + value.slice(end), inputType: event.inputType };
}
