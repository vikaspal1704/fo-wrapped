/**
 * Landing screen (PRD §5 step 1). Upload, analysis and the cards arrive in
 * the next phase; the button stays disabled until then.
 */
export function App() {
  return (
    <main className="landing">
      <h1>F&amp;O Wrapped</h1>
      <p className="tagline">Your F&amp;O trading year, with honest numbers.</p>

      <button type="button" className="drop" disabled>
        Drop your tradebook <span className="soon">(coming soon)</span>
      </button>
      <p className="privacy">Files are processed on your device and never uploaded.</p>

      <section aria-labelledby="how">
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
    </main>
  );
}
