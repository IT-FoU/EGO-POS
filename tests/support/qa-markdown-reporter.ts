import fs from "node:fs";
import path from "node:path";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

type Count = { passed: number; failed: number; skipped: number };

export default class QaMarkdownReporter implements Reporter {
  private results: Array<{ test: TestCase; result: TestResult }> = [];
  onTestEnd(test: TestCase, result: TestResult) { this.results.push({ test, result }); }
  onEnd() {
    const totals: Count = { passed: 0, failed: 0, skipped: 0 };
    const modules = new Map<string, Count>();
    const nonPasses: string[] = [];
    for (const { test, result } of this.results) {
      const module = test.parent?.title || "Uncategorised";
      const counts = modules.get(module) ?? { passed: 0, failed: 0, skipped: 0 };
      const status = result.status === "passed" ? "passed" : result.status === "skipped" || result.status === "interrupted" ? "skipped" : "failed";
      totals[status]++; counts[status]++; modules.set(module, counts);
      if (status === "failed") {
        const error = (result.error?.message || "No error message supplied").replace(/\n/g, " ").slice(0, 1000);
        const evidence = result.attachments.find((item) => item.name === "failure-context" || item.name === "screenshot" || item.name === "trace")?.path || "test-results/artifacts";
        const classification = /locator|strict mode|element.*not found|timeout.*expect/i.test(error)
          ? "test/locator defect"
          : /ERR_NETWORK_ACCESS_DENIED|could not connect|credential|401|403|database|seed|no products|missing QA/i.test(error)
            ? "environment/data blocker"
            : "application defect";
        nonPasses.push(`| ${module} | ${test.title} | Scenario completes without an application or automation error. | Scenario failed. | ${classification} | ${error.replace(/\|/g, "\\|")} | ${evidence} |`);
      } else if (status === "skipped") {
        const reason = (test.annotations.find((annotation) => annotation.type === "skip")?.description || "Scenario was skipped.").replace(/\n/g, " ");
        nonPasses.push(`| ${module} | ${test.title} | Required QA data and credentials are available. | Scenario blocked/skipped. | environment/data blocker | ${reason.replace(/\|/g, "\\|")} | — |`);
      }
    }
    const total = totals.passed + totals.failed + totals.skipped;
    const moduleRows = [...modules.entries()].map(([name, c]) => `| ${name} | ${c.passed} | ${c.failed} | ${c.skipped} |`).join("\n");
    const nonPassRows = nonPasses.length ? nonPasses.join("\n") : "| — | — | — | — | — | — | — |";
    fs.writeFileSync(path.resolve("QA_REPORT.md"), `# EGO POS QA Report\n\nTarget: https://egopos-qa.i-goto.workers.dev\n\nResult: ${totals.failed ? "FAIL" : "PASS"}\n\n| Total | Passed | Failed | Skipped |\n| ---: | ---: | ---: | ---: |\n| ${total} | ${totals.passed} | ${totals.failed} | ${totals.skipped} |\n\n## Modules\n\n| Module | Passed | Failed | Skipped |\n| --- | ---: | ---: | ---: |\n${moduleRows}\n\n## Failures and blocked scenarios\n\nEvery non-pass is classified as an application defect, test/locator defect, or environment/data blocker. Inspect retained evidence before filing.\n\n| Module | Scenario | Expected result | Actual result | Classification | Error / blocker | Evidence location |\n| --- | --- | --- | --- | --- | --- | --- |\n${nonPassRows}\n`);
  }
}
