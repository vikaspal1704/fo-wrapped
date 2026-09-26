import { describe, expect, it } from 'vitest';
import writeExcelFile from 'write-excel-file/node';
import { checkAccount } from '../../scripts/verify-real';

const csv = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const HEADER = 'symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time,expiry_date';
const TRADEBOOK = [
  HEADER,
  'NIFTY25N2024000CE,,2025-11-20,NSE,FO,,buy,false,75,100.00,1,11,2025-11-20T09:20:00,2025-11-20',
  'NIFTY25N2024000CE,,2025-11-20,NSE,FO,,sell,false,75,120.00,2,12,2025-11-20T10:20:00,2025-11-20',
].join('\n');

async function statement(realized: number, charges: number): Promise<ArrayBuffer> {
  const b = (...cells: (string | number | null)[]) => [null, ...cells];
  const rows = [
    b('P&L Statement for F&O from 2025-11-01 to 2025-11-30'),
    b('Charges', charges),
    b('Other Credit & Debit', 0),
    b('Realized P&L', realized),
    [],
    b('Account Head', 'Amount'),
    b('Brokerage - Z', charges),
  ];
  const buf: Buffer = await writeExcelFile(rows as never, { sheet: 'F&O' } as never).toBuffer();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('verify-real harness', () => {
  it('verify_real_passes_within_tolerance', async () => {
    // Gross ₹1,500; the estimate's charges are within a few rupees of ₹60.
    const est = await checkAccount([
      { name: 'tradebook.csv', bytes: csv(TRADEBOOK) },
      { name: 'pnl.xlsx', bytes: await statement(1500, 60) },
    ]);
    expect(est.grossDiffPct).toBe(0);
    expect(est.componentDiffPct.stt).toBeNull();
    expect(est.pass).toBe(est.netDiffPct <= 0.5);
  });

  it('verify_real_fails_outside_tolerance', async () => {
    const r = await checkAccount([
      { name: 'tradebook.csv', bytes: csv(TRADEBOOK) },
      { name: 'pnl.xlsx', bytes: await statement(1600, 60) },
    ]);
    expect(r.netDiffPct).toBeGreaterThan(0.5);
    expect(r.pass).toBe(false);
  });

  it('verify_real_needs_one_statement', async () => {
    await expect(checkAccount([{ name: 'tradebook.csv', bytes: csv(TRADEBOOK) }])).rejects.toThrow('exactly one P&L statement');
  });
});
