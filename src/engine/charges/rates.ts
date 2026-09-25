import type { IstDate, Paise } from '../types';
import type { ChargeRateTable, RateWindow } from './types';

/**
 * Zerodha F&O charges (ARCHITECTURE §6.2).
 *
 * Only windows we could check are listed. A trade dated outside every window
 * makes charges "unavailable" instead of borrowing a nearby rate. Before
 * launch every window must be re-checked against the primary source and
 * marked 'primary'.
 */
const CHECKED_ON = '2026-09-25' as IstDate;
const FROM_2024_10 = '2024-10-01' as IstDate;
const TO_2026_03 = '2026-03-31' as IstDate;
const FROM_2026_04 = '2026-04-01' as IstDate;

const ZERODHA = 'https://zerodha.com/charges/';

function w<T>(value: T, source: string, effectiveFrom: IstDate = FROM_2024_10, effectiveTo?: IstDate): RateWindow<T> {
  return { effectiveFrom, ...(effectiveTo ? { effectiveTo } : {}), value, source, checked: 'secondary', checkedOn: CHECKED_ON };
}

const pct = (num: number, den: number) => ({ num, den });

export const RATES: ChargeRateTable = {
  version: '2026.09.1',
  indexUnderlyings: {
    NSE: ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYNXT50'],
    BSE: ['SENSEX', 'BANKEX', 'SENSEX50'],
  },
  brokerage: {
    // Zerodha charges ₹40 on some orders from 2026-04-01 when the account
    // falls short of the 50% cash-collateral rule; a tradebook can't show
    // that, so estimates use ₹20 and cards say "estimated".
    optionsPerOrderPaise: [w(2000 as Paise, ZERODHA)],
    futuresPerOrder: [w({ capPaise: 2000 as Paise, pct: pct(3, 10_000) }, ZERODHA)],
  },
  stt: {
    optionsSellOnPremium: [
      w(pct(1, 1_000), 'Finance (No. 2) Act 2024; Zerodha charges page', FROM_2024_10, TO_2026_03),
      w(pct(15, 10_000), 'Union Budget 2026; Zerodha bulletin 445377 (STT revision from 1 Apr 2026)', FROM_2026_04),
    ],
    futuresSell: [
      w(pct(2, 10_000), 'Finance (No. 2) Act 2024; Zerodha charges page', FROM_2024_10, TO_2026_03),
      w(pct(5, 10_000), 'Union Budget 2026; Zerodha bulletin 445377 (STT revision from 1 Apr 2026)', FROM_2026_04),
    ],
  },
  exchangeTxn: {
    NSE: {
      indexOptions: [w(pct(3503, 10_000_000), 'NSE: ₹35.03 per lakh of premium')],
      stockOptions: [w(pct(3503, 10_000_000), 'NSE: ₹35.03 per lakh of premium')],
      futures: [w(pct(173, 10_000_000), 'NSE: ₹1.73 per lakh of turnover')],
    },
    BSE: {
      indexOptions: [w(pct(325, 1_000_000), 'BSE: ₹32.50 per lakh of premium (Sensex, Bankex)')],
      stockOptions: [w(pct(5, 100_000), 'BSE: ₹5 per lakh of premium')],
      // Not yet checked: BSE futures trades make charges unavailable.
      futures: [],
    },
  },
  sebi: [w(pct(1, 1_000_000), 'SEBI turnover fee: ₹10 per crore')],
  stampDutyBuy: {
    options: [w(pct(3, 100_000), 'Indian Stamp Act: 0.003% on buy side')],
    futures: [w(pct(2, 100_000), 'Indian Stamp Act: 0.002% on buy side')],
  },
  gst: [w(pct(18, 100), 'GST 18% on brokerage + exchange charges + SEBI fees')],
};
