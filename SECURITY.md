# Security Policy

F&O Wrapped has no servers and stores nothing. The security questions that matter are whether the page could leak a user’s trade data, and whether a malicious file could harm the user.

## Reporting a vulnerability

Please **don’t open a public issue**. Use GitHub’s private reporting instead: **Security → Report a vulnerability** on this repository. Include steps to reproduce, but no real trade data.

We aim to acknowledge reports within 3 days and to fix confirmed issues that could leak data before anything else.

## In scope

- Any way for trade data to leave the device: network requests, storage, the service worker, the share image
- Weakening or bypassing the Content-Security-Policy
- Malicious CSV or XLSX files causing script execution, hangs or memory exhaustion
- Dependency vulnerabilities that are reachable from the app

## Out of scope

- Denial of service against GitHub Pages
- Problems that need a compromised device or browser
