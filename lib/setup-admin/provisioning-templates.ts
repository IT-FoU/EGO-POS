import type { BusinessTemplateType } from "@/features/platform/platform-data";

export type EgoAdminProvisioningTemplateKey = BusinessTemplateType | "rental";

export type EgoAdminProvisioningTemplate = {
  enabled: boolean;
  key: EgoAdminProvisioningTemplateKey;
  label: string;
};

export const EGO_ADMIN_PROVISIONING_TEMPLATES: EgoAdminProvisioningTemplate[] = [
  { enabled: true, key: "mini_mart", label: "Mini Mart" },
  { enabled: true, key: "restaurant", label: "Restaurant" },
  { enabled: true, key: "pharmacy", label: "Pharmacy" },
  { enabled: true, key: "clothing", label: "Clothes Shop" },
  { enabled: true, key: "wholesale_store", label: "Wholesale" },
  { enabled: true, key: "online_seller", label: "Online Seller" },
  { enabled: false, key: "rental", label: "Rental (LP-5)" },
];

export function isEgoAdminProvisioningTemplateKey(value: string): value is EgoAdminProvisioningTemplateKey {
  return EGO_ADMIN_PROVISIONING_TEMPLATES.some((template) => template.key === value);
}

export function isProvisionableTemplateKey(value: string) {
  const template = EGO_ADMIN_PROVISIONING_TEMPLATES.find((entry) => entry.key === value);
  return Boolean(template?.enabled);
}
