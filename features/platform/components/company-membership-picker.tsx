"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { getTemplateAwareEntryPath } from "@/lib/auth/store-post-login-redirect";

type CompanyMembershipOption = {
  businessTemplateKey: string;
  companyId: string;
  companyName: string;
  roleNames: string[];
  storeCode: string;
};

export function CompanyMembershipPicker({
  companies,
  openLabel,
  submittingLabel,
}: {
  companies: CompanyMembershipOption[];
  openLabel: string;
  submittingLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function openCompany(companyId: string) {
    startTransition(async () => {
      const response = await fetch("/api/auth/select-company", {
        body: JSON.stringify({ companyId }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        redirectTo?: string;
      } | null;

      if (!response.ok || !payload?.redirectTo) {
        return;
      }

      router.push(payload.redirectTo);
      router.refresh();
    });
  }

  return (
    <ul className="grid gap-3">
      {companies.map((company) => (
        <li className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3" key={company.companyId}>
          <div>
            <p className="font-semibold">{company.companyName}</p>
            <p className="text-sm text-muted-foreground">
              {company.storeCode} · {company.roleNames.join(", ")} · {company.businessTemplateKey}
            </p>
          </div>
          <button
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            disabled={isPending}
            onClick={() => openCompany(company.companyId)}
            type="button"
          >
            {isPending ? submittingLabel : openLabel}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function previewCompanyEntryPath(company: CompanyMembershipOption) {
  return getTemplateAwareEntryPath({
    allowBackOfficeAccess: true,
    allowPOSAccess: true,
    businessTemplateKey: company.businessTemplateKey,
    roles: company.roleNames,
  });
}
