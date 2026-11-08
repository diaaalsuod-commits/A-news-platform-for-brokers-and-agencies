'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
  useId,
  useRef,
} from 'react';
import {
  type DefaultValues,
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormReturn,
  useForm,
} from 'react-hook-form';
import type { z } from 'zod';
import { ApiError } from './api/errors';
import { richTags } from './text';

/**
 * Validation messages are message keys in packages/i18n, not zod's English text: "key" or
 * "key|{json values}". A schema may set its own key, which wins over this map.
 */
export function zodIssueToKey(issue: z.core.$ZodRawIssue): string {
  const encode = (key: string, values?: Record<string, unknown>) =>
    values ? `validation.${key}|${JSON.stringify(values)}` : `validation.${key}`;
  switch (issue.code) {
    case 'too_small':
      if (issue.origin === 'string') {
        return Number(issue.minimum) <= 1
          ? encode('required')
          : encode('tooShort', { min: Number(issue.minimum) });
      }
      return encode('invalidChoice');
    case 'too_big':
      return issue.origin === 'string'
        ? encode('tooLong', { max: Number(issue.maximum) })
        : encode('invalidChoice');
    case 'invalid_format':
      return issue.format === 'email' ? encode('email') : encode('invalidFormat');
    case 'invalid_type':
      return issue.input === undefined || issue.input === null || issue.input === ''
        ? encode('required')
        : encode('invalidFormat');
    case 'invalid_value':
      return encode('invalidChoice');
    default:
      return encode('invalidFormat');
  }
}

/** react-hook-form with a zod schema from packages/contracts and localized messages. */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  defaultValues?: DefaultValues<z.input<S>>,
) {
  return useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(schema, { error: zodIssueToKey }),
    defaultValues,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });
}

/**
 * Puts the API's VALIDATION_FAILED issues on the matching fields. Returns false when the error is
 * not about fields, so the caller shows it as a form-level message.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T, unknown, unknown>,
  error: unknown,
  fields: readonly Path<T>[],
): boolean {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_FAILED') {
    return false;
  }
  const matched = error.fieldIssues.filter((issue) => fields.includes(issue.path as Path<T>));
  for (const issue of matched) {
    form.setError(issue.path as Path<T>, { message: 'validation.invalidFormat' });
  }
  return matched.length > 0;
}

/** The text for a field error key from zodIssueToKey or a schema's own key. */
export function useFieldErrorText() {
  const t = useTranslations();
  return (message: string | undefined): ReactNode => {
    if (!message) return null;
    const separator = message.indexOf('|');
    const key = separator === -1 ? message : message.slice(0, separator);
    let values: Record<string, string | number> = {};
    if (separator !== -1) {
      try {
        values = JSON.parse(message.slice(separator + 1)) as Record<string, string | number>;
      } catch {
        values = {};
      }
    }
    const safeKey = key.startsWith('validation.') && t.has(key) ? key : 'validation.invalidFormat';
    return t.rich(safeKey, { ...values, ...richTags });
  };
}

interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (describedBy: string | undefined) => ReactNode;
}

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="reih-field" data-invalid={error ? 'true' : undefined}>
      <label htmlFor={id}>{label}</label>
      {children(describedBy)}
      {hint && (
        <p id={hintId} className="reih-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="reih-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

/** A labelled input; its hint and error are announced with it. */
export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, hint, error, ...input },
  ref,
) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <input
          {...input}
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      )}
    </FieldShell>
  );
});

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
};

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(function SelectField(
  { label, hint, error, children, ...select },
  ref,
) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <select
          {...select}
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
});

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  label: ReactNode;
  error?: ReactNode;
};

export const CheckboxField = forwardRef<HTMLInputElement, CheckboxProps>(function CheckboxField(
  { label, error, ...input },
  ref,
) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="reih-field reih-checkbox" data-invalid={error ? 'true' : undefined}>
      <input
        {...input}
        ref={ref}
        id={id}
        type="checkbox"
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
      />
      <label htmlFor={id}>{label}</label>
      {error && (
        <p id={errorId} className="reih-field-error">
          {error}
        </p>
      )}
    </div>
  );
});

/**
 * After a submit with invalid fields, a summary takes the focus, so keyboard and screen-reader
 * users hear that something needs fixing (NFR-14).
 */
export function ErrorSummary<T extends FieldValues>({
  errors,
  submitCount,
}: {
  errors: FieldErrors<T>;
  submitCount: number;
}) {
  const t = useTranslations('validation');
  const ref = useRef<HTMLDivElement>(null);
  const hasErrors = Object.keys(errors).length > 0;
  useEffect(() => {
    if (hasErrors && submitCount > 0) {
      ref.current?.focus();
    }
  }, [hasErrors, submitCount]);
  if (!hasErrors || submitCount === 0) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="reih-alert" data-tone="error">
      {t('summary')}
    </div>
  );
}

/** A form-level message: an API refusal, or a confirmation. */
export function FormMessage({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  if (!children) return null;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className="reih-alert" data-tone={tone}>
      {children}
    </div>
  );
}

export function SubmitButton({
  pending,
  label,
  pendingLabel,
}: {
  pending: boolean;
  label: ReactNode;
  pendingLabel: ReactNode;
}) {
  return (
    <button type="submit" className="reih-primary" disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
