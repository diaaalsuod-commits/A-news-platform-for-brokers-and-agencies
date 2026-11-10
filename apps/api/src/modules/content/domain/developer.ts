/** Where developer logos are stored under FILES_DIR. */
export const DEVELOPER_LOGO_DIRECTORY = 'developer-logos';

/**
 * The logo's URL behind the session. The stored file name changes with every upload, so it versions
 * the URL and a browser never shows a replaced logo from its cache.
 */
export function developerLogoUrl(developerId: string, logoKey: string | null): string | null {
  if (logoKey === null) return null;
  const version = logoKey.slice(logoKey.lastIndexOf('/') + 1).split('.')[0] ?? '';
  return `/api/v1/content/developers/${developerId}/logo?v=${encodeURIComponent(version)}`;
}
