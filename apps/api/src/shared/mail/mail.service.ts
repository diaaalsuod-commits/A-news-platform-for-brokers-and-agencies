import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Locale } from '@reih/i18n';
import type { Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/index.js';
import { MailDeliveryError } from './mail-delivery-error.js';
import { type MailTemplate, type MailTemplates, renderMail } from './templates.js';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

@Injectable()
export class MailService implements OnModuleDestroy {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: Transporter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** A failed send rejects with MailDeliveryError, which keeps no message and no address. */
  async send<T extends MailTemplate>(
    to: string,
    template: T,
    lang: Locale,
    params: MailTemplates[T],
  ): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.env.SMTP_FROM,
        to,
        ...renderMail(template, lang, params),
      });
    } catch (error) {
      // The one place every email goes through: what reaches a log names no recipient.
      throw new MailDeliveryError(error);
    }
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
