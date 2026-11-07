import base from '@reih/config/eslint/base';
import boundaries from 'eslint-plugin-boundaries';

const RULE_1 = 'CLAUDE.md rule 1: a module may import another module only through its index.ts.';
const RULE_3 =
  'CLAUDE.md rule 3: domain/ is pure TypeScript and may not import @nestjs/*, drizzle-orm or infrastructure/.';
const RULE_5 = 'CLAUDE.md rule 5: shared/ may not import a module.';

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
      // main.ts, app.module.ts and app.setup.ts wire the application together.
      'boundaries/files': [{ pattern: 'src/*.ts', category: 'app' }],
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
          ],
        },
      ],
    },
  },
];
