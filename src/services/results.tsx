import {
  getSportsDbEventUtcTimestamp,
  getWorldCup2026GroupStageEvents,
  type SportsDbEvent,
} from "./index";

const FINAL_MATCH_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO", "AP"]);
const LIVE_MATCH_STATUSES = new Set([
  "LIVE",
  "1H",
  "2H",
  "HT",
  "ET",
  "BT",
  "P",
  "INT",
  "IN PLAY",
  "INPLAY",
  "INPLAY_1ST_HALF",
  "INPLAY_2ND_HALF",
  "PEN_LIVE",
]);

export type WorldCupResultTeam = {
  id: string | null;
  name: string;
  badgeUrl: string | null;
  score: number | null;
};

export type WorldCupResultMatch = {
  id: string;
  group: string;
  round: number | null;
  date: string | null;
  time: string | null;
  timestamp: string | null;
  venue: string | null;
  country: string | null;
  status: string | null;
  resultText: string | null;
  homeTeam: WorldCupResultTeam;
  awayTeam: WorldCupResultTeam;
};

export type WorldCupResultsByGroup = {
  name: string;
  matches: WorldCupResultMatch[];
};

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

function normalizeStatus(status: string | null | undefined): string {
  return status?.trim().toUpperCase() ?? "";
}

function isPlayedMatch(event: SportsDbEvent): boolean {
  const homeScore = parseNullableNumber(event.intHomeScore);
  const awayScore = parseNullableNumber(event.intAwayScore);
  const normalizedStatus = normalizeStatus(event.strStatus);

  if (FINAL_MATCH_STATUSES.has(normalizedStatus)) {
    return true;
  }

  if (!normalizedStatus) {
    return homeScore !== null && awayScore !== null;
  }

  return false;
}

function isLiveMatch(event: SportsDbEvent): boolean {
  const normalizedStatus = normalizeStatus(event.strStatus);
  if (!normalizedStatus) {
    return false;
  }

  if (LIVE_MATCH_STATUSES.has(normalizedStatus)) {
    return true;
  }

  return /^\d{1,3}(\+\d{1,2})?'?$/.test(normalizedStatus);
}

function getSortableDate(match: WorldCupResultMatch): string {
  if (match.timestamp) return match.timestamp;
  if (!match.date) return "";
  const time = match.time?.trim() ? match.time.trim() : "00:00:00";
  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
  return `${match.date}T${normalizedTime}Z`;
}

function mapEventToResult(event: SportsDbEvent): WorldCupResultMatch {
  const homeScore = parseNullableNumber(event.intHomeScore);
  const awayScore = parseNullableNumber(event.intAwayScore);

  return {
    id: event.idEvent,
    group: event.strGroup?.trim() ?? "Sin grupo",
    round: parseNullableNumber(event.intRound),
    date: event.dateEvent,
    time: event.strTime,
    timestamp: getSportsDbEventUtcTimestamp(event),
    venue: event.strVenue,
    country: event.strCountry,
    status: event.strStatus,
    resultText: event.strResult,
    homeTeam: {
      id: event.idHomeTeam,
      name: event.strHomeTeam,
      badgeUrl: event.strHomeTeamBadge,
      score: homeScore,
    },
    awayTeam: {
      id: event.idAwayTeam,
      name: event.strAwayTeam,
      badgeUrl: event.strAwayTeamBadge,
      score: awayScore,
    },
  };
}

export async function getWorldCup2026PlayedMatches(): Promise<
  WorldCupResultMatch[]
> {
  const events = await getWorldCup2026GroupStageEvents();

  return events
    .filter(isPlayedMatch)
    .map(mapEventToResult)
    .sort((matchA, matchB) =>
      getSortableDate(matchA).localeCompare(getSortableDate(matchB)),
    );
}

export async function getWorldCup2026LiveMatches(): Promise<WorldCupResultMatch[]> {
  const events = await getWorldCup2026GroupStageEvents();

  return events
    .filter(isLiveMatch)
    .map(mapEventToResult)
    .sort((matchA, matchB) =>
      getSortableDate(matchA).localeCompare(getSortableDate(matchB)),
    );
}

export async function getWorldCup2026ResultsByGroup(): Promise<
  WorldCupResultsByGroup[]
> {
  const matches = await getWorldCup2026PlayedMatches();
  const groupsMap = new Map<string, WorldCupResultMatch[]>();

  for (const match of matches) {
    const groupMatches = groupsMap.get(match.group) ?? [];
    groupMatches.push(match);
    groupsMap.set(match.group, groupMatches);
  }

  return Array.from(groupsMap.entries())
    .sort(([groupA], [groupB]) => groupA.localeCompare(groupB))
    .map(([name, groupMatches]) => ({
      name,
      matches: groupMatches.sort((matchA, matchB) =>
        getSortableDate(matchA).localeCompare(getSortableDate(matchB)),
      ),
    }));
}
