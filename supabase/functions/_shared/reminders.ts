/**
 * The weekly reminder email (docs/SPEC.md US-2.7). The report itself is built
 * on the device; the email only says it is ready. Its text is fixed: no
 * numbers, symbols or trades can be put into it (AC-2.7.2).
 */
import type { SafeLog } from './log.ts';

export interface ReminderEmail {
  subject: string;
  text: string;
}

export function reminderEmail(siteUrl: string, unsubscribeUrl: string): ReminderEmail {
  return {
    subject: 'Your weekly F&O Journal report is ready',
    text: [
      'Your weekly report is ready in F&O Journal.',
      'It is built on your own device from your saved history, so this email has no numbers in it.',
      '',
      `Open the Journal: ${siteUrl}#journal`,
      '',
      'Not investment, trading or tax advice.',
      `Stop these emails: ${unsubscribeUrl}`,
    ].join('\n'),
  };
}

export interface ReminderDeps {
  siteUrl: string;
  functionsUrl: string;
  /** Opted-in users whose plan is active. */
  listRecipients: () => Promise<{ email: string; token: string }[]>;
  send: (to: string, email: ReminderEmail) => Promise<void>;
  log: SafeLog;
}

export async function runWeeklyReminders(deps: ReminderDeps): Promise<number> {
  const recipients = await deps.listRecipients();
  let sent = 0;
  for (const r of recipients) {
    await deps.send(r.email, reminderEmail(deps.siteUrl, `${deps.functionsUrl}/unsubscribe?token=${encodeURIComponent(r.token)}`));
    sent++;
  }
  deps.log({ fn: 'weekly-reminder', outcome: 'sent', count: sent });
  return sent;
}

export async function handleUnsubscribe(token: string | null, turnOff: (token: string) => Promise<boolean>, log: SafeLog): Promise<{ status: number; body: string }> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return { status: 400, body: 'Invalid link.' };
  const ok = await turnOff(token);
  log({ fn: 'unsubscribe', outcome: ok ? 'done' : 'unknown token' });
  return ok ? { status: 200, body: 'You will not get weekly reminder emails any more.' } : { status: 404, body: 'This link is no longer valid.' };
}
