import {
  hexColorSchema,
  httpsUrlSchema,
  ornSchema,
  updateBrandingRequestSchema,
} from '@reih/contracts';
import { describe, expect, it } from 'vitest';
import { logoUrl, normaliseColor } from './branding.js';

const valid = {
  marketingName: 'Sandline Realty',
  primaryColor: '#1F3A5F',
  secondaryColor: '#c9a227',
};

describe('branding rules', () => {
  it('FR-AGY-01 colors are #RRGGBB only', () => {
    expect(hexColorSchema.safeParse('#1F3A5F').success).toBe(true);
    for (const color of ['#FFF', '1F3A5F', '#1F3A5G', 'red', '#1F3A5F00', 'rgb(0,0,0)']) {
      expect(hexColorSchema.safeParse(color).success, color).toBe(false);
    }
    expect(normaliseColor('#c9a227')).toBe('#C9A227');
  });

  it('FR-AGY-01 the website must be an https URL', () => {
    expect(httpsUrlSchema.safeParse('https://agency.example').success).toBe(true);
    for (const url of ['http://agency.example', 'javascript:alert(1)', 'agency.example']) {
      expect(httpsUrlSchema.safeParse(url).success, url).toBe(false);
    }
  });

  it('FR-AGY-01 the ORN is 3 to 10 digits', () => {
    expect(ornSchema.safeParse('12345').success).toBe(true);
    for (const orn of ['12', '12345678901', 'ORN123', '12 345']) {
      expect(ornSchema.safeParse(orn).success, orn).toBe(false);
    }
  });

  it('FR-AGY-01 optional fields default to null, and an empty one clears it', () => {
    const parsed = updateBrandingRequestSchema.parse({ ...valid, website: '', orn: '' });
    expect(parsed).toMatchObject({ phone: null, email: null, website: null, orn: null });
  });

  it('FR-AGY-01 the phone is E.164 and the email is normalised', () => {
    expect(updateBrandingRequestSchema.safeParse({ ...valid, phone: '0501234567' }).success).toBe(
      false,
    );
    expect(
      updateBrandingRequestSchema.parse({ ...valid, email: '  Sales@Agency.Example ' }).email,
    ).toBe('sales@agency.example');
  });

  it('FR-AGY-01 the logo URL changes with every new file', () => {
    expect(logoUrl(null)).toBeNull();
    expect(logoUrl('agency-logos/abc-123.svg')).toBe('/api/v1/agency/branding/logo?v=abc-123');
  });
});
