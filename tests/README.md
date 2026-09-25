# EGO POS QA suite

Run `npm run test:ego-qa`. The only permitted target is `https://egopos-qa.i-goto.workers.dev`; configuration rejects any other base URL. Put `EGO_QA_USERNAME` and `EGO_QA_PASSWORD` in the ignored `.env.test` file.

The Phase 2 suite performs isolated QA business flows. It creates only `TEST-` prefixed products/customers, balances test Cash In/Out movements, voids its own test sale, archives its own records, and closes a cash session only when the test opened that session. It never closes or otherwise takes ownership of a pre-existing shared QA cash session. Purchasing remains an unsaved draft, and promotions remain read-only because the current contract has no safe draft status.

Tests needing a restricted role are skipped until `EGO_QA_RESTRICTED_USERNAME` and `EGO_QA_RESTRICTED_PASSWORD` are supplied in `.env.test`. Language coverage is English and Lao only; Thai is intentionally outside QA scope.

Artifacts are written to `playwright-report/`, `test-results/qa-results.json`, `test-results/artifacts/`, and `QA_REPORT.md`. Failed tests retain a screenshot, video, trace, console/page errors, current URL, and `failure-context.json`. The Markdown report includes every failure and blocked/skipped scenario, classified as `application defect`, `test/locator defect`, or `environment/data blocker`.
