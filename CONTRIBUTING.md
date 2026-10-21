# Contributing

Use Node.js 22.12 or newer and install dependencies with `npm ci`.

```sh
npm run dev
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Tests use fixture CLI processes and do not require paid model accounts. A live CLI is needed to use the app with real answers.

- Keep UI text, documentation and commit messages in English.
- Preserve native CLI authentication, cancellation and permission handling.
- Do not commit `.env`, credentials, personal history, recordings of private conversations, generated build files or dependencies.
- Include relevant tests for changes to CLI protocols, research events or interaction behavior.
- Keep attribution and license notices for third-party assets.
