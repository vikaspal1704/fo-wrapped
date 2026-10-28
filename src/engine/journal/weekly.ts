/**
 * The weekly report (docs/SPEC.md US-2.7), computed on the device from saved
 * history: one Monday–Sunday week in IST, reusing analyze() for totals and
 * cards so the numbers are exactly the ones the rest of the app shows.
 */
import { analyze, type ReportedCharges } from '../analyze';
import type { ChargeRateTable } from '../charges/types';
import { m } from '../i18n';
import type { PnlStatement } from '../parse/pnlStatement';
import { inPeriod, type Period } from '../periods';
import type { Fill, IstDate, Paise } from '../types';
import { insightsFor, type Insight } from './insights';
import { checkRules, type RuleBreach, type RuleGap, type Rules } from './rules';

const DAY_MS = 86_400_000;
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10) as IstDate;

/** The Monday–Sunday week containing `date` (pure date arithmetic, no time zone). */
export function weekOf(date: IstDate): Period {
  const ms = Date.parse(`${date}T00:00:00Z`);
  const weekday = (new Date(ms).getUTCDay() + 6) % 7; // Monday = 0
  const from = toDate(ms - weekday * DAY_MS);
  const to = toDate(ms + (6 - weekday) * DAY_MS);
  return { id: `week-${from}`, kind: 'WEEK', label: m().week(m().journalDay(from)), from, to };
}

export interface WeeklyReport {
  period: Period;
  trades: number;
  grossPnlPaise: Paise;
  chargesPaise: Paise | null;
  /** null when charges can't be estimated for the week; show P&L before charges instead. */
  netPnlPaise: Paise | null;
  chargesEstimated: boolean;
  breaches: RuleBreach[];
  gaps: RuleGap[];
  insights: Insight[];
  warnings: string[];
}

export function weeklyReport(input: {
  tradebooks: readonly (readonly Fill[])[];
  reportedCharges?: readonly ReportedCharges[];
  pnlStatements?: readonly PnlStatement[];
  rates: ChargeRateTable;
  rules: Rules;
  siteUrl: string;
  /** Any date in the wanted week; default: the week of the latest trade. */
  week?: IstDate;
}): WeeklyReport | null {
  const fills = input.tradebooks.flat();
  if (fills.length === 0) return null;
  const latest = fills.reduce((a, f) => (f.tradeDate > a ? f.tradeDate : a), fills[0]!.tradeDate);
  const period = weekOf(input.week ?? latest);
  const result = analyze({
    tradebooks: input.tradebooks,
    reportedCharges: input.reportedCharges,
    pnlStatements: input.pnlStatements,
    rates: input.rates,
    siteUrl: input.siteUrl,
    extraPeriods: [period],
  });
  const view = result.views.find((v) => v.period.id === period.id)!;
  const { breaches, gaps } = checkRules(result.roundTrips, input.rules);
  const inWeek = <T extends { date: IstDate }>(xs: readonly T[]) => xs.filter((x) => inPeriod(x.date, period));
  return {
    period,
    trades: view.roundTripCount,
    grossPnlPaise: view.totals.grossPnlPaise,
    chargesPaise: view.totals.charges?.total ?? null,
    netPnlPaise: view.totals.netPnlPaise,
    chargesEstimated: view.totals.source === 'ESTIMATED' || view.totals.source === 'MIXED',
    breaches: inWeek(breaches),
    gaps: inWeek(gaps),
    insights: view.roundTripCount > 0 ? insightsFor(view.cards) : [],
    warnings: view.warnings,
  };
}
