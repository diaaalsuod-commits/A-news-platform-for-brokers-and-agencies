import { type Locale, localeDirection, messages } from '@reih/i18n';

export interface MailTemplates {
  invitation: { actionUrl: string; validDays: number };
  passwordReset: { actionUrl: string; validMinutes: number };
}

export type MailTemplate = keyof MailTemplates;

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** The invitation and password-reset emails of SRS 3.2. The texts live in packages/i18n. */
export function renderMail<T extends MailTemplate>(
  template: T,
  lang: Locale,
  params: MailTemplates[T],
): RenderedMail {
  const copy = messages[lang].email[template];
  const count = 'validDays' in params ? params.validDays : params.validMinutes;
  const validity = (shownCount: string) => copy.validity.replace('{count}', shownCount);
  const direction = localeDirection(lang);
  const align = direction === 'rtl' ? 'right' : 'left';
  const url = escapeHtml(params.actionUrl);

  return {
    subject: copy.subject,
    text: [copy.body, params.actionUrl, validity(String(count)), copy.ignore].join('\n\n'),
    html: `<!doctype html>
<html lang="${lang}" dir="${direction}">
  <body style="font-family: 'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif; color: #1f2937; text-align: ${align};">
    <h1 style="font-size: 20px; color: #1f3a5f;">${escapeHtml(copy.subject)}</h1>
    <p>${escapeHtml(copy.body)}</p>
    <p><a href="${url}" style="color: #1f3a5f; font-weight: 600;">${escapeHtml(copy.action)}</a></p>
    <p>${validity(`<bdi dir="ltr">${count}</bdi>`)}</p>
    <p style="color: #4b5563;">${escapeHtml(copy.ignore)}</p>
  </body>
</html>
`,
  };
}
