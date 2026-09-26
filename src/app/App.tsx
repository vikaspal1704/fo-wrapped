import { useEffect, useState } from 'react';
import { Story } from '../cards/Story';
import { LocaleProvider, useLocale } from './i18n';
import { Landing } from './Landing';
import { Privacy } from './Privacy';
import { Progress } from './Progress';
import { useAnalysis } from './useAnalysis';

const PRIVACY_HASH = '#privacy';

/** The privacy page is a hash route so it works on static hosting and survives reloads. */
function usePrivacyRoute(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => window.location.hash === PRIVACY_HASH);
  useEffect(() => {
    const onHash = () => setOpen(window.location.hash === PRIVACY_HASH);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const set = (next: boolean) => {
    window.location.hash = next ? PRIVACY_HASH : '';
    setOpen(next);
  };
  return [open, set];
}

function Screens() {
  const { state, start, clear } = useAnalysis();
  const { locale } = useLocale();
  const [privacy, setPrivacy] = usePrivacyRoute();

  if (privacy && state.screen === 'landing') return <Privacy onBack={() => setPrivacy(false)} />;
  switch (state.screen) {
    case 'landing':
      return <Landing onFiles={start} onPrivacy={() => setPrivacy(true)} files={state.files} error={state.error?.[locale] ?? null} />;
    case 'working':
      return <Progress stage={state.stage} pct={state.pct} />;
    case 'cards':
      return <Story result={state.results[locale]} files={state.files} onClear={clear} />;
  }
}

export function App() {
  return (
    <LocaleProvider>
      <Screens />
    </LocaleProvider>
  );
}
