/** One refused field of a request: its path and the rule it broke, as VALIDATION_FAILED lists them. */
export interface Issue {
  path: string;
  code: string;
}
