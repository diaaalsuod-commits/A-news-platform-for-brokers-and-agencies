import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  transpilePackages: ['@reih/ui'],
  // Pages are opened through Caddy, not directly on the dev port.
  allowedDevOrigins: ['app.localhost'],
};

export default withNextIntl(config);
