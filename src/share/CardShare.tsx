import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SITE_LABEL } from '../config';
import { renderPng, shareOrDownload } from './exportImage';
import { useT } from '../app/i18n';

interface Props {
  /** The card body to render into the image. */
  node: ReactNode;
  title: string;
  /** ASCII slug for the file name, e.g. 'fy-2026-right-but-broke'. */
  fileSlug: string;
  periodTitle: string;
  siteUrl: string;
}

/**
 * "Share this card" (ROADMAP X6). The card is rendered into an off-screen
 * 1080×1920 frame only while exporting, then removed, so there is never a
 * second copy of the card on the page for assistive tech. The image holds
 * what the card shows plus the period and site URL: no file names, symbols
 * beyond the card, or account details.
 */
export function CardShare({ node, title, fileSlug, periodTitle, siteUrl }: Props) {
  const t = useT();
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exporting || !frameRef.current) return;
    let cancelled = false;
    // Wait a frame so the frame's layout is complete before capture.
    requestAnimationFrame(async () => {
      try {
        const blob = await renderPng(frameRef.current!);
        const how = await shareOrDownload(blob, `fo-wrapped-${fileSlug}.png`, t.shareText(siteUrl));
        if (!cancelled) setStatus(how === 'downloaded' ? t.imageSaved : null);
      } catch {
        if (!cancelled) setStatus(t.imageFailed);
      } finally {
        if (!cancelled) setExporting(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [exporting, fileSlug, siteUrl, t]);

  return (
    <>
      <button type="button" className="card-share" disabled={exporting} onClick={() => setExporting(true)} aria-label={t.shareCard(title)}>
        {t.share}
      </button>
      {status && (
        <span className="card-share-status" role="status">
          {status}
        </span>
      )}
      {exporting && (
        <div className="share-frame" ref={frameRef} aria-hidden="true" data-testid="card-share-image">
          <div className="share-frame-card">{node}</div>
          <p className="si-url">
            {periodTitle} · {SITE_LABEL}
          </p>
        </div>
      )}
    </>
  );
}
