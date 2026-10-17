# r/IndiaInvestments post (launch)

Read the subreddit's self-promotion rules before posting. Post as a disclosed creator, and reply to questions with facts only.

**Title:** I built a free, open-source tool that turns your F&O tradebook into a year-in-review. It runs only in your browser.

**Body:**

Disclosure: I built this. It's free, MIT-licensed, and has no sign-up, ads or tracking.

F&O Wrapped reads your broker's trade file and shows your F&O year as cards: net P&L after charges, charges as a share of your gross profit, win rate next to average win and loss, expiry days vs other days, a 15-minute time-of-day breakdown, trades entered within 15 minutes of a large loss, and holding times for winners vs losers.

- **Brokers:** Zerodha tradebook (CSV or XLSX), plus the Console P&L statement for exact charges. Angel One, Upstox and Dhan are in beta.
- **Privacy:** your file is processed on your device and never uploaded. You can confirm it in your browser's Network tab, and the code is public.
- **Accuracy:** charges are estimated from a dated rate table unless your broker's file includes them. Positions that expired without a closing trade are left out, and the card tells you so.
- **What it isn't:** it describes your own past trades. It is not investment, trading or tax advice, and it makes no comparisons with other traders.

If your numbers differ from Console, I'd like to know: open a GitHub issue with only the percentage difference, no amounts.

Link: https://vikaspal1704.github.io/fo-wrapped/
