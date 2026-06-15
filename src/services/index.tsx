const THESPORTSDB_BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";

const WORLD_CUP_2026 = {
  leagueId: "4429",
  season: "2026",
  groupStageRounds: [1, 2, 3] as const,
};

export type SportsDbEvent = {
  idEvent: string;
  idHomeTeam: string | null;
  idAwayTeam: string | null;
  strHomeTeam: string;
  strAwayTeam: string;
  strHomeTeamBadge: string | null;
  strAwayTeamBadge: string | null;
  strGroup: string | null;
  intRound: string | number | null;
  intHomeScore: string | number | null;
  intAwayScore: string | number | null;
  dateEvent: string | null;
  strTime: string | null;
  strTimestamp: string | null;
  strVenue: string | null;
  strCountry: string | null;
  strStatus: string | null;
  strResult: string | null;
};

type SportsDbEventsResponse = {
  events: SportsDbEvent[] | null;
};

export type WorldCupGroupTeam = {
  id: string | null;
  name: string;
  badgeUrl: string | null;
};

export type WorldCupGroupMatch = {
  id: string;
  group: string;
  round: number | null;
  date: string | null;
  time: string | null;
  timestamp: string | null;
  venue: string | null;
  country: string | null;
  status: string | null;
  homeTeam: WorldCupGroupTeam;
  awayTeam: WorldCupGroupTeam;
};

export type WorldCupGroup = {
  name: string;
  teams: WorldCupGroupTeam[];
  matches: WorldCupGroupMatch[];
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const sportsDbCache = new Map<string, CacheEntry<unknown>>();
const sportsDbInflight = new Map<string, Promise<unknown>>();
let sportsDbQueue: Promise<void> = Promise.resolve();
let sportsDbNextAvailableAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function scheduleSportsDbRequest(minGapMs: number): Promise<void> {
  sportsDbQueue = sportsDbQueue.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, sportsDbNextAvailableAt - now);

    if (waitMs) {
      await sleep(waitMs);
    }

    sportsDbNextAvailableAt = Date.now() + minGapMs;
  });

  return sportsDbQueue;
}

function getRetryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;

  const trimmed = header.trim();
  if (!trimmed) return null;

  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }

  const asDate = Date.parse(trimmed);
  if (!Number.isFinite(asDate)) return null;

  return Math.max(0, asDate - Date.now());
}

async function fetchWithRetry(
  url: string,
  init: RequestInit | undefined,
  retries: number,
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await scheduleSportsDbRequest(1100);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 8000);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      if (response.ok) {
        return response;
      }

      const retryable =
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;

      if (!retryable || attempt >= retries) {
        return response;
      }

      lastError = new Error(
        `TheSportsDB request failed with status ${response.status}`,
      );

      const retryAfterMs =
        response.status === 429 ? getRetryAfterMs(response) : null;
      const backoffMs = 350 * 2 ** attempt;
      await sleep(Math.max(backoffMs, retryAfterMs ?? 0));
    } catch (error) {
      lastError = error;

      if (attempt >= retries) {
        break;
      }

      const backoffMs = 350 * 2 ** attempt;
      await sleep(backoffMs);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("TheSportsDB request failed.");
}

async function fetchSportsDb<T>(
  path: string,
  options?: { cacheTtlMs?: number },
): Promise<T> {
  const cacheTtlMs = options?.cacheTtlMs ?? 5 * 60 * 1000;
  const cacheKey = path;
  const cached = sportsDbCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const inflight = sportsDbInflight.get(cacheKey);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const request = (async () => {
    const response = await fetchWithRetry(
      `${THESPORTSDB_BASE_URL}/${path}`,
      undefined,
      3,
    );

    if (!response.ok) {
      throw new Error(
        `TheSportsDB request failed with status ${response.status}`,
      );
    }

    const data = (await response.json()) as T;
    sportsDbCache.set(cacheKey, {
      value: data,
      expiresAt: Date.now() + cacheTtlMs,
    });
    return data;
  })();

  sportsDbInflight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    sportsDbInflight.delete(cacheKey);
  }
}

async function getEventsByRound(round: number): Promise<SportsDbEvent[]> {
  const params = new URLSearchParams({
    id: WORLD_CUP_2026.leagueId,
    r: String(round),
    s: WORLD_CUP_2026.season,
  });

  const data = await fetchSportsDb<SportsDbEventsResponse>(
    `eventsround.php?${params.toString()}`,
  );

  return data.events ?? [];
}

