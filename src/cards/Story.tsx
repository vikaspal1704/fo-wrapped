import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { AnalysisResult, PeriodKind } from '../engine';
import { useT, type UiMessages } from '../app/i18n';
import { FileList } from '../app/Landing';
import type { FileStatus } from '../app/useAnalysis';
import { TheNumber } from './TheNumber';
import { WhereMoneyWent } from './WhereMoneyWent';
import { RightButBroke } from './RightButBroke';
import { ExpiryDay } from './ExpiryDay';
import { YourClock } from './YourClock';
import { RevengeTrades } from './RevengeTrades';
import { HoldingTime } from './HoldingTime';
import { BestWorstDay } from './BestWorstDay';
import { Summary } from './Summary';
import { WhatChanged } from './WhatChanged';
import { CardShare } from '../share/CardShare';
import { BusyDays, BuyerVsSeller, ChargesDrag, PositionSize, Underlyings, Weekday } from './ExtraCards';

interface Props {
  result: AnalysisResult;
  files: FileStatus[];
  onClear: () => void;
}

const SWIPE_PX = 40;

/** Story-style viewer: tap sides, swipe, or use arrow keys. */
const KIND_GROUPS: { kind: PeriodKind; label: keyof UiMessages }[] = [
  { kind: 'SAMVAT', label: 'kindSamvat' },
  { kind: 'FY', label: 'kindFy' },
  { kind: 'CALENDAR', label: 'kindCalendar' },
];

interface Slide {
  /** Stable ASCII id, used in share file names. */
  key: string;
  title: string;
  node: ReactNode;
}

