# X thread (launch, Muhurat trading, 8 Nov 2026)

Every post must stay true to what the app does today. Check against docs/SPEC.md §1.3 before posting. Attach the demo GIF to post 1 and a real share image to post 4.

1/ Samvat 2082 is closing. I built F&O Wrapped: drop your broker's trade file and see your F&O year as honest, shareable cards. Free, no sign-up, and your file never leaves your phone. vikaspal1704.github.io/fo-wrapped

2/ Works with Zerodha (tradebook plus the Console P&L statement for exact charges), and Angel One, Upstox and Dhan in beta. It runs entirely in your browser. You can check that in DevTools: the Network tab stays empty while it reads your file.

3/ What you see: net P&L after charges, what charges took from your gross, win rate next to average win and loss, expiry days vs other days, your time-of-day pattern, trades taken within 15 minutes of a big loss, and how long you held winners vs losers.

4/ The numbers are labelled for what they are. Charges are "estimated" unless they come from your broker's own file. Positions that expired without a closing trade are left out and named, never guessed.

5/ It describes your past trades only. It is not investment, trading or tax advice, and it makes no claims about anyone else's results.

6/ Open source (MIT): github.com/vikaspal1704/fo-wrapped. If a number doesn't match your Console P&L, open an issue with only the % difference. Correctness is the first priority.
