export function formatQuantity(value: number, unit: string) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} ${unit}`;
}

export function getDaysUntil(dateString?: string) {
  if (!dateString) {
    return null;
  }

  const today = new Date("2026-06-13T00:00:00");
  const date = new Date(`${dateString}T00:00:00`);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}
