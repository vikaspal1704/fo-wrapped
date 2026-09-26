import { REPO_URL } from '../config';

/** How the app protects data, and how to check that yourself (ROADMAP N8). */
export function Privacy({ onBack }: { onBack: () => void }) {
  return (
    <main className="landing page">
      <button type="button" className="link" onClick={onBack}>
        ← Back
      </button>
      <h1>Your data stays on your device</h1>

      <h2>What happens to your file</h2>
      <ul>
        <li>Your browser reads the file you pick. It is never uploaded; there is no server that could receive it.</li>
        <li>All the maths runs in a background thread (a Web Worker) inside this tab. The worker is shut down as soon as your cards are ready.</li>
        <li>Nothing is saved: no cookies, no local storage, no database. Closing the tab or pressing <strong>Clear data</strong> removes everything.</li>
        <li>There are no analytics, trackers, ads or third-party scripts.</li>
        <li>
          To work offline, your browser keeps a copy of this app’s own code (its HTML, scripts and icons). Your files and results are never put
          in that cache.
        </li>
      </ul>

      <h2>Check it yourself</h2>
      <ol>
        <li>
          <strong>Airplane-mode test:</strong> open this site, then switch off Wi-Fi and mobile data. Drop your tradebook: it still works, because
          nothing needs the internet. After your first visit you can even open the site offline, or install it to your home screen.
        </li>
        <li>
          <strong>Network tab:</strong> on a computer, open the browser’s developer tools (F12) → Network, then drop your file. You’ll see no request
          that carries your data.
        </li>
        <li>
          <strong>Read the code:</strong> everything is open source at{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            github.com/vikaspal1704/fo-wrapped
          </a>
          . A strict Content-Security-Policy stops the page from contacting any other website.
        </li>
      </ol>

      <h2>What the numbers are (and aren’t)</h2>
      <ul>
        <li>Charges are <strong>estimated</strong> from published rates unless you add your broker’s P&amp;L statement.</li>
        <li>Positions that expired or are still open are left out rather than guessed.</li>
        <li>This is a mirror of your own trades, not investment, trading or tax advice.</li>
      </ul>

      <h2>Not affiliated</h2>
      <p>
        F&amp;O Wrapped is an independent open-source project. It is not affiliated with, endorsed by or sponsored by Zerodha Broking Ltd, NSE, BSE or
        Spotify. “Zerodha” and “Console” are trademarks of their owners and are used only to describe which files work.
      </p>
    </main>
  );
}
