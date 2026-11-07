import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Locale } from '@reih/i18n';
import type { Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/index.js';
import { type MailTemplate, type MailTemplates, renderMail } from './templates.js';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

@Injectable()
export class MailService implements OnModuleDestroy {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: Transporter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async send<T extends MailTemplate>(
    to: string,
    template: T,
    lang: Locale,
    params: MailTemplates[T],
  ): Promise<void> {
    await this.transport.sendMail({
      from: this.env.SMTP_FROM,
      to,
      ...renderMail(template, lang, params),
    });
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
