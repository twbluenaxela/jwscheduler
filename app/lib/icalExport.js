// Pure iCalendar (.ics) generator — no React, no fetch.
// Produces RFC-5545 VCALENDAR output for one person's upcoming assignments.
// Taiwan Standard Time (UTC+8) is hardcoded — no DST.

function parseAssignmentDate(dateStr) {
  const s = String(dateStr ?? '');
  const cn = s.match(/(\d+)月\s*(\d+)日/);
  if (cn) {
    const now = new Date();
    let yr = now.getFullYear();
    const mo = +cn[1];
    if (mo < now.getMonth() + 1 - 6) yr++;
    else if (mo > now.getMonth() + 1 + 6) yr--;
    return { year: yr, month: mo, day: +cn[2] };
  }
  const sl = s.match(/^(\d+)\/(\d+)$/);
  if (sl) {
    const now = new Date();
    let yr = now.getFullYear();
    const mo = +sl[1];
    if (mo < now.getMonth() + 1 - 6) yr++;
    else if (mo > now.getMonth() + 1 + 6) yr--;
    return { year: yr, month: mo, day: +sl[2] };
  }
  return null;
}

function extractTime(weekdayPill) {
  const m = String(weekdayPill ?? '').match(/(\d{1,2}):(\d{2})/);
  if (m) return { hour: parseInt(m[1]), min: parseInt(m[2]) };
  return { hour: 19, min: 30 }; // default midweek
}

function isWeekendSlot(dateStr, weekdayPill) {
  // Weekend: date is M/D slash format OR weekdayPill is empty/undefined
  return !weekdayPill || String(dateStr ?? '').match(/^\d+\/\d+$/);
}

// Format as YYYYMMDDTHHMMSS (local time, Taiwan UTC+8)
function icalDateTime(year, month, day, hour, min) {
  const pad = n => String(n).padStart(2, '0');
  return `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(min)}00`;
}

function addMinutes(hour, min, delta) {
  const total = hour * 60 + min + delta;
  return { hour: Math.floor(total / 60) % 24, min: total % 60 };
}

function escapeIcal(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// assignments: [{ date, label, context, weekdayPill }] — same shape as collectUpcomingAssignments
// congCode: congregation code string for stable UIDs
export function generateIcal(assignments, personName, congCode = 'jwscheduler') {
  const DURATION = 105; // 1h45m in minutes
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//JW Scheduler//${escapeIcal(personName)}//ZH`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-TIMEZONE:Asia/Taipei',
  ];

  for (const a of assignments) {
    const parsed = parseAssignmentDate(a.date);
    if (!parsed) continue;

    const weekend = isWeekendSlot(a.date, a.weekdayPill);
    const { hour, min } = weekend ? { hour: 10, min: 0 } : extractTime(a.weekdayPill);
    const end = addMinutes(hour, min, DURATION);

    const dtStart = icalDateTime(parsed.year, parsed.month, parsed.day, hour, min);
    const dtEnd   = icalDateTime(parsed.year, parsed.month, parsed.day, end.hour, end.min);

    const uidBase = `${parsed.year}${String(parsed.month).padStart(2,'0')}${String(parsed.day).padStart(2,'0')}-${encodeURIComponent(a.label)}-${encodeURIComponent(personName)}@${congCode}`;
    const summary = escapeIcal(a.label);
    const desc = a.context ? escapeIcal(`${a.label} — ${a.context}`) : summary;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uidBase}`,
      `DTSTART;TZID=Asia/Taipei:${dtStart}`,
      `DTEND;TZID=Asia/Taipei:${dtEnd}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcal(icalStr, filename) {
  const blob = new Blob([icalStr], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
