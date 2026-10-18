export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CHECK_INTERVAL_DAYS = 7;
export const DAMP_SOIL_RECHECK_DAYS = 2;

export function getNextCheckAt(
  lastWateredAt: number | null,
  lastSoilCheckAt: number | null,
): number {
  if (lastWateredAt === null) {
    return lastSoilCheckAt === null
      ? 0
      : lastSoilCheckAt + DAMP_SOIL_RECHECK_DAYS * DAY_MS;
  }
  if (lastSoilCheckAt && lastSoilCheckAt > lastWateredAt) {
    return lastSoilCheckAt + DAMP_SOIL_RECHECK_DAYS * DAY_MS;
  }
  return lastWateredAt + DEFAULT_CHECK_INTERVAL_DAYS * DAY_MS;
}
