import { ParsedFutureSourceItem } from './future-event-source.types';

export function parseBlsIcsEvents(
  text: string,
  options: {
    retrievedAt: string;
    sourceUrl: string;
    includeReleaseTypes?: string[];
  },
): ParsedFutureSourceItem[] {
  return extractVEvents(unfoldIcs(text))
    .map((event): ParsedFutureSourceItem | null => {
      const title = event.SUMMARY?.trim();
      const sourceItemId = event.UID?.trim();
      if (!title || !sourceItemId) return null;

      return {
        sourceType: 'bls' as const,
        sourceItemId,
        sourceUrl: event.URL?.trim() || options.sourceUrl,
        retrievedAt: options.retrievedAt,
        title,
        description: event.DESCRIPTION?.trim() || null,
        startTime: parseIcsDate(event.DTSTART),
        endTime: parseIcsDate(event.DTEND),
        timezone: 'UTC',
        raw: event,
      };
    })
    .filter((item): item is ParsedFutureSourceItem => Boolean(item))
    .filter((item) => matchesIncludeList(item, options.includeReleaseTypes ?? []));
}

export function parseBeaSchedule(
  html: string,
  options: { retrievedAt: string; sourceUrl: string; now?: Date },
): ParsedFutureSourceItem[] {
  const rows = extractTableRows(html);
  const currentYear = (options.now ?? new Date()).getUTCFullYear();
  const parsedRows = rows.length > 0 ? rows : parseBeaTextRows(html);

  return parsedRows
    .map((cells) => toBeaItem(cells, currentYear, options))
    .filter((item): item is ParsedFutureSourceItem => Boolean(item));
}

export function parseOpmHolidays(
  html: string,
  options: { retrievedAt: string; sourceUrl: string; now?: Date },
): ParsedFutureSourceItem[] {
  const year = (options.now ?? new Date()).getUTCFullYear();
  return parseOpmRows(extractOpmYearSection(html, year), year)
    .map((row) => toHolidayItem(row, year, options))
    .filter((item): item is ParsedFutureSourceItem => Boolean(item));
}

export function parseFomcCalendar(
  html: string,
  options: { retrievedAt: string; sourceUrl: string; now?: Date },
): ParsedFutureSourceItem[] {
  const year = (options.now ?? new Date()).getUTCFullYear();
  const yearSection = extractFomcYearSection(stripTags(html), year);
  const meetingMatches = extractFomcMeetingDates(yearSection);

  return meetingMatches.map((meeting) => {
    const month = parseMonthName(meeting.month) ?? 1;
    const [startDayRaw, endDayRaw] = meeting.dayRange.split('-');
    const startDay = Number(startDayRaw);
    const endDay = Number(endDayRaw ?? startDayRaw);
    const startDate = `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
    const title = `FOMC meeting ${meeting.month} ${startDay}${endDay !== startDay ? `-${endDay}` : ''}, ${year}`;

    return {
      sourceType: 'fomc' as const,
      sourceItemId: `fomc:${startDate}:${slug(title)}`,
      sourceUrl: options.sourceUrl,
      retrievedAt: options.retrievedAt,
      title,
      description: 'Federal Open Market Committee meeting',
      startTime: `${startDate}T00:00:00.000Z`,
      endTime: `${endDate}T23:59:59.000Z`,
      timezone: 'America/New_York',
      raw: { match: meeting.raw, year: String(year) },
    };
  });
}

function extractFomcYearSection(text: string, year: number) {
  const marker = `${year} FOMC Meetings`;
  const start = text.indexOf(marker);
  if (start < 0) return extractYearSection(text, year);

  const rest = text.slice(start);
  const nextMeetings = rest
    .slice(marker.length)
    .search(/\b\d{4}\s+FOMC Meetings\b/);
  return nextMeetings >= 0
    ? rest.slice(0, marker.length + nextMeetings)
    : rest;
}

function extractFomcMeetingDates(section: string) {
  const pattern =
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}(?:-\d{1,2})?)\*?(?=\s+(?:Statement:|Implementation Note|Press Conference|Projection Materials|Minutes:|[A-Z][a-z]+ \d{1,2}|\* Meeting|\d{4}\s+FOMC Meetings|$))/gi;
  const seen = new Set<string>();
  const meetings: Array<{ month: string; dayRange: string; raw: string }> = [];

  for (const match of section.matchAll(pattern)) {
    const key = `${match[1].toLowerCase()}:${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    meetings.push({
      month: match[1],
      dayRange: match[2],
      raw: match[0],
    });
  }

  return meetings;
}

function unfoldIcs(text: string) {
  return text.replace(/\r?\n[ \t]/g, '');
}

function extractVEvents(text: string): Record<string, string>[] {
  const events: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;

  for (const line of text.split(/\r?\n/)) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) continue;
    const key = line.slice(0, colonIndex).split(';')[0];
    current[key] = decodeIcsText(line.slice(colonIndex + 1));
  }

  return events;
}

function matchesIncludeList(
  item: ParsedFutureSourceItem,
  includeReleaseTypes: string[],
) {
  if (includeReleaseTypes.length === 0) return true;
  const haystack = `${item.title}\n${item.description ?? ''}`.toLowerCase();
  return includeReleaseTypes.some((releaseType) =>
    haystack.includes(releaseType.toLowerCase()),
  );
}

