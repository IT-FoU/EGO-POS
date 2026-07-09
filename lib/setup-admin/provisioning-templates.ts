import type { BusinessTemplateType } from "@/features/platform/platform-data";

export type EgoAdminProvisioningTemplateKey = BusinessTemplateType | "clothes_rental" | "event_rental";

export type EgoAdminProvisioningTemplate = {
  enabled: boolean;
  features: string[];
  key: EgoAdminProvisioningTemplateKey;
  label: string;
  status: "Ready" | "Coming soon";
};

export const EGO_ADMIN_PROVISIONING_TEMPLATES: EgoAdminProvisioningTemplate[] = [
  { enabled: true, features: ["MVP provisioning ready"], key: "mini_mart", label: "Mini Mart", status: "Ready" },
  { enabled: false, features: ["Coming soon"], key: "restaurant", label: "Restaurant", status: "Coming soon" },
  { enabled: false, features: ["Coming soon"], key: "pharmacy", label: "Pharmacy", status: "Coming soon" },
  { enabled: false, features: ["Coming soon"], key: "clothing", label: "Clothes Shop", status: "Coming soon" },
  { enabled: false, features: ["Coming soon"], key: "wholesale_store", label: "Wholesale", status: "Coming soon" },
  { enabled: false, features: ["Coming soon"], key: "online_seller", label: "Online Seller", status: "Coming soon" },
  { enabled: false, features: ["Coming soon"], key: "clothes_rental", label: "Clothes Rental", status: "Coming soon" },
  { enabled: false, features: ["Coming soon"], key: "event_rental", label: "Event Rental", status: "Coming soon" },
];

export function isEgoAdminProvisioningTemplateKey(value: string): value is EgoAdminProvisioningTemplateKey {
  return EGO_ADMIN_PROVISIONING_TEMPLATES.some((template) => template.key === value);
}

export function isProvisionableTemplateKey(value: string) {
  const template = EGO_ADMIN_PROVISIONING_TEMPLATES.find((entry) => entry.key === value);
  return Boolean(template?.enabled);
}
