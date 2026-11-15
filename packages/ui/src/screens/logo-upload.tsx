'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useId, useRef, useState } from 'react';
import { useApi, useErrorText } from '../api/hooks';
import { ConfirmDialog } from '../dialog';
import { FormMessage } from '../forms';
import { richTags } from '../text';

const LOGO_TYPES = ['image/png', 'image/svg+xml'];

/**
 * A logo of PNG or SVG (FR-AGY-01, FR-DAT-01): upload, replace and remove. The browser checks type
 * and size only for a quick message; the server judges the real type and sanitizes an SVG.
 * messages names a namespace with the keys of "agencySettings.logo".
 */
export function LogoUpload({
  messages,
  path,
  field,
  maxBytes,
  hasLogo,
  onChanged,
}: {
  messages: string;
  /** The logo endpoint: PUT uploads, DELETE removes. */
  path: string;
  /** The multipart field the endpoint reads. */
  field: string;
  maxBytes: number;
  hasLogo: boolean;
  /** Reloads whatever shows the logo. */
  onChanged: () => Promise<unknown>;
}) {
  const t = useTranslations(messages);
  const api = useApi();
  const errorText = useErrorText();
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const titleId = useId();
  const [isSvg, setIsSvg] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: ReactNode } | null>(
    null,
  );
  const [confirmRemove, setConfirmRemove] = useState(false);

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const file = input.current?.files?.[0];
    if (!file) {
      setMessage({ tone: 'error', text: t('choose') });
      return;
    }
    if (!LOGO_TYPES.includes(file.type)) {
      setMessage({ tone: 'error', text: t('wrongType') });
      return;
    }
    if (file.size > maxBytes) {
      setMessage({ tone: 'error', text: t('tooLarge') });
      return;
    }
    setPending(true);
    try {
      const formData = new FormData();
      formData.append(field, file);
      await api.put(path, { formData });
      await onChanged();
      if (input.current) input.current.value = '';
      setIsSvg(false);
      setMessage({ tone: 'success', text: t('uploaded') });
    } catch (error) {
      setMessage({ tone: 'error', text: errorText(error) });
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="reih-card" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('title')}</h2>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <form className="reih-form" onSubmit={(event) => void upload(event)} noValidate>
        <div className="reih-field">
          <label htmlFor={inputId}>{t('file')}</label>
          <input
            ref={input}
            id={inputId}
            type="file"
            accept="image/png,image/svg+xml"
            aria-describedby={`${inputId}-hint${isSvg ? ` ${inputId}-svg` : ''}`}
            onChange={(event) => setIsSvg(event.target.files?.[0]?.type === 'image/svg+xml')}
          />
          <p id={`${inputId}-hint`} className="reih-hint">
            {t.rich('hint', richTags)}
          </p>
          {isSvg && (
            <p id={`${inputId}-svg`} className="reih-alert" data-tone="info" role="note">
              {t.rich('svgNote', { ...richTags, code: (chunks) => <code>{chunks}</code> })}
            </p>
          )}
        </div>
        <div className="reih-actions">
          <button type="submit" className="reih-primary" disabled={pending} aria-busy={pending}>
            {pending ? t('uploading') : t('upload')}
          </button>
          {hasLogo && (
            <button type="button" onClick={() => setConfirmRemove(true)}>
              {t('remove')}
            </button>
          )}
        </div>
      </form>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={t('removeTitle')}
        body={t('removeBody')}
        confirmLabel={t('remove')}
        danger
        onConfirm={async () => {
          await api.delete(path);
          await onChanged();
        }}
      />
    </section>
  );
}
