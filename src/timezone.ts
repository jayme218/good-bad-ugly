export const EDITORIAL_TIMEZONE = 'America/Chicago'

export function editorialToday(now = new Date()) {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: EDITORIAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: EDITORIAL_TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now)

  return { iso, label }
}
