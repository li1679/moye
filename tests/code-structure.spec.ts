import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = new URL('../app/', import.meta.url);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

test('persisted data types are defined only in schema', () => {
  const names = ['Anchor', 'SelectionPosition', 'ReadingPosition', 'Row', 'Chapter'];
  for (const file of sourceFiles(fileURLToPath(appRoot))) {
    if (!file.endsWith('.ts') || file.endsWith('schema.ts')) continue;
    const source = readFileSync(file, 'utf8');
    for (const name of names) {
      expect(source, `${file} duplicates ${name}`).not.toMatch(new RegExp(`(?:type|interface) ${name}\\s*(?:=|\\{)`));
    }
  }
});

test('CSS rules are consolidated within each scope', () => {
  for (const relative of ['styles.css', 'kit/components.css']) {
    const source = readFileSync(new URL(relative, appRoot), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const scopes: Set<string>[] = [new Set()];
    for (const token of source.matchAll(/([^{}]+)\{|\}/g)) {
      if (token[0] === '}') {
        scopes.pop();
        continue;
      }
      const selector = token[1].trim();
      const scope = scopes[scopes.length - 1];
      expect(scope.has(selector), `${relative}: repeated ${selector}`).toBe(false);
      scope.add(selector);
      scopes.push(new Set());
    }
  }
});

test('pages and search do not repair chapter IDs while displaying data', () => {
  const files = [...sourceFiles(fileURLToPath(new URL('pages/', appRoot))), fileURLToPath(new URL('features/search/search-ui.ts', appRoot))];
  for (const file of files) {
    expect(readFileSync(file, 'utf8'), file).not.toMatch(/\.id\s*\?\?=/);
  }
});
