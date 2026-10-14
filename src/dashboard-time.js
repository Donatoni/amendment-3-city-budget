export const DASHBOARD_TIME_ZONE = 'America/New_York';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DASHBOARD_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const parts = value => Object.fromEntries(partsFormatter.formatToParts(new Date(value)).map(part => [part.type, part.value]));

export function dashboardDay(value = new Date()) {
  const { year, month, day } = parts(value);
  return `${year}-${month}-${day}`;
}

// Calendar arithmetic is independent of the length of a daylight-saving day.
export function shiftDay(day, count) {
  return new Date(Date.parse(day) + count * 86400000).toISOString().slice(0, 10);
}

export function dashboardDayStart(day) {
  const target = Date.parse(day);
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = parts(instant);
    const wallTime = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    const adjustment = target - wallTime;
    instant += adjustment;
    if (!adjustment) break;
  }
  return new Date(instant).toISOString();
}

export function dashboardDate(value, options = {}) {
  // Date-input values are calendar labels, not midnight UTC timestamps.
  const instant = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', ...options, timeZone: DASHBOARD_TIME_ZONE,
  }).format(new Date(instant));
}

export const dashboardTimestamp = value => dashboardDate(value, {
  year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
});
