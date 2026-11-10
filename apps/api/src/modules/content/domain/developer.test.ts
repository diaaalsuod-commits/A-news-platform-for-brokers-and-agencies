import { describe, expect, it } from 'vitest';
import { developerLogoUrl } from './developer.js';

const ID = '0b0f6f0e-3c58-4a8e-9d2b-0c7a6f3f1a11';

describe('developer logo', () => {
  it('FR-DAT-01 a developer without a logo has no logo URL', () => {
    expect(developerLogoUrl(ID, null)).toBeNull();
  });

  it('FR-DAT-01 the logo URL changes with every new file', () => {
    expect(developerLogoUrl(ID, 'developer-logos/abc-123.svg')).toBe(
      `/api/v1/content/developers/${ID}/logo?v=abc-123`,
    );
    expect(developerLogoUrl(ID, 'developer-logos/def-456.png')).toBe(
      `/api/v1/content/developers/${ID}/logo?v=def-456`,
    );
  });
});
