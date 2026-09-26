/** Middle value; for an even count the mean of the two middle values, rounded half up. */
export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.floor((s[mid - 1]! + s[mid]! + 1) / 2);
}
