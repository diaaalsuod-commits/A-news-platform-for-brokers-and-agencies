import { messages } from '@reih/i18n';

/** The rule codes the API names in VALIDATION_FAILED that have their own message. */
const SERVER_CODES = new Set(Object.keys(messages.en.validation.server));

/**
 * The message key for one refused field from the API's VALIDATION_FAILED issues: a missing value
 * reads "required", a rule the content endpoints name (outside_uae, other_developer, archived…)
 * has its own message, and anything else reads "not in the expected format".
 */
export function serverIssueKey(code: string): string {
  if (code === 'too_small' || code === 'required') return 'validation.required';
  return SERVER_CODES.has(code) ? `validation.server.${code}` : 'validation.invalidFormat';
}

/**
 * The form field an issue belongs to: its own path when the form has it, otherwise the top-level
 * field it is part of ("center.lng" → "center", "languages.0" → "languages"); null when the form
 * has neither, so the caller shows the refusal as a form-level message.
 */
export function issueField(path: string, fields: readonly string[]): string | null {
  if (fields.includes(path)) return path;
  const top = path.split('.')[0] ?? '';
  return top !== '' && fields.includes(top) ? top : null;
}
