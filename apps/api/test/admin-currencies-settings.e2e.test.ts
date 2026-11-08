import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RatesReader, SettingsReader, seedAdminReference } from '../src/modules/admin/index.js';
import { convertFromAed } from '../src/shared/localization/index.js';
import { useIdentityApp } from './support/identity-app.js';

/** The UAE calendar day, offset by some days (Asia/Dubai is UTC+4 all year). */
function uaeDay(offsetDays = 0): string {
  const shifted = new Date(Date.now() + 4 * 3_600_000 + offsetDays * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

describe('Platform Admin: currencies, rates and settings (FR-ADM-05, FR-LOC-01, FR-ADM-06)', () => {
  const h = useIdentityApp({ mailpit: true });
  let admin: { id: string; email: string };
  let session: string;

  beforeAll(async () => {
    // The reference seed adds USD, EUR, GBP and SAR, disabled; migration 0002 adds AED.
    await seedAdminReference(drizzle({ client: h.db }));
    admin = await h.createUser({ role: 'platform_admin' });
  });

  beforeEach(async () => {
    session = await h.sessionFor(admin.email);
  });

  const addRate = (code: string, body: Record<string, unknown>) =>
    h.post(`/admin/currencies/${code}/rates`, { session, body });
  const setEnabled = (code: string, isEnabled: boolean) =>
    h.send('patch', `/admin/currencies/${code}`, { session, body: { isEnabled } });

  describe('FR-ADM-05 display currencies', () => {
    it('FR-ADM-05 lists AED first and every currency with its state and latest rate', async () => {
      const response = await h.get('/admin/currencies', session);
      expect(response.status).toBe(200);
      expect(response.body.items.map((item: { code: string }) => item.code)).toEqual([
        'AED',
        'EUR',
        'GBP',
        'SAR',
        'USD',
      ]);
      expect(response.body.items[0]).toMatchObject({ isEnabled: true, latestRate: null });
      expect(response.body).toMatchObject({ total: 5, page: 1, pageSize: 20 });
    });

    it('FR-ADM-05 AED is always enabled and takes no rate', async () => {
      const disable = await setEnabled('AED', false);
      expect(disable.status).toBe(409);
      expect(disable.body.error.code).toBe('AED_FIXED');
      const rate = await addRate('aed', { aedPerUnit: '1', effectiveDate: uaeDay() });
      expect(rate.body.error.code).toBe('AED_FIXED');
    });

    it('FR-ADM-05 a currency without a rate cannot be enabled', async () => {
      const response = await setEnabled('GBP', true);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CURRENCY_HAS_NO_RATE');
    });

    it('FR-ADM-05 an unknown currency is 404 and a malformed code is 400', async () => {
      expect((await setEnabled('XYZ', true)).status).toBe(404);
      expect((await h.get('/admin/currencies/US1/rates', session)).status).toBe(400);
    });
  });

  describe('FR-ADM-05 dated exchange rates', () => {
    it('FR-ADM-05 aed_per_unit must be a decimal string greater than 0', async () => {
      for (const aedPerUnit of ['0', '0.00', '-1', '1e3', 3.6725, '12345678901', '1.123456789']) {
        const response = await addRate('SAR', { aedPerUnit, effectiveDate: uaeDay() });
        expect(response.status, String(aedPerUnit)).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_FAILED');
      }
    });

    it('FR-ADM-05 a rate dated after today in the UAE is refused; past dates are allowed', async () => {
      const future = await addRate('SAR', { aedPerUnit: '0.98', effectiveDate: uaeDay(1) });
      expect(future.status).toBe(400);
      expect(future.body.error.code).toBe('RATE_DATE_IN_FUTURE');

      const past = await addRate('SAR', { aedPerUnit: '0.97', effectiveDate: '2025-01-01' });
      expect(past.status).toBe(201);
      expect(past.body).toMatchObject({
        currencyCode: 'SAR',
        aedPerUnit: '0.97',
        effectiveDate: '2025-01-01',
        effectiveAt: '2024-12-31T20:00:00.000Z',
        enteredBy: admin.id,
      });
    });

    it('FR-ADM-05 the first rate of a disabled currency enables it', async () => {
      const before = await h.get('/admin/currencies', session);
      expect(
        before.body.items.find((item: { code: string }) => item.code === 'EUR').isEnabled,
      ).toBe(false);
      const response = await addRate('EUR', { aedPerUnit: '4.00000000', effectiveDate: uaeDay() });
      expect(response.status).toBe(201);
      expect(response.body.aedPerUnit).toBe('4');

      const after = await h.get('/admin/currencies', session);
      const eur = after.body.items.find((item: { code: string }) => item.code === 'EUR');
      expect(eur).toMatchObject({ isEnabled: true, latestRate: { id: response.body.id } });
      const enabled = await h.get('/currencies', session);
      expect(enabled.body.items.map((item: { code: string }) => item.code)).toContain('EUR');
    });

    it('FR-ADM-05 a newly entered rate applies to conversions at once', async () => {
      const rates = h.app.get(RatesReader);
      await addRate('USD', { aedPerUnit: '3.6725', effectiveDate: uaeDay(-1) });
      expect((await rates.latest('USD'))?.aedPerUnit).toBe('3.6725');
      expect(convertFromAed('1000000', '3.6725')).toBe('272294.08');

      const newer = await addRate('USD', { aedPerUnit: '3.70', effectiveDate: uaeDay() });
      const latest = await rates.latest('USD');
      expect(latest).toMatchObject({ rateId: newer.body.id, aedPerUnit: '3.7' });
      expect(convertFromAed('1000000', latest?.aedPerUnit as string)).toBe('270270.27');

      // A backdated rate is history, not the latest.
      await addRate('USD', { aedPerUnit: '3.50', effectiveDate: '2025-06-01' });
      expect((await rates.latest('USD'))?.rateId).toBe(newer.body.id);

      const history = await h.get('/admin/currencies/USD/rates', session);
      expect(history.body.items.map((item: { aedPerUnit: string }) => item.aedPerUnit)).toEqual([
        '3.7',
        '3.6725',
        '3.5',
      ]);
      expect(history.body.total).toBe(3);
    });

    it('FR-LOC-01 the latest rate carries the date it applies from', async () => {
      const today = uaeDay();
      await addRate('GBP', { aedPerUnit: '4.65', effectiveDate: today });
      const latest = await h.app.get(RatesReader).latest('gbp');
      expect(latest).toMatchObject({ code: 'GBP', aedPerUnit: '4.65', effectiveDate: today });
      expect(latest?.effectiveAt).toBeInstanceOf(Date);
      expect(await h.app.get(RatesReader).latest('AED')).toBeNull();
    });
  });

  describe('FR-LOC-01 disabling a currency that users chose', () => {
    it('FR-LOC-01 keeps the saved preference but shows AED while the currency is disabled', async () => {
      await addRate('SAR', { aedPerUnit: '0.9793', effectiveDate: uaeDay() });
      const broker = await h.createUser({ role: 'broker' });
      const brokerSession = await h.sessionFor(broker.email);
      const chosen = await h.send('patch', '/me/preferences', {
        session: brokerSession,
        body: { currency: 'SAR' },
      });
      expect(chosen.status).toBe(200);
      expect((await h.get('/me', brokerSession)).body.preferences.currency).toBe('SAR');

      expect((await setEnabled('SAR', false)).status).toBe(200);
      expect((await h.get('/me', brokerSession)).body.preferences.currency).toBe('AED');
      const saved = await h.db.query('SELECT pref_currency FROM users WHERE id = $1', [broker.id]);
      expect(saved.rows[0].pref_currency).toBe('SAR');
      expect(await h.app.get(RatesReader).latest('SAR')).toBeNull();

      expect((await setEnabled('SAR', true)).status).toBe(200);
      expect((await h.get('/me', brokerSession)).body.preferences.currency).toBe('SAR');
      expect((await h.app.get(RatesReader).latest('SAR'))?.aedPerUnit).toBe('0.9793');
    });
  });

  describe('FR-ADM-06 settings', () => {
    it('FR-ADM-06 shows the defaults: 14 days stale, 7 days invitation, 30 reveals', async () => {
      const response = await h.get('/admin/settings', session);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        staleThresholdDays: 14,
        invitationValidityDays: 7,
        dailyRevealLimit: 30,
        currentTermsVersion: '1.0',
      });
    });

    it('FR-ADM-06 refuses values out of range and fields that cannot be set here', async () => {
      for (const body of [
        { staleThresholdDays: 0 },
        { staleThresholdDays: 366 },
        { invitationValidityDays: 31 },
        { dailyRevealLimit: 1001 },
        { dailyRevealLimit: 1.5 },
        { staleThresholdDays: '14' },
        { currentTermsVersion: '2.0' },
      ]) {
        const response = await h.send('patch', '/admin/settings', { session, body });
        expect(response.status, JSON.stringify(body)).toBe(400);
      }
    });

    it('FR-ADM-06 a changed threshold applies at once, and the reveal limit is stored', async () => {
      const response = await h.send('patch', '/admin/settings', {
        session,
        body: { staleThresholdDays: 21, dailyRevealLimit: 50 },
      });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ staleThresholdDays: 21, dailyRevealLimit: 50 });
      expect(await h.app.get(SettingsReader).get()).toMatchObject({
        staleThresholdDays: 21,
        dailyRevealLimit: 50,
        invitationValidityDays: 7,
      });
      const row = await h.db.query('SELECT updated_by FROM settings');
      expect(row.rows[0].updated_by).toBe(admin.id);
    });

    it('FR-ADM-06 the next invitation uses the new invitation validity', async () => {
      await h.send('patch', '/admin/settings', { session, body: { invitationValidityDays: 3 } });
      const email = `validity-${randomUUID().slice(0, 6)}@reih.test`;
      const before = Date.now();
      const invited = await h.post('/admin/staff/invitations', {
        session,
        body: { email, role: 'data_operator' },
      });
      expect(invited.status).toBe(201);
      const { rows } = await h.db.query('SELECT expires_at FROM invitations WHERE id = $1', [
        invited.body.invitationId,
      ]);
      const days = ((rows[0].expires_at as Date).getTime() - before) / 86_400_000;
      expect(days).toBeGreaterThan(2.99);
      expect(days).toBeLessThan(3.01);
      expect((await h.mailTo(email)).Text).toContain('3');
    });
  });
});