function parseNullableNumber(value: string | number | null): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeTimeToHms(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "00:00:00";
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

function hasTimezoneSuffix(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.endsWith("Z")) return true;
  return /[+-]\d{2}:\d{2}$/.test(trimmed) || /[+-]\d{4}$/.test(trimmed);
}

export function getSportsDbEventUtcTimestamp(
  event: Pick<SportsDbEvent, "strTimestamp" | "dateEvent" | "strTime">,
): string | null {
  const timestamp = event.strTimestamp?.trim() ?? "";
  if (timestamp) {
    if (hasTimezoneSuffix(timestamp)) return timestamp;
    if (/^\d{4}-\d{2}-\d{2}T/.test(timestamp)) return `${timestamp}Z`;
    return timestamp;
  }

  const date = event.dateEvent?.trim() ?? "";
  if (!date) return null;

  const time = event.strTime ? normalizeTimeToHms(event.strTime) : "00:00:00";
  return `${date}T${time}Z`;
}

function getMatchSortableTimestamp(match: {
  timestamp: string | null;
  date: string | null;
  time: string | null;
}): string {
  const raw = match.timestamp?.trim() ?? "";
  if (raw) {
    if (hasTimezoneSuffix(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return `${raw}Z`;
    return raw;
  }

  const date = match.date?.trim() ?? "";
  if (!date) return "";
  const time = match.time ? normalizeTimeToHms(match.time) : "00:00:00";
  return `${date}T${time}Z`;
}

function createTeam(team: {
  id: string | null;
  name: string;
  badgeUrl: string | null;
}): WorldCupGroupTeam {
  return {
    id: team.id,
    name: team.name,
    badgeUrl: team.badgeUrl,
  };
}

function getTeamKey(team: WorldCupGroupTeam): string {
  return team.id ?? team.name;
}

export async function getWorldCup2026GroupStageEvents(): Promise<
  SportsDbEvent[]
> {
  const events: SportsDbEvent[] = [];

  for (const round of WORLD_CUP_2026.groupStageRounds) {
    const roundEvents = await getEventsByRound(round);
    events.push(...roundEvents);
  }

  return events;
}

export async function getWorldCup2026Groups(): Promise<WorldCupGroup[]> {
  const events = await getWorldCup2026GroupStageEvents();

  const groupsMap = new Map<
    string,
    {
      teams: Map<string, WorldCupGroupTeam>;
      matches: WorldCupGroupMatch[];
    }
  >();

  for (const event of events) {
    if (!event.strGroup) {
      continue;
    }

    const groupName = event.strGroup.trim();
    const homeTeam = createTeam({
      id: event.idHomeTeam,
      name: event.strHomeTeam,
      badgeUrl: event.strHomeTeamBadge,
    });
    const awayTeam = createTeam({
      id: event.idAwayTeam,
      name: event.strAwayTeam,
      badgeUrl: event.strAwayTeamBadge,
    });

    const currentGroup = groupsMap.get(groupName) ?? {
      teams: new Map<string, WorldCupGroupTeam>(),
      matches: [],
    };

    currentGroup.teams.set(getTeamKey(homeTeam), homeTeam);
    currentGroup.teams.set(getTeamKey(awayTeam), awayTeam);
    currentGroup.matches.push({
      id: event.idEvent,
      group: groupName,
      round: parseNullableNumber(event.intRound),
      date: event.dateEvent,
      time: event.strTime,
      timestamp: getSportsDbEventUtcTimestamp(event),
      venue: event.strVenue,
      country: event.strCountry,
      status: event.strStatus,
      homeTeam,
      awayTeam,
    });

    groupsMap.set(groupName, currentGroup);
  }

  return Array.from(groupsMap.entries())
    .sort(([groupA], [groupB]) => groupA.localeCompare(groupB))
    .map(([name, group]) => ({
      name,
      teams: Array.from(group.teams.values()).sort((teamA, teamB) =>
        teamA.name.localeCompare(teamB.name),
      ),
      matches: group.matches.sort((matchA, matchB) => {
        return getMatchSortableTimestamp(matchA).localeCompare(
          getMatchSortableTimestamp(matchB),
        );
      }),
    }));
}
