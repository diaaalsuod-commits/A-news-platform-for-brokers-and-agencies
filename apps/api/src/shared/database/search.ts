/** A LIKE pattern that matches the text anywhere, with %, _ and \ taken literally. */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
