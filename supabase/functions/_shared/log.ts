/**
 * The only logger billing code may use (AC-2.1.8). It accepts a fixed set of
 * fields, so a payload, card, UPI or bank detail can't be logged by accident.
 */
export interface SafeLogFields {
  fn: 'razorpay-webhook' | 'create-subscription' | 'cancel-subscription' | 'delete-account' | 'weekly-reminder' | 'unsubscribe';
  outcome: string;
  eventId?: string;
  eventType?: string;
  count?: number;
}

export type SafeLog = (fields: SafeLogFields) => void;

export const consoleLog: SafeLog = (f) => {
  const line = { fn: f.fn, outcome: f.outcome, eventId: f.eventId, eventType: f.eventType, count: f.count };
  console.log(JSON.stringify(line));
};
