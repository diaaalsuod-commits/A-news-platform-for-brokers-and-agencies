import { Module } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { ENV, type Env } from '../config/index.js';
import { MAIL_TRANSPORT, MailService } from './mail.service.js';

const IMPLICIT_TLS_PORT = 465;

@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ENV],
      // D-03: any provider's SMTP, set by environment variables. Mailpit catches all mail in development.
      useFactory: (env: Env) =>
        nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === IMPLICIT_TLS_PORT,
          ...(env.SMTP_USER && env.SMTP_PASSWORD
            ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
            : {}),
        }),
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
