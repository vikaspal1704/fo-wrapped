import { useRef, useState, type DragEvent } from 'react';
import { LanguageToggle, useLocale, useT } from './i18n';
import type { FileStatus } from './useAnalysis';

interface Props {
  onFiles: (files: File[]) => void;
  onPrivacy: () => void;
  files: FileStatus[];
  error: string | null;
}

const bold = (s: string) => <strong>{s}</strong>;

export function Landing({ onFiles, onPrivacy, files, error }: Props) {
  const t = useT();
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
      <div className="top-row">
        <p className="eyebrow">{t.eyebrow}</p>
        <LanguageToggle />
      </div>
      <h1>F&amp;O Wrapped</h1>
      <p className="tagline">{t.tagline}</p>

      <button type="button" className="drop" onClick={() => input.current?.click()}>
        {t.drop}
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
      <p className="privacy">
        <span aria-hidden="true">🔒 </span>
        {t.privacyLine}{' '}
        <button type="button" className="link" onClick={onPrivacy}>
          {t.howToCheck}
        </button>
      </p>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {files.length > 0 && <FileList files={files} />}

      <section aria-labelledby="how" className="how">
        <h2 id="how">{t.howTitle}</h2>
        {t.guides(bold).map((g, i) => (
          <details key={g.id} className="guide" open={i === 0}>
            <summary>{g.name}</summary>
            <ol>
              {g.steps.map((step, j) => (
                <li key={j}>{step}</li>
              ))}
            </ol>
            {g.note && <p className="guide-note">{g.note}</p>}
          </details>
        ))}
      </section>

      <footer className="footnote">
        <p>{t.footer1}</p>
        <p>
          {t.footer2}{' '}
          <button type="button" className="link" onClick={onPrivacy}>
            {t.privacyAbout}
          </button>
        </p>
      </footer>
    </main>
  );
}

export function FileList({ files }: { files: FileStatus[] }) {
  const t = useT();
  const { locale } = useLocale();
  const accepted = (f: FileStatus) =>
    f.statement ? t.statementRead(f.statement.from, f.statement.to) : t.tradesRead(f.rows ?? 0, f.broker ? t.brokerNames[f.broker] : '');
  return (
    <ul className="files" aria-label={t.filesLabel}>
      {files.map((f) => (
        <li key={f.name} className={f.ok ? 'ok' : 'bad'}>
          <span aria-hidden="true">{f.ok ? '✓' : '✕'}</span> <strong>{f.name}</strong>: {f.ok ? accepted(f) : f.message?.[locale]}
        </li>
      ))}
    </ul>
  );
}
