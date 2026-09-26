import { REPO_URL } from '../config';
import { LanguageToggle, useT } from './i18n';

const bold = (s: string) => <strong>{s}</strong>;

/** How the app protects data, and how to check that yourself (ROADMAP N8). */
export function Privacy({ onBack }: { onBack: () => void }) {
  const t = useT();
  const repoLink = (
    <a href={REPO_URL} target="_blank" rel="noreferrer">
      github.com/vikaspal1704/fo-wrapped
    </a>
  );
  return (
    <main className="landing page">
      <div className="top-row">
        <button type="button" className="link" onClick={onBack}>
          {t.back}
        </button>
        <LanguageToggle />
      </div>
      <h1>{t.pTitle}</h1>

      <h2>{t.pWhatHappens}</h2>
      <ul>
        <li>{t.pW1}</li>
        <li>{t.pW2}</li>
        <li>{t.pW3(bold)}</li>
        <li>{t.pW4}</li>
        <li>{t.pW5}</li>
      </ul>

      <h2>{t.pCheck}</h2>
      <ol>
        <li>{t.pC1(bold)}</li>
        <li>{t.pC2(bold)}</li>
        <li>{t.pC3(bold, repoLink)}</li>
      </ol>

      <h2>{t.pNumbers}</h2>
      <ul>
        <li>{t.pN1(bold)}</li>
        <li>{t.pN2}</li>
        <li>{t.pN3}</li>
      </ul>

      <h2>{t.pAffiliation}</h2>
      <p>{t.pA1}</p>
      {t.pTranslation && <p className="muted">{t.pTranslation}</p>}
    </main>
  );
}
