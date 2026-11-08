/** FR-ACC-01: a password has at least 10 characters. */
export const MIN_PASSWORD_LENGTH = 10;

export function isAcceptablePassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
