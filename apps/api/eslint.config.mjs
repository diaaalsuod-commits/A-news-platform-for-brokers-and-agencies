import base from '@reih/config/eslint/base';
import boundaries from 'eslint-plugin-boundaries';

const RULE_1 = 'CLAUDE.md rule 1: a module may import another module only through its index.ts.';
const RULE_3 =
  'CLAUDE.md rule 3: domain/ is pure TypeScript and may not import @nestjs/*, drizzle-orm or infrastructure/.';
const RULE_5 = 'CLAUDE.md rule 5: shared/ may not import a module.';
const ONE_WAY_IDENTITY =
  'docs/decisions.md (P3.1): identity imports no other module; it reaches them through its ports, bound in src/identity-ports.module.ts.';
const ONE_WAY_AGENCY =
  'docs/decisions.md (P3.1): agency may not import admin; admin imports agency.';
const ONE_WAY_CONTENT =
  'docs/decisions.md (P4.1): content may import only admin among the modules; the modules that read content import it.';
const NOT_INTO_CONTENT =
  'docs/decisions.md (P4.1): admin and agency may not import content; content imports admin.';

export default [
  ...base,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/root-path': import.meta.dirname,
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/elements': [
        { type: 'module', pattern: 'src/modules/*', partialMatch: false, capture: ['module'] },
        { type: 'shared', pattern: 'src/shared/*', partialMatch: false, capture: ['area'] },
        { type: 'test', pattern: 'test', partialMatch: false },
      ],
      // main.ts, app.module.ts and app.setup.ts wire the application together, and src/cli does the
      // same for the command-line seeds.
      'boundaries/files': [{ pattern: ['src/*.ts', 'src/cli/*.ts'], category: 'app' }],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          // checkInternals covers a domain/ file importing infrastructure/ in its own module.
          // checkAllOrigins covers packages, which rule 3 restricts.
          checkInternals: true,
          checkAllOrigins: true,
          default: 'disallow',
          message: RULE_1,
          // The last policy that matches decides.
          policies: [
            { allow: { to: { module: { origin: ['external', 'core'] } } } },
            {
              from: { element: { type: 'module' } },
              allow: {
                to: {
                  element: {
                    type: 'module',
                    captured: { module: '{{ from.element.captured.module }}' },
                  },
                },
              },
            },
            {
              from: [{ element: { type: ['module', 'test'] } }, { file: { categories: 'app' } }],
              allow: { to: { element: { type: 'module', fileInternalPath: 'index.ts' } } },
            },
            {
              from: [
                { element: { type: ['module', 'shared', 'test'] } },
                { file: { categories: 'app' } },
              ],
              allow: { to: { element: { type: 'shared' } } },
            },
            {
              from: [{ element: { type: 'test' } }, { file: { categories: 'app' } }],
              allow: { to: { file: { categories: 'app' } } },
            },
            // Tests share their setup, for example test/support/identity-app.ts.
            {
              from: { element: { type: 'test' } },
              allow: { to: { element: { type: 'test' } } },
            },
            {
              from: { element: { type: 'shared' } },
              disallow: { to: { element: { type: 'module' } } },
              message: RULE_5,
            },
            {
              from: { element: { type: 'module', fileInternalPath: 'domain/**' } },
              disallow: {
                to: [
                  { module: { origin: 'external', source: ['@nestjs/*', 'drizzle-orm'] } },
                  { element: { type: 'module', fileInternalPath: 'infrastructure/**' } },
                ],
              },
              message: RULE_3,
            },
            // The module graph runs one way: admin -> agency -> identity (test/module-graph.test.ts).
            {
              from: { element: { type: 'module', captured: { module: 'identity' } } },
              disallow: { to: { element: { type: 'module', captured: { module: '!identity' } } } },
              message: ONE_WAY_IDENTITY,
            },
            {
              from: { element: { type: 'module', captured: { module: 'agency' } } },
              disallow: { to: { element: { type: 'module', captured: { module: 'admin' } } } },
              message: ONE_WAY_AGENCY,
            },
            // content -> admin -> agency -> identity. Content reaches nothing else, and the
            // modules below it never reach back, which would close a cycle.
            {
              from: { element: { type: 'module', captured: { module: 'content' } } },
              disallow: {
                to: { element: { type: 'module', captured: { module: '!(content|admin)' } } },
              },
              message: ONE_WAY_CONTENT,
            },
            {
              from: [
                { element: { type: 'module', captured: { module: 'admin' } } },
                { element: { type: 'module', captured: { module: 'agency' } } },
              ],
              disallow: { to: { element: { type: 'module', captured: { module: 'content' } } } },
              message: NOT_INTO_CONTENT,
            },
          ],
        },
      ],
    },
  },
];
