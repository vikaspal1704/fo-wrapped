import { toBlob } from 'html-to-image';

export const SHARE_WIDTH = 1080;
export const SHARE_HEIGHT = 1920;

/** Renders the share-image DOM node to a 1080×1920 PNG, entirely in the browser. */
export async function renderPng(node: HTMLElement): Promise<Blob> {
  const blob = await toBlob(node, {
    width: SHARE_WIDTH,
    height: SHARE_HEIGHT,
    pixelRatio: 1,
    // The node sits off-screen; reset that so it renders in frame.
    style: { position: 'static', left: '0', top: '0' },
  });
  if (!blob) throw new Error('Image export failed');
  return blob;
}

export function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  // Revoke after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Web Share with the image when the browser supports files; otherwise download. */
export async function shareOrDownload(blob: Blob, fileName: string, text: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], fileName, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    }
  }
  download(blob, fileName);
  return 'downloaded';
}
