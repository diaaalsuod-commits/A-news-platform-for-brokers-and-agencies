import type * as MapLibre from 'maplibre-gl';

export type MapLibreModule = typeof MapLibre;

let loading: Promise<MapLibreModule> | null = null;

/**
 * maplibre-gl and its stylesheet, fetched only when a map is shown (P4.4 rule 3): no page without
 * a map downloads them. A static import of maplibre-gl is refused by the lint rule in
 * packages/ui/eslint.config.mjs; this dynamic import is the only way in. A failed load is
 * forgotten, so Retry fetches again.
 */
export function loadMapLibre(): Promise<MapLibreModule> {
  loading ??= Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]).then(
    ([module]) => module,
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}
