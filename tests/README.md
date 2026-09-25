# EGO POS QA suite

Run `npm run test:ego-qa`. The only permitted target is `https://egopos-qa.i-goto.workers.dev`; configuration rejects any other base URL. Put `EGO_QA_USERNAME` and `EGO_QA_PASSWORD` in the ignored `.env.test` file.

The default suite is read-only: it verifies workflow entry points and validation without completing sales, submitting cash movements, deleting records, or changing QA business data. Tests needing a restricted role are skipped until `EGO_QA_RESTRICTED_USERNAME` and `EGO_QA_RESTRICTED_PASSWORD` are provided. Future mutation coverage must be gated with `EGO_QA_MUTATION_TESTS=true`, create `TEST-` records, and clean only those records.

Artifacts are written to `playwright-report/`, `test-results/qa-results.json`, `test-results/artifacts/`, and `QA_REPORT.md`. Failed tests retain a screenshot, video, trace, console/page errors, current URL, and `failure-context.json`.
