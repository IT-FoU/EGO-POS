export function formatLak(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function calculateAvailablePoints(earnedPoints: number, redeemedPoints: number) {
  return Math.max(earnedPoints - redeemedPoints, 0);
}

export function calculatePointsForSpend(valueLak: number) {
  return Math.floor(valueLak / 10000);
}
