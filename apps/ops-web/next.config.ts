import { loadAppUrls } from '@reih/config/next/app-urls';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Only APP_URL and OPS_URL come from the root .env; no other value reaches this app.
loadAppUrls(new URL('../../.env', import.meta.url));

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  transpilePackages: ['@reih/ui'],
  // Pages are opened through Caddy, not directly on the dev port.
  allowedDevOrigins: ['ops.localhost'],
};

export default withNextIntl(config);
