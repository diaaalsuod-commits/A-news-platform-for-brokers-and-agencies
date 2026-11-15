/**
 * The map style (NFR-15, SRS 3.2): OpenFreeMap's Liberty style, with no API key and no account, so
 * no secret and no environment variable. One constant, so a provider with a service guarantee or
 * self-hosted tiles can replace it (docs/decisions.md, open item for deploy). The attribution comes
 * from the style's sources: OpenFreeMap, © OpenMapTiles, data from OpenStreetMap (ODbL).
 */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
