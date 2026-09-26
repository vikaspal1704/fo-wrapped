import { useRef, useState, type DragEvent } from 'react';
import type { FileStatus } from './useAnalysis';

interface Props {
  onFiles: (files: File[]) => void;
  onPrivacy: () => void;
  files: FileStatus[];
  error: string | null;
}

export function Landing({ onFiles, onPrivacy, files, error }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (list: FileList | null) => {
    const picked = list ? [...list] : [];
    if (picked.length > 0) onFiles(picked);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer.files);
  };

  return (
    <main
      className={`landing${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <p className="eyebrow">Your trading year, Wrapped</p>
      <h1>F&amp;O Wrapped</h1>
      <p className="tagline">Honest, shareable cards about your F&amp;O year: charges, win rate, expiry days, revenge trades and more.</p>

      <button type="button" className="drop" onClick={() => input.current?.click()}>
        Drop your tradebook
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
      <p className="privacy">
        <span aria-hidden="true">🔒 </span>Files are processed on your device and never uploaded.{' '}
        <button type="button" className="link" onClick={onPrivacy}>
          How to check
        </button>
      </p>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {files.length > 0 && <FileList files={files} />}

      <section aria-labelledby="how" className="how">
        <h2 id="how">How to download from Zerodha Console</h2>
        <ol>
          <li>
            Open <strong>console.zerodha.com</strong> and go to <strong>Reports → Tradebook</strong>.
          </li>
          <li>
            Choose segment <strong>F&amp;O</strong> and a date range of up to 365 days.
          </li>
          <li>
            Download as <strong>CSV</strong>. For more than a year, repeat and drop all the files together.
          </li>
        </ol>
      </section>

      <footer className="footnote">
        <p>Free and open source. No sign-up, no tracking. Not investment, trading or tax advice.</p>
        <p>
          Independent project, not affiliated with Zerodha, NSE or BSE.{' '}
          <button type="button" className="link" onClick={onPrivacy}>
            Privacy &amp; about
          </button>
        </p>
      </footer>
    </main>
  );
}

export function FileList({ files }: { files: FileStatus[] }) {
  return (
    <ul className="files" aria-label="Files">
      {files.map((f) => (
        <li key={f.name} className={f.ok ? 'ok' : 'bad'}>
          <span aria-hidden="true">{f.ok ? '✓' : '✕'}</span> <strong>{f.name}</strong>: {f.detail}
        </li>
      ))}
    </ul>
  );
}
