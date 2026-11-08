import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const MODULES = resolve(import.meta.dirname, '../src/modules');

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : path.endsWith('.ts') ? [path] : [];
  });
}

/** Every import and export ... from '...' specifier in a file, type-only ones included. */
function specifiers(source: string): string[] {
  return [...source.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g)].map(
    (match) => match[1] as string,
  );
}

/** module -> the other modules it imports, from the source files under src/modules. */
function moduleGraph(): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const name of readdirSync(MODULES)) {
    const edges = new Set<string>();
    graph.set(name, edges);
    for (const file of filesUnder(join(MODULES, name))) {
      for (const specifier of specifiers(readFileSync(file, 'utf8'))) {
        if (!specifier.startsWith('.')) continue;
        const target = relative(MODULES, resolve(dirname(file), specifier));
        const targetModule = target.split(sep)[0];
        if (targetModule && !target.startsWith('..') && targetModule !== name) {
          edges.add(targetModule);
        }
      }
    }
  }
  return graph;
}

/** The first cycle found, as a path that starts and ends with the same module, or null. */
function findCycle(graph: Map<string, Set<string>>): string[] | null {
  const done = new Set<string>();
  const onPath: string[] = [];
  const visit = (node: string): string[] | null => {
    const start = onPath.indexOf(node);
    if (start !== -1) return [...onPath.slice(start), node];
    if (done.has(node)) return null;
    onPath.push(node);
    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    onPath.pop();
    done.add(node);
    return null;
  };
  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

describe('module graph (NFR-13, docs/decisions.md P3.1)', () => {
  const graph = moduleGraph();

  it('has no import cycle between modules', () => {
    expect(findCycle(graph)).toBeNull();
  });

  it('identity imports no other module; its ports are bound in src/identity-ports.module.ts', () => {
    expect([...(graph.get('identity') ?? [])]).toEqual([]);
  });

  it('agency does not import admin', () => {
    expect(graph.get('agency')?.has('admin')).toBe(false);
  });

  it('finds a cycle when there is one', () => {
    const cyclic = new Map([
      ['a', new Set(['b'])],
      ['b', new Set(['c'])],
      ['c', new Set(['a'])],
    ]);
    expect(findCycle(cyclic)).toEqual(['a', 'b', 'c', 'a']);
  });
});