export function Story({ result, files, onClear }: Props) {
  const t = useT();
  const [viewId, setViewId] = useState(result.defaultViewId);
  const view = result.views.find((v) => v.period.id === viewId) ?? result.views[0]!;
  const { cards } = view;
  // Cards that need trade times are hidden when the files have none (PRD D-22).
  const timed = (c: { status: string; code?: string }) => !(c.status === 'INSUFFICIENT_DATA' && c.code === 'NO_TRADE_TIMES');
  const hiddenForNoTimes = [cards.yourClock, cards.revengeTrades, cards.holdingTime, cards.buyerVsSeller, cards.busyDays].filter((c) => !timed(c)).length;
  const slides: Slide[] = [
    { key: 'the-number', title: t.tNumber, node: <TheNumber view={view} /> },
    { key: 'where-the-money-went', title: t.tMoney, node: <WhereMoneyWent card={cards.whereMoneyWent} /> },
    { key: 'right-but-broke', title: t.tRightBroke, node: <RightButBroke card={cards.rightButBroke} /> },
    { key: 'expiry-day', title: t.tExpiry, node: <ExpiryDay card={cards.expiryDay} /> },
    ...[
      { key: 'your-clock', title: t.tClock, ok: timed(cards.yourClock), node: <YourClock card={cards.yourClock} /> },
      { key: 'revenge-trades', title: t.tRevenge, ok: timed(cards.revengeTrades), node: <RevengeTrades card={cards.revengeTrades} /> },
      { key: 'holding-time', title: t.tHolding, ok: timed(cards.holdingTime), node: <HoldingTime card={cards.holdingTime} /> },
    ]
      .filter((x) => x.ok)
      .map(({ key, title, node }) => ({ key, title, node })),
    { key: 'best-worst-day', title: t.tBestWorst, node: <BestWorstDay card={cards.bestWorstDay} /> },
    // Extra cards only appear when there's enough data for them.
    ...[
      { key: 'buyer-or-seller', title: t.tBuyerSeller, ok: cards.buyerVsSeller.status === 'OK', node: <BuyerVsSeller card={cards.buyerVsSeller} /> },
      { key: 'what-you-traded', title: t.tUnderlyings, ok: cards.underlyings.status === 'OK', node: <Underlyings card={cards.underlyings} /> },
      { key: 'busy-days', title: t.tBusy, ok: cards.busyDays.status === 'OK', node: <BusyDays card={cards.busyDays} /> },
      { key: 'day-of-the-week', title: t.tWeekday, ok: cards.weekday.status === 'OK', node: <Weekday card={cards.weekday} /> },
      { key: 'position-size', title: t.tSize, ok: cards.positionSize.status === 'OK', node: <PositionSize card={cards.positionSize} /> },
      { key: 'charges-drag', title: t.tDrag, ok: cards.chargesDrag.status === 'OK', node: <ChargesDrag card={cards.chargesDrag} /> },
    ]
      .filter((x) => x.ok)
      .map(({ key, title, node }) => ({ key, title, node })),
    ...(view.comparison
      ? [{ key: 'what-changed', title: t.tChanged, node: <WhatChanged comparison={view.comparison} currentLabel={view.period.label} /> }]
      : []),
    {
      key: 'your-year',
      title: t.tYear,
      node: <Summary summary={cards.summary} view={view} versions={{ engine: result.engineVersion, rates: result.rateTableVersion }} onClear={onClear} />,
    },
  ];
  const [index, setIndex] = useState(0);
  const last = slides.length - 1;
  const go = useCallback((delta: number) => setIndex((i) => Math.min(last, Math.max(0, i + delta))), [last]);

  // Layout effect: the key listener is attached before the first paint, so
  // an arrow key pressed as soon as the card appears is never lost.
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const startX = useRef<number | null>(null);
  const swiped = useRef(false);
  const onPointerDown = (e: PointerEvent) => {
    startX.current = e.clientX;
    swiped.current = false;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > SWIPE_PX) {
      swiped.current = true;
      go(dx < 0 ? 1 : -1);
    }
  };
  const tap = (delta: number) => () => {
    if (!swiped.current) go(delta);
  };

  const rejected = files.filter((f) => !f.ok);
  const slide = slides[index]!;

  return (
    <main className="story">
      <div className="story-top">
        <div className="bars" aria-hidden="true">
          {slides.map((s, i) => (
            <span key={s.key} className={i <= index ? 'on' : ''} />
          ))}
        </div>
        <div className="story-meta">
          <label className="period-picker">
            <span className="sr-only">{t.period}</span>
            <select
              value={view.period.id}
              onChange={(e) => {
                setViewId(e.target.value);
                setIndex(0);
              }}
            >
              <option value="all">{result.views[0]!.period.label}</option>
              {KIND_GROUPS.map((g) => {
                const options = result.views.filter((v) => v.period.kind === g.kind && v.roundTripCount > 0);
                return options.length === 0 ? null : (
                  <optgroup key={g.kind} label={t[g.label] as string}>
                    {options.map((v) => (
                      <option key={v.period.id} value={v.period.id}>
                        {v.period.label}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>
          <span className="meta-actions">
            <span data-testid="slide-count">
              {index + 1} / {slides.length}
            </span>
            {index < last && (
              <button type="button" className="link" onClick={() => setIndex(last)} aria-label={t.skipLabel}>
                {t.skip}
              </button>
            )}
            <button type="button" className="link" onClick={onClear} aria-label={t.clearData}>
              {t.clear}
            </button>
          </span>
        </div>
      </div>

      <section
        className="card"
        aria-roledescription="slide"
        aria-label={t.slideLabel(index + 1, slides.length, slide.title)}
        aria-live="polite"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {index === 0 && rejected.length > 0 && (
          <div className="alert small">
            {rejected.length === 1 ? t.fileSkipped : t.filesSkipped(rejected.length)}
            <FileList files={rejected} />
          </div>
        )}
        {index === 0 && hiddenForNoTimes > 0 && (
          <p className="note" data-testid="no-times-note">
            {t.noTimesNote(hiddenForNoTimes)}
          </p>
        )}
        {slide.node}
        {index < last && (
          <CardShare
            key={`${view.period.id}-${slide.key}`}
            node={slide.node}
            title={slide.title}
            fileSlug={`${view.period.id}-${slide.key}`}
            periodTitle={view.title}
            siteUrl={cards.summary.siteUrl}
          />
        )}
        {index < last && (
          <>
            <button type="button" className="tap-zone prev" aria-label={t.prevCard} onClick={tap(-1)} disabled={index === 0} />
            <button type="button" className="tap-zone next" aria-label={t.nextCard} onClick={tap(1)} />
          </>
        )}
      </section>

      {index === last && (
        <button type="button" className="link back" onClick={() => go(-1)}>
          {t.back}
        </button>
      )}
    </main>
  );
}
