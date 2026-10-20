# Security and privacy: what each part of F&O Wrapped and F&O Journal can see

Plain language first; the technical decisions are in [`adr/0002`](adr/0002-sync-encryption.md) and [`adr/0004`](adr/0004-billing-entitlements.md).

## Wrapped (free, no account)

- Your trade files are read and analysed inside your browser. Nothing is uploaded and nothing is stored.
- The page's security policy only lets it fetch the app's own files. Automated tests fail the build if any request leaves the site or carries anything from your file.
- Closing the tab, or pressing **Clear data**, removes everything.

## Journal, on your device

- When you press **Save on this device**, your imports, rules and notes are stored in this browser's storage (IndexedDB) on this device. Before that, nothing is stored.
- **Delete everything** removes it all and then checks that it is gone.
- Anyone who can use your browser profile can open your Journal, just as they could open your files. Lock your device.

## Journal sync (optional, paid)

| What | Who can see it |
|------|----------------|
| Your trades, notes and rules | **Only your devices.** They are encrypted in your browser with a key made from your sync passphrase before they are sent. |
| The encrypted copies | The server stores them but can't read them. Their IDs are scrambled too, so not even the contract names show. |
| Your passphrase | **Nobody else.** It is never stored or sent anywhere, the server included. |
| Your email and account ID | Supabase (our database host), to sign you in. |
| Your plan status (active, ends on…) | Supabase, set only by Razorpay's signed payment messages. |
| Card, UPI or bank details | **Only Razorpay.** You pay on Razorpay's own page; we never receive them, and our logs record only event IDs and types. |

**If you forget your passphrase,** nobody can recover your synced data, including us: that is the point of the encryption. Your data on each device is not affected. To start again, delete the synced copy from a device that still has your data, then sync with a new passphrase.

**Leaving is in your hands.**
- **Cancel subscription** stops renewal; the plan runs to the end of the period you paid for.
- **Delete the synced copy** removes your encrypted data and key profile from the server at any time, plan or no plan.
- **Delete my account** cancels any subscription at once, then deletes your account. That removes your plan, reminders and synced data with it.
- Data on your device stays until you press **Delete everything**, which works even after a plan ends.

**The weekly email** only tells you that your report is ready. The report is built on your device, so the email contains no numbers, contract names or trades.

## What this does not protect against

- Malware on your device, or someone using your unlocked browser.
- A weak passphrase. Use at least 12 characters (enforced), ideally a few random words.
- If our site's code were changed to steal passphrases, encryption in the browser couldn't stop it. The code is open source, and releases are built by GitHub Actions from public commits, so changes are visible.

## Reporting a problem

See [`SECURITY.md`](../SECURITY.md) for how to report a vulnerability privately.
