/**
 * FR-DAT-02: a sales contact's languages are typed as one line ("ar, en, ru") and sent as a list of
 * codes. Commas, spaces and Arabic commas separate them; empty parts are dropped. Each code is
 * checked by the contracts schema (two lower-case letters, each once), not here.
 */
export function parseLanguageList(text: unknown): string[] {
  if (Array.isArray(text)) return text.map(String);
  if (typeof text !== 'string') return [];
  return text
    .split(/[\s,،]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== '');
}

/** The list as it is shown in the field: "ar, en". */
export function formatLanguageList(codes: readonly string[]): string {
  return codes.join(', ');
}
