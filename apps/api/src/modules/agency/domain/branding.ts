/** FR-AGY-01: the colors an agency has until its Agency Admin chooses its own (schema.sql). */
export const DEFAULT_PRIMARY_COLOR = '#1F3A5F';
export const DEFAULT_SECONDARY_COLOR = '#C9A227';

/** Where logos are stored under FILES_DIR. */
export const LOGO_DIRECTORY = 'agency-logos';

/** Colors are stored upper-case, so "#1f3a5f" and "#1F3A5F" are the same color. */
export function normaliseColor(hex: string): string {
  return hex.toUpperCase();
}

/**
 * The logo's URL behind the session. The stored file name changes with every upload, so it versions
 * the URL and a browser never shows a replaced logo from its cache.
 */
export function logoUrl(logoKey: string | null): string | null {
  if (logoKey === null) return null;
  const version = logoKey.slice(logoKey.lastIndexOf('/') + 1).split('.')[0] ?? '';
  return `/api/v1/agency/branding/logo?v=${encodeURIComponent(version)}`;
}
