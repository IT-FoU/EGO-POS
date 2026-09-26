# EGO POS QA suite

Run `npm run test:ego-qa`. The only permitted target is `https://egopos-qa.i-goto.workers.dev`; configuration rejects any other base URL. Put `EGO_QA_USERNAME` and `EGO_QA_PASSWORD` in the ignored `.env.test` file.

The Phase 2 suite performs isolated QA business flows. It creates run-scoped `PWTEST_<timestamp>_` POS and restricted Cashier identities, products, and customers; balances test Cash In/Out movements; voids its own test sale; archives its own records; and closes a cash session only when the run-owned identity opened that session. It never closes or otherwise takes ownership of a pre-existing shared QA cash session. The suite prefers the QA Manager role and safely falls back to the built-in Cashier role if Manager is not configured. Purchasing remains an unsaved draft, and promotions remain read-only because the current contract has no safe draft status.

Set `EGO_QA_TEST_USERNAME_PREFIX` and `EGO_QA_TEST_PASSWORD` only in ignored `.env.test`; the suite appends its unique run ID and deactivates both identities during cleanup. Language coverage is English and Lao only; Thai is intentionally outside QA scope.

Artifacts are written to `playwright-report/`, `test-results/qa-results.json`, `test-results/artifacts/`, and `QA_REPORT.md`. Failed tests retain a screenshot, video, trace, console/page errors, current URL, and `failure-context.json`. The Markdown report includes every failure and blocked/skipped scenario, classified as `application defect`, `test/locator defect`, or `environment/data blocker`.
