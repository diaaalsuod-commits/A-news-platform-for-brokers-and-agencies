import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect } from '@playwright/test';

export const MAILPIT_API = `${process.env.MAILPIT_URL ?? 'http://localhost:8025'}/api/v1`;
const REPO_ROOT = resolve(import.meta.dirname, '../../..');

/**
 * A fresh invited Agency Admin, through the e2e:invite command (InvitationService in a Nest
 * application context; never an HTTP endpoint). The API's dev build provides dist/cli.
 */
export function inviteAgencyAdmin(language: 'en' | 'ar' = 'en'): { email: string } {
  const output = execSync(`pnpm --silent --filter @reih/api e2e:invite --language ${language}`, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const line = output.split('\n').find((entry) => entry.startsWith('E2E_INVITE '));
  if (!line) {
    throw new Error(`e2e:invite printed no result:\n${output}`);
  }
  return JSON.parse(line.slice('E2E_INVITE '.length)) as { email: string };
}

/** The activation link of the latest invitation email to this address, from Mailpit. */
export async function activationLinkFor(email: string): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:"${email}"`);
        const found = (await (await fetch(`${MAILPIT_API}/search?query=${query}`)).json()) as {
          messages: { ID: string }[];
        };
        id = found.messages[0]?.ID;
        return id;
      },
      { timeout: 20_000, message: `an invitation email to ${email}` },
    )
    .toBeTruthy();
  const message = (await (await fetch(`${MAILPIT_API}/message/${id}`)).json()) as {
    Text: string;
  };
  const link = /https:\/\/\S+\/activate#token=[A-Za-z0-9_-]{43}/.exec(message.Text)?.[0];
  expect(link, 'the invitation email carries an activation link').toBeTruthy();
  return link as string;
}
