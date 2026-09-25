import { Story } from '../cards/Story';
import { Landing } from './Landing';
import { Progress } from './Progress';
import { useAnalysis } from './useAnalysis';

export function App() {
  const { state, start, clear } = useAnalysis();
  switch (state.screen) {
    case 'landing':
      return <Landing onFiles={start} files={state.files} error={state.error} />;
    case 'working':
      return <Progress stage={state.stage} pct={state.pct} />;
    case 'cards':
      return <Story result={state.result} files={state.files} onClear={clear} />;
  }
}
