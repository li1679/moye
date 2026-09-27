export const $ = <T extends Element = HTMLElement>(query: string, root: ParentNode = document) => root.querySelector(query) as T;
export const $maybe = <T extends Element = HTMLElement>(query: string, root: ParentNode = document) => root.querySelector<T>(query);
export const $$ = <T extends Element = HTMLElement>(query: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(query));

// \u0026 是 "&"，避免工具链把实体字面量再转义；运行时结果就是常见的五个 HTML 实体。
const ENTITIES: Record<string, string> = { '&': '\u0026amp;', '<': '\u0026lt;', '>': '\u0026gt;', '"': '\u0026quot;', "'": '\u0026#39;' };
export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ENTITIES[ch]!);
