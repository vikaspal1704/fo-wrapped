import { useRef, useState } from 'react';
import type { CardSet, PeriodView } from '../engine';
import { SITE_LABEL } from '../config';
import { formatDate } from '../app/format';
import { download, renderPng, shareOrDownload } from '../share/exportImage';
import { useT } from '../app/i18n';

interface Props {
  summary: CardSet['summary'];
  view: PeriodView;
  versions: { engine: string; rates: string };
  onClear: () => void;
}

function yearLabel(view: PeriodView, months: readonly string[]): string {
  return view.period.kind !== 'ALL' || view.title !== view.period.label
    ? view.title
    : `${formatDate(view.dateRange.from, months)} – ${formatDate(view.dateRange.to, months)}`;
}

export function Summary({ summary, view, versions, onClear }: Props) {
  const t = useT();
  const imageRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const year = yearLabel(view, t.months);
  // File names use the ASCII period id (e.g. samvat-2082, fy-2026, all), whatever the display language.
  const fileName = `fo-wrapped-${view.period.id}.png`;

  const run = async (action: 'download' | 'share') => {
    if (!imageRef.current) return;
    setBusy(true);
    setStatus(null);
    try {
      const blob = await renderPng(imageRef.current);
      if (action === 'download') {
        download(blob, fileName);
        setStatus(t.imageSaved);
      } else {
        const how = await shareOrDownload(blob, fileName, t.shareText(summary.siteUrl));
        setStatus(how === 'downloaded' ? t.savedFallback : null);
      }
    } catch {
      setStatus(t.imageFailedRetry);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-body summary">
      <h2 className="card-title">{t.tYear}</h2>
      <p className="muted">{t.myYear(year)}</p>
      <dl className="headlines">
        {summary.headlines.map((h) => (
          <div key={h.label}>
            <dt>{h.label}</dt>
            <dd>{h.value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted site">{SITE_LABEL}</p>

      <div className="actions">
        <button type="button" className="primary" disabled={busy} onClick={() => run('download')}>
          {t.downloadImage}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => run('share')}>
          {t.shareSummary}
        </button>
        <button type="button" className="link" onClick={onClear}>
          {t.clearData}
        </button>
      </div>
      {status && (
        <p className="muted" role="status">
          {status}
        </p>
      )}
      {view.warnings.length > 0 && (
        <ul className="notes">
          {view.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <p className="muted version">
        {t.versions(versions.engine, versions.rates)}
      </p>

      {/* Off-screen 1080×1920 source for the PNG. Only the 3 headlines,
          the year and the site URL: no symbols, trades or account details. */}
      <div className="share-image" ref={imageRef} aria-hidden="true" data-testid="share-image">
        <p className="si-eyebrow">{t.siEyebrow}</p>
        <p className="si-year">{year}</p>
        <div className="si-stats">
          {summary.headlines.map((h) => (
            <div key={h.label}>
              <p className="si-label">{h.label}</p>
              <p className="si-value">{h.value}</p>
            </div>
          ))}
        </div>
        <p className="si-url">{SITE_LABEL}</p>
      </div>
    </div>
  );
}
