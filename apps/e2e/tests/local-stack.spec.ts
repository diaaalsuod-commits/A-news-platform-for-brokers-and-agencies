import { expect, test } from '@playwright/test';
import { assertLocalStack } from '../local-stack';

const local = {
  NODE_ENV: 'development',
  APP_URL: 'https://app.localhost',
  OPS_URL: 'https://ops.localhost',
  REDIS_URL: 'redis://localhost:6379',
};

test.describe('e2e setup guard: rate limits are cleared only on a local stack', () => {
  test('NFR-08 a local stack is allowed', () => {
    expect(() => assertLocalStack(local)).not.toThrow();
    expect(() => assertLocalStack({ ...local, REDIS_URL: 'redis://127.0.0.1:6379' })).not.toThrow();
    expect(() => assertLocalStack({ ...local, NODE_ENV: 'test' })).not.toThrow();
  });

  test('NFR-08 production is refused', () => {
    expect(() => assertLocalStack({ ...local, NODE_ENV: 'production' })).toThrow(/production/);
  });

  test('NFR-08 web apps outside *.localhost are refused', () => {
    expect(() => assertLocalStack({ ...local, APP_URL: 'https://app.reih.ae' })).toThrow(/APP_URL/);
    expect(() => assertLocalStack({ ...local, OPS_URL: 'https://ops.example.test' })).toThrow(
      /OPS_URL/,
    );
    expect(() => assertLocalStack({ ...local, APP_URL: undefined })).toThrow(/APP_URL/);
  });

  test('NFR-08 a Redis on another machine is refused', () => {
    expect(() => assertLocalStack({ ...local, REDIS_URL: 'redis://cache.reih.ae:6379' })).toThrow(
      /REDIS_URL/,
    );
    expect(() => assertLocalStack({ ...local, REDIS_URL: undefined })).toThrow(/REDIS_URL/);
  });
});
