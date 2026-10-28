# LinkedIn post (launch)

I've built **F&O Wrapped**, a free "year in review" for Indian F&O traders, launching for Muhurat trading on 8 Nov 2026.

You drop in your broker's trade file (Zerodha, or Angel One, Upstox and Dhan in beta) and get a set of cards about your trading year: net P&L after charges, what charges took from your gross profit, win rate next to average win and loss, expiry-day results, time-of-day patterns, and holding times.

Three engineering choices I care about:

- **Privacy by construction.** Parsing and analysis run in a Web Worker in your browser. There is no backend, and a strict Content-Security-Policy blocks the page from sending data anywhere. Automated browser tests fail the build if any request carries file data.
- **Correctness first.** Money is integer paise and every timestamp is IST. Round trips are matched FIFO, and charges come from a dated rate table. The public launch waits until net P&L matches Zerodha Console within 0.5% on five real accounts.
- **Honest labels.** Estimated charges say "estimated". Expired positions without a closing trade are left out and named, never guessed.

It describes past trades only: it is not investment, trading or tax advice.

Try it: https://vikaspal1704.github.io/fo-wrapped/
Code (MIT): https://github.com/vikaspal1704/fo-wrapped
