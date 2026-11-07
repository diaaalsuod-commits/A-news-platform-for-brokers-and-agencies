import { createHmac, timingSafeEqual } from 'node:crypto';
import { extname } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/index.js';
import { fileKinds } from './file-types.js';

const DEFAULT_TTL_SECONDS = 10 * 60;
const DOWNLOAD_PATH = '/api/v1/files';

/** Keeps a downloaded SVG from running anything, even when opened directly (NFR-08). */
export const SVG_CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'";

/** Short-lived download links (SRS 3.2). The signature is the authentication of the download. */
@Injectable()
export class SignedUrls {
  private readonly secret: string;

  constructor(@Inject(ENV) env: Env) {
    this.secret = env.URL_SIGNING_SECRET;
  }

  /** A path on the API that works from either web app, valid for ten minutes by default. */
  sign(key: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
    const expires = String(Math.floor(Date.now() / 1000) + ttlSeconds);
    const path = key.split('/').map(encodeURIComponent).join('/');
    return `${DOWNLOAD_PATH}/${path}?expires=${expires}&signature=${this.signatureOf(key, expires)}`;
  }

  verify(key: string, expires: string | undefined, signature: string | undefined): boolean {
    if (!expires || !signature || !/^\d+$/.test(expires)) {
      return false;
    }
    const given = Buffer.from(signature);
    const expected = Buffer.from(this.signatureOf(key, expires));
    return (
      given.length === expected.length &&
      timingSafeEqual(given, expected) &&
      Number(expires) > Date.now() / 1000
    );
  }

  private signatureOf(key: string, expires: string): string {
    return createHmac('sha256', this.secret).update(`${key}\n${expires}`).digest('base64url');
  }
}

/** The headers a download of this file must carry, whichever endpoint serves it. */
export function downloadHeaders(key: string): Record<string, string> {
  const extension = extname(key).slice(1).toLowerCase();
  const kind = Object.values(fileKinds).find((type) => type.extension === extension);
  return {
    'Content-Type': kind?.mimeType ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    ...(extension === fileKinds.svg.extension
      ? { 'Content-Security-Policy': SVG_CONTENT_SECURITY_POLICY }
      : {}),
  };
}
