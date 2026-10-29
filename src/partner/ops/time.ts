/** How long something has waited, in plain words: "3 days waiting". */
export function waitText(from: number, at = Date.now()): string {
  const minutes = Math.max(0, Math.round((at - from) / 60000));
  if (minutes < 1) return "Just arrived";
  if (minutes < 60) return `${minutes} min waiting`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} waiting`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} waiting`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} waiting`;
}
