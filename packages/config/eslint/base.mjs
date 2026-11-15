import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Shared rules for every package. Formatting belongs to Prettier. */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/.turbo/**', '**/coverage/**', '**/next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // P4.4 rule 3: maplibre-gl is fetched only when a map is shown, by the dynamic import in
      // packages/ui/src/map/load-maplibre.ts. A static import would put it in every page's bundle.
      // Type imports are erased, so they are allowed; import() is not an import declaration.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'maplibre-gl',
              allowTypeImports: true,
              message:
                'Load maplibre-gl with loadMapLibre() (packages/ui/src/map), never statically.',
            },
          ],
          patterns: [
            {
              group: ['maplibre-gl/*'],
              allowTypeImports: true,
              message:
                'Load maplibre-gl with loadMapLibre() (packages/ui/src/map), never statically.',
            },
          ],
        },
      ],
    },
  },
);
