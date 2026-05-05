export function formatCurrencyIdr(amount: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
}

export function formatDurationMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  return `${hours} hour(s) ${remainingMinutes} minute(s)`;
}

export function calculateServerTimeOffsetMs(serverNow: string, localNowMs = Date.now()) {
  return new Date(serverNow).getTime() - localNowMs;
}