function parseIcsDate(value?: string) {
  if (!value) return null;
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/,
  );
  if (!match) return null;

  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  ).toISOString();
}

function decodeIcsText(value: string) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseBeaTextRows(html: string) {
  const lines = stripTags(html)
    .split(
      /(?=(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s+\d{1,2}:\d{2}\s+(?:AM|PM))/g,
    )
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const match = line.match(
      /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+(\d{1,2}:\d{2}\s+(?:AM|PM))\s+(.+)$/i,
    );
    return match ? [`${match[1]} ${match[2]} ${match[3]}`, match[4]] : [line];
  });
}

function toBeaItem(
  cells: string[],
  year: number,
  options: { retrievedAt: string; sourceUrl: string },
): ParsedFutureSourceItem | null {
  const dateCellIndex = cells.findIndex((cell) =>
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i.test(
      cell,
    ),
  );
  if (dateCellIndex < 0) return null;

  const dateMatch = cells[dateCellIndex].match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s+(\d{1,2}:\d{2}\s+(?:AM|PM)))?/i,
  );
  if (!dateMatch) return null;

  const month = parseMonthName(dateMatch[1]);
  const day = Number(dateMatch[2]);
  const clock = parseClock(dateMatch[3] ?? '') ?? { hour: 8, minute: 30 };
  if (!month || !Number.isFinite(day)) return null;

  const title = cells
    .slice(dateCellIndex + 1)
    .reverse()
    .find((cell) => cell && !/^News$/i.test(cell));
  if (!title) return null;

  return {
    sourceType: 'bea',
    sourceItemId: `bea:${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}:${slug(title)}`,
    sourceUrl: options.sourceUrl,
    retrievedAt: options.retrievedAt,
    title,
    description: cells.find((cell) => /^News$/i.test(cell)) ?? null,
    startTime: easternDateTimeToIso(year, month, day, clock.hour, clock.minute),
    endTime: null,
    timezone: 'America/New_York',
    raw: { cells: JSON.stringify(cells) },
  };
}

function parseOpmRows(html: string, year: number) {
  const section = stripTags(html);
  const rows: Array<{ dateText: string; title: string }> = [];
  const pattern =
    /((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})(?:,?\s+\d{4})?\s*\*{0,3}\s+(.+?)(?=(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}|$)/gi;

  for (const match of section.matchAll(pattern)) {
    const title = match[2]
      .replace(/^\s*\|\s*/, '')
      .replace(/\s*\*+\s*$/g, '')
      .trim();
    if (title && !/^(Date|Holiday|-)+$/i.test(title)) {
      rows.push({ dateText: match[1], title });
    }
  }
  return rows;
}

function extractOpmYearSection(html: string, year: number) {
  const headingPattern = new RegExp(
    `<h[1-6][^>]*>\\s*(?:<[^>]+>\\s*)*${year}\\s+Holiday\\s+Schedule[\\s\\S]*?<\\/h[1-6]>`,
    'i',
  );
  const heading = headingPattern.exec(html);
  if (!heading) {
    return extractYearSection(stripTags(html), year);
  }

  const start = heading.index;
  const rest = html.slice(start + heading[0].length);
  const nextHeading = rest.search(
    /<h[1-6][^>]*>[\s\S]*?\b\d{4}\s+Holiday\s+Schedule[\s\S]*?<\/h[1-6]>/i,
  );
  return nextHeading >= 0
    ? html.slice(start, start + heading[0].length + nextHeading)
    : html.slice(start);
}

function toHolidayItem(
  row: { dateText: string; title: string },
  year: number,
  options: { retrievedAt: string; sourceUrl: string },
): ParsedFutureSourceItem | null {
  const dateMatch = row.dateText.match(
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i,
  );
  if (!dateMatch) return null;

  const month = parseMonthName(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (!month || !Number.isFinite(day)) return null;

  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return {
    sourceType: 'opm',
    sourceItemId: `opm:${date}:${slug(row.title)}`,
    sourceUrl: options.sourceUrl,
    retrievedAt: options.retrievedAt,
    title: row.title,
    description: 'U.S. federal holiday',
    startTime: `${date}T00:00:00.000Z`,
    endTime: null,
    timezone: 'America/New_York',
    raw: { dateText: row.dateText, title: row.title },
  };
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value: string) {
  return normalizeWhitespace(decodeHtmlEntities(value.replace(/<[^>]*>/g, ' ')));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function extractTableRows(html: string) {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => stripTags(cell[1]))
      .filter(Boolean),
  );
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function easternDateTimeToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  const offsetHours = month >= 3 && month <= 11 ? 4 : 5;
  return new Date(
    Date.UTC(year, month - 1, day, hour + offsetHours, minute, 0),
  ).toISOString();
}

function parseMonthName(value: string) {
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const index = months.indexOf(value.toLowerCase());
  return index >= 0 ? index + 1 : undefined;
}

function parseClock(value: string) {
  const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return undefined;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return { hour, minute };
}

function extractYearSection(text: string, year: number) {
  const start = text.indexOf(String(year));
  if (start < 0) return text;
  const rest = text.slice(start);
  const nextYear = rest.search(new RegExp(`\\b${year + 1}\\b`));
  return nextYear > 0 ? rest.slice(0, nextYear) : rest;
}
