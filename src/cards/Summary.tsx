import { useRef, useState } from 'react';
import type { CardSet, PeriodView } from '../engine';
import { SITE_LABEL } from '../config';
import { formatDate } from '../app/format';
import { download, renderPng, shareOrDownload } from '../share/exportImage';

interface Props {
  summary: CardSet['summary'];
  view: PeriodView;
  versions: { engine: string; rates: string };
  onClear: () => void;
}

function yearLabel(view: PeriodView): string {
  return view.title !== 'All trades' ? view.title : `${formatDate(view.dateRange.from)} – ${formatDate(view.dateRange.to)}`;
}

export function Summary({ summary, view, versions, onClear }: Props) {
  const imageRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const year = yearLabel(view);
  const fileName = `fo-wrapped-${year.toLowerCase().replace(/[^0-9a-z]+/g, '-').replace(/^-|-$/g, '')}.png`;

  const run = async (action: 'download' | 'share') => {
    if (!imageRef.current) return;
    setBusy(true);
    setStatus(null);
    try {
      const blob = await renderPng(imageRef.current);
      if (action === 'download') {
        download(blob, fileName);
        setStatus('Image saved.');
      } else {
        const how = await shareOrDownload(blob, fileName, `My F&O year, Wrapped · ${summary.siteUrl}`);
        setStatus(how === 'downloaded' ? 'Sharing isn’t available here, so the image was saved instead.' : null);
      }
    } catch {
      setStatus('Couldn’t create the image. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-body summary">
      <h2 className="card-title">Your year</h2>
      <p className="muted">My F&amp;O year · {year}</p>
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
          Download image
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => run('share')}>
          Share
        </button>
        <button type="button" className="link" onClick={onClear}>
          Clear data
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
        Engine {versions.engine} · rates {versions.rates}
      </p>

      {/* Off-screen 1080×1920 source for the PNG. Only the 3 headlines,
          the year and the site URL: no symbols, trades or account details. */}
      <div className="share-image" ref={imageRef} aria-hidden="true" data-testid="share-image">
        <p className="si-eyebrow">My F&amp;O year, Wrapped</p>
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
