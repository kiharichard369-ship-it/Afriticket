export function formatKes(minorUnits: number): string {
  if (minorUnits === 0) return "Free";
  const major = minorUnits / 100;
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: major % 1 === 0 ? 0 : 2,
  }).format(major);
}
