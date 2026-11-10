'use client';

import { agencyStatusChangeRequestSchema } from '@reih/contracts';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useErrorText } from './api/hooks';
import { ApiForm, useApiForm, useFieldErrorText } from './forms';

const FOCUSABLE_PARTS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
];
const FOCUSABLE = FOCUSABLE_PARTS.join(', ');
/** The body's own controls first, so the focus skips the Close button in the header. */
const BODY_FOCUSABLE = FOCUSABLE_PARTS.map((part) => `.reih-dialog-body ${part}`).join(', ');

/**
 * A modal dialog on the native <dialog> element (NFR-14): showModal() makes the page behind it
 * inert, so Tab stays inside; focus moves to the first field or button; Esc closes it; focus goes
 * back to the control that opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('dialog');
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      const first =
        dialog.querySelector<HTMLElement>('[autofocus]') ??
        dialog.querySelector<HTMLElement>(BODY_FOCUSABLE) ??
        dialog.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open && opener.current) {
      opener.current.focus();
      opener.current = null;
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="reih-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc: React state decides, so the dialog and the state never disagree.
        event.preventDefault();
        onClose();
      }}
    >
      <div className="reih-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="reih-dialog-close" onClick={onClose}>
          {t('close')}
        </button>
      </div>
      <div className="reih-dialog-body">{open && children}</div>
    </dialog>
  );
}

/** Asks before an action that changes an account or deletes data; shows the API's refusal. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  onConfirm,
  danger = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  body: ReactNode;
  confirmLabel: ReactNode;
  /** Resolves when done; a rejection is shown in the dialog with its i18n message. */
  onConfirm: () => Promise<void>;
  danger?: boolean;
}) {
  const t = useTranslations('dialog');
  const errorText = useErrorText();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p>{body}</p>
      {error !== null && (
        <div role="alert" className="reih-alert" data-tone="error">
          {errorText(error)}
        </div>
      )}
      <div className="reih-actions">
        <button
          type="button"
          className={danger ? 'reih-danger' : 'reih-primary'}
          disabled={pending}
          aria-busy={pending}
          onClick={() => {
            setPending(true);
            setError(null);
            onConfirm()
              .then(onClose)
              .catch((caught: unknown) => setError(caught))
              .finally(() => setPending(false));
          }}
        >
          {confirmLabel}
        </button>
        <button type="button" onClick={onClose} disabled={pending}>
          {t('cancel')}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * FR-ADM-02: an action that needs a reason. The reason is required here too, and the server's
 * VALIDATION_FAILED is shown on the field if it still refuses it.
 */
export function ReasonDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  onSubmit: (reason: string) => Promise<void>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <ReasonForm
        description={description}
        confirmLabel={confirmLabel}
        onSubmit={async (reason) => {
          await onSubmit(reason);
          onClose();
        }}
        onCancel={onClose}
      />
    </Dialog>
  );
}

function ReasonForm({
  description,
  confirmLabel,
  onSubmit,
  onCancel,
}: {
  description: ReactNode;
  confirmLabel: ReactNode;
  onSubmit: (reason: string) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('dialog');
  const fieldError = useFieldErrorText();
  const api = useApiForm(agencyStatusChangeRequestSchema, {
    defaultValues: { reason: '' },
    onSubmit: ({ reason }) => onSubmit(reason),
  });
  const reasonId = useId();
  const { errors } = api.form.formState;
  return (
    <ApiForm
      api={api}
      submitLabel={confirmLabel}
      pendingLabel={t('working')}
      secondary={
        <button type="button" onClick={onCancel}>
          {t('cancel')}
        </button>
      }
    >
      <p>{description}</p>
      <div className="reih-field" data-invalid={errors.reason ? 'true' : undefined}>
        <label htmlFor={reasonId}>{t('reason')}</label>
        <textarea
          id={reasonId}
          rows={4}
          maxLength={1000}
          required
          aria-required="true"
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={errors.reason ? `${reasonId}-error` : undefined}
          {...api.form.register('reason')}
        />
        {errors.reason && (
          <p id={`${reasonId}-error`} className="reih-field-error">
            {fieldError(errors.reason.message)}
          </p>
        )}
      </div>
    </ApiForm>
  );
}
