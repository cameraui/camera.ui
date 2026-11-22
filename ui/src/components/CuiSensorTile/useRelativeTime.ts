const MINUTE = 60_000;

export function useRelativeTime() {
  const { t, locale } = useI18n();
  const now = useNow({ scheduler: (tick) => useIntervalFn(tick, 30_000) });

  function timeAgo(time: number): string {
    const elapsed = now.value.getTime() - time;
    if (elapsed < MINUTE) return t('components.sensor_tile.just_now');
    const format = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto', style: 'short' });
    if (elapsed < 60 * MINUTE) return format.format(-Math.floor(elapsed / MINUTE), 'minute');
    if (elapsed < 24 * 60 * MINUTE) return format.format(-Math.floor(elapsed / (60 * MINUTE)), 'hour');
    return format.format(-Math.floor(elapsed / (24 * 60 * MINUTE)), 'day');
  }

  return { now, timeAgo };
}
