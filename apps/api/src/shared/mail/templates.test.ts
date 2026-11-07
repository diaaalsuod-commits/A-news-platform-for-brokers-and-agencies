import { describe, expect, it } from 'vitest';
import { renderMail } from './templates.js';

const LINK = 'https://app.localhost/activate?token=abc&next=1';

describe('renderMail', () => {
  it('NFR-06 writes the Arabic invitation right to left, with numbers in <bdi>', () => {
    const mail = renderMail('invitation', 'ar', { actionUrl: LINK, validDays: 7 });
    expect(mail.subject).toBe('دعوة للانضمام إلى REIH');
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).toContain('lang="ar"');
    expect(mail.html).toContain('<bdi dir="ltr">7</bdi>');
  });

  it('NFR-06 writes the English password reset left to right', () => {
    const mail = renderMail('passwordReset', 'en', { actionUrl: LINK, validMinutes: 60 });
    expect(mail.subject).toBe('Reset your REIH password');
    expect(mail.html).toContain('dir="ltr"');
    expect(mail.text).toContain('valid for 60 minutes');
  });

  it('puts the link in the text part as is, and escapes it in the HTML part', () => {
    const mail = renderMail('invitation', 'en', { actionUrl: LINK, validDays: 7 });
    expect(mail.text).toContain(LINK);
    expect(mail.html).toContain('href="https://app.localhost/activate?token=abc&amp;next=1"');
  });

  it('a link cannot break out of the href attribute', () => {
    const mail = renderMail('invitation', 'en', {
      actionUrl: 'https://x.test/"><script>alert(1)</script>',
      validDays: 7,
    });
    expect(mail.html).not.toContain('<script>');
  });
});
