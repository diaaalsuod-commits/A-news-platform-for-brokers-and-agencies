const ERROR_NAME = /^\w{1,60}$/;
const ERROR_CODE = /^[A-Z0-9_]{1,40}$/;

const field = (value: unknown, name: string): unknown =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[name]
    : undefined;

/**
 * Every failed send, whichever email it was (NFR-08, NFR-11). The SMTP client's own message, its
 * server response and its lists of rejected addresses quote the recipient, so none of them is kept:
 * only the original error's name, its code (EENVELOPE, ECONNECTION) and the SMTP response code
 * (550). The original error is not kept as the cause either, so no log can reach its message.
 */
export class MailDeliveryError extends Error {
  override readonly name = 'MailDeliveryError';
  /** The name of the error the SMTP client threw, for example "Error". */
  readonly errorName?: string;
  /** The SMTP client's error code, for example "EENVELOPE" or "ECONNECTION". */
  readonly code?: string;
  /** The SMTP server's reply code, for example 550. */
  readonly responseCode?: number;

  constructor(failure: unknown) {
    super('Mail delivery failed');
    const name = field(failure, 'name');
    const code = field(failure, 'code');
    const responseCode = field(failure, 'responseCode');
    if (typeof name === 'string' && ERROR_NAME.test(name)) this.errorName = name;
    if (typeof code === 'string' && ERROR_CODE.test(code)) this.code = code;
    if (
      typeof responseCode === 'number' &&
      Number.isInteger(responseCode) &&
      responseCode >= 100 &&
      responseCode <= 599
    ) {
      this.responseCode = responseCode;
    }
  }
}
