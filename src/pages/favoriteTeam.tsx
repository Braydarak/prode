import { useEffect, useMemo, useState } from "react";
import {
  getWorldCup2026Groups,
  type WorldCupGroup,
  type WorldCupGroupMatch,
  type WorldCupGroupTeam,
} from "../services";
import {
  getWorldCup2026LiveMatches,
  getWorldCup2026PlayedMatches,
  type WorldCupResultMatch,
} from "../services/results";
import Loader from "../components/loader";

type FavoriteTeamPageProps = {
  favoriteTeamKey: string | null;
  onFavoriteTeamChange: (teamKey: string | null) => void;
};

type FavoriteTeamOption = {
  key: string;
  name: string;
  badgeUrl: string | null;
};

type TeamStanding = {
  team: WorldCupGroupTeam;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

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

function normalizeStatus(status: string | null | undefined): string {
  return status?.trim().toUpperCase() ?? "";
}

function isLiveMatchStatus(status: string | null | undefined): boolean {
  const normalizedStatus = normalizeStatus(status);
  if (!normalizedStatus) {
    return false;
  }

  if (LIVE_MATCH_STATUSES.has(normalizedStatus)) {
    return true;
  }

  return /^\d{1,3}(\+\d{1,2})?'?$/.test(normalizedStatus);
}

function getMatchPeriodLabel(status: string): string | null {
  if (/^\d{1,3}(\+\d{1,2})?'?$/.test(status)) {
    const minute = Number.parseInt(status, 10);
    if (Number.isFinite(minute)) {
      if (minute <= 45) return "1T";
      if (minute <= 90) return "2T";
      if (minute <= 120) return "ET";
    }

    return "En juego";
  }

  switch (status) {
    case "1H":
    case "INPLAY_1ST_HALF":
      return "1T";
    case "2H":
    case "INPLAY_2ND_HALF":
      return "2T";
    case "ET":
      return "ET";
    case "P":
    case "PEN_LIVE":
      return "Penales";
    default:
      return null;
  }
}

function formatLiveMatchState(
  status: string | null | undefined,
): string | null {
  const normalizedStatus = normalizeStatus(status);
  if (!normalizedStatus) {
    return null;
  }

  if (/^\d{1,3}(\+\d{1,2})?'?$/.test(normalizedStatus)) {
    const period = getMatchPeriodLabel(normalizedStatus);
    return period ? `${normalizedStatus} · ${period}` : normalizedStatus;
  }

  switch (normalizedStatus) {
    case "HT":
      return "Entretiempo";
    case "BT":
      return "CB";
    case "INT":
      return "Pausa";
    case "P":
    case "PEN_LIVE":
      return "Penales";
    case "1H":
    case "INPLAY_1ST_HALF":
      return "En juego · 1T";
    case "2H":
    case "INPLAY_2ND_HALF":
      return "En juego · 2T";
    case "ET":
      return "En juego · ET";
    case "LIVE":
    case "IN PLAY":
    case "INPLAY":
      return "En juego";
    default:
      return normalizedStatus;
  }
}

function formatMatchDate(
  match: Pick<WorldCupGroupMatch, "timestamp" | "date" | "time">,
): string {
  const rawTimestamp = match.timestamp?.trim() ?? "";
  const raw =
    rawTimestamp ||
    (match.date
      ? `${match.date}T${match.time?.trim() ? match.time.trim() : "00:00:00"}Z`
      : "");
  const hasTimezone =
    raw.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(raw) || /[+-]\d{4}$/.test(raw);
  const normalizedRaw =
    raw && /^\d{4}-\d{2}-\d{2}T/.test(raw) && !hasTimezone ? `${raw}Z` : raw;
  const parsed = Date.parse(normalizedRaw);
  if (!Number.isFinite(parsed)) {
    return match.date ?? "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function getTeamKey(team: Pick<WorldCupGroupTeam, "id" | "name">): string {
  return team.id ?? team.name;
}

function getSortableMatchDate(
  match: Pick<WorldCupGroupMatch, "timestamp" | "date" | "time">,
): string {
  const rawTimestamp = match.timestamp?.trim() ?? "";
  if (rawTimestamp) return rawTimestamp;
  if (!match.date) return "";
  const time = match.time?.trim() ? match.time.trim() : "00:00:00";
  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
  return `${match.date}T${normalizedTime}Z`;
}

function buildGroupStandings(
  group: WorldCupGroup,
  playedMatches: WorldCupResultMatch[],
): TeamStanding[] {
  const resultsByMatchId = new Map(
    playedMatches.map((match) => [match.id, match] as const),
  );
  const standingsMap = new Map<string, TeamStanding>();

  for (const team of group.teams) {
    standingsMap.set(getTeamKey(team), {
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    });
  }

  for (const match of group.matches) {
    const result = resultsByMatchId.get(match.id);
    if (
      !result ||
      typeof result.homeTeam.score !== "number" ||
      typeof result.awayTeam.score !== "number"
    ) {
      continue;
    }

    const homeKey = getTeamKey(match.homeTeam);
    const awayKey = getTeamKey(match.awayTeam);
    const homeStanding = standingsMap.get(homeKey);
    const awayStanding = standingsMap.get(awayKey);
    if (!homeStanding || !awayStanding) continue;

    homeStanding.played += 1;
    awayStanding.played += 1;

    homeStanding.goalsFor += result.homeTeam.score;
    homeStanding.goalsAgainst += result.awayTeam.score;
    awayStanding.goalsFor += result.awayTeam.score;
    awayStanding.goalsAgainst += result.homeTeam.score;

    if (result.homeTeam.score > result.awayTeam.score) {
      homeStanding.won += 1;
      awayStanding.lost += 1;
      homeStanding.points += 3;
    } else if (result.homeTeam.score < result.awayTeam.score) {
      awayStanding.won += 1;
      homeStanding.lost += 1;
      awayStanding.points += 3;
    } else {
      homeStanding.drawn += 1;
      awayStanding.drawn += 1;
      homeStanding.points += 1;
      awayStanding.points += 1;
    }
  }

  return Array.from(standingsMap.values())
    .map((standing) => ({
      ...standing,
      goalDifference: standing.goalsFor - standing.goalsAgainst,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) {
        return b.goalDifference - a.goalDifference;
      }
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.team.name.localeCompare(b.team.name);
    });
}

function MatchCard({
  match,
  liveById,
  playedById,
  favoriteTeamKey,
}: {
  match: WorldCupGroupMatch;
  liveById: Map<string, WorldCupResultMatch>;
  playedById: Map<string, WorldCupResultMatch>;
  favoriteTeamKey: string | null;
}) {
  const live = liveById.get(match.id) ?? null;
  const played = playedById.get(match.id) ?? null;
  const activeMatch = live ?? played;
  const liveState = formatLiveMatchState(activeMatch?.status ?? match.status);
  const isLive = isLiveMatchStatus(activeMatch?.status ?? match.status);
  const isFavoriteHome =
    favoriteTeamKey !== null && getTeamKey(match.homeTeam) === favoriteTeamKey;
  const isFavoriteAway =
    favoriteTeamKey !== null && getTeamKey(match.awayTeam) === favoriteTeamKey;

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Grupo {match.group}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{formatMatchDate(match)}</p>
        </div>
        <span
          className={`shrink-0 rounded-md px-3 py-1 text-[11px] font-medium ${
            isLive
              ? "bg-emerald-100 text-emerald-700"
              : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {isLive ? (liveState ?? "En vivo") : (match.status ?? "Programado")}
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {match.homeTeam.badgeUrl ? (
              <img
                src={match.homeTeam.badgeUrl}
                alt={match.homeTeam.name}
                className="h-7 w-7 object-contain"
              />
            ) : (
              <div className="grid h-7 w-7 place-items-center rounded-md bg-zinc-100 text-[10px] font-bold text-zinc-700">
                {match.homeTeam.name.slice(0, 1)}
              </div>
            )}
            <span
              className={`truncate text-sm font-medium ${
                isFavoriteHome ? "text-amber-800" : "text-zinc-900"
              }`}
            >
              {match.homeTeam.name}
              {isFavoriteHome && <span className="text-amber-500"> ★</span>}
            </span>
          </div>
          <strong className="text-lg text-zinc-950">
            {activeMatch?.homeTeam.score ?? "-"}
          </strong>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {match.awayTeam.badgeUrl ? (
              <img
                src={match.awayTeam.badgeUrl}
                alt={match.awayTeam.name}
                className="h-7 w-7 object-contain"
              />
            ) : (
              <div className="grid h-7 w-7 place-items-center rounded-md bg-zinc-100 text-[10px] font-bold text-zinc-700">
                {match.awayTeam.name.slice(0, 1)}
              </div>
            )}
            <span
              className={`truncate text-sm font-medium ${
                isFavoriteAway ? "text-amber-800" : "text-zinc-900"
              }`}
            >
              {match.awayTeam.name}
              {isFavoriteAway && <span className="text-amber-500"> ★</span>}
            </span>
          </div>
          <strong className="text-lg text-zinc-950">
            {activeMatch?.awayTeam.score ?? "-"}
          </strong>
        </div>
      </div>

      <div className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
        {match.venue ?? "Sin estadio"} · {match.country ?? "Sin país"}
      </div>
    </article>
  );
}

export default function FavoriteTeamPage({
  favoriteTeamKey,
  onFavoriteTeamChange,
}: FavoriteTeamPageProps) {
  const [groups, setGroups] = useState<WorldCupGroup[]>([]);
  const [playedMatches, setPlayedMatches] = useState<WorldCupResultMatch[]>([]);
  const [liveMatches, setLiveMatches] = useState<WorldCupResultMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamQuery, setTeamQuery] = useState("");
  const [isTeamPickerOpen, setIsTeamPickerOpen] = useState(false);
  const [isTeamQueryFocused, setIsTeamQueryFocused] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);

        const [nextGroups, nextPlayed, nextLive] = await Promise.all([
          getWorldCup2026Groups(),
          getWorldCup2026PlayedMatches(),
          getWorldCup2026LiveMatches(),
        ]);

        if (!isMounted) return;
        setGroups(nextGroups);
        setPlayedMatches(nextPlayed);
        setLiveMatches(nextLive);
      } catch (loadError) {
        if (!isMounted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar la información de la selección favorita.",
        );
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const options = useMemo<FavoriteTeamOption[]>(() => {
    const byKey = new Map<string, FavoriteTeamOption>();

    for (const group of groups) {
      for (const team of group.teams) {
        const key = getTeamKey(team);
        if (!byKey.has(key)) {
          byKey.set(key, { key, name: team.name, badgeUrl: team.badgeUrl });
        }
      }
    }

    return Array.from(byKey.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
    );
  }, [groups]);

  const selectedGroup = useMemo(() => {
    if (!favoriteTeamKey) return null;
    return (
      groups.find((group) =>
        group.teams.some((team) => getTeamKey(team) === favoriteTeamKey),
      ) ?? null
    );
  }, [favoriteTeamKey, groups]);

  const standings = useMemo(() => {
    if (!selectedGroup) return [];
    return buildGroupStandings(selectedGroup, playedMatches);
  }, [playedMatches, selectedGroup]);

  const playedById = useMemo(
    () => new Map(playedMatches.map((match) => [match.id, match] as const)),
    [playedMatches],
  );

  const liveById = useMemo(
    () => new Map(liveMatches.map((match) => [match.id, match] as const)),
    [liveMatches],
  );

  const teamMatches = useMemo(() => {
    if (!selectedGroup || !favoriteTeamKey) return [];
    return selectedGroup.matches
      .filter((match) => {
        const homeKey = getTeamKey(match.homeTeam);
        const awayKey = getTeamKey(match.awayTeam);
        return homeKey === favoriteTeamKey || awayKey === favoriteTeamKey;
      })
      .sort((a, b) =>
        getSortableMatchDate(a).localeCompare(getSortableMatchDate(b)),
      );
  }, [favoriteTeamKey, selectedGroup]);

  const playedTeamMatches = useMemo(() => {
    return teamMatches.filter((match) => playedById.has(match.id));
  }, [playedById, teamMatches]);

  const pendingTeamMatches = useMemo(() => {
    return teamMatches.filter((match) => !playedById.has(match.id));
  }, [playedById, teamMatches]);

  const selectedTeam = useMemo(() => {
    if (!favoriteTeamKey) return null;
    return options.find((team) => team.key === favoriteTeamKey) ?? null;
  }, [favoriteTeamKey, options]);

  const filteredOptions = useMemo(() => {
    const query = teamQuery.trim().toLowerCase();
    if (!query) return options;
    return options.filter((team) => team.name.toLowerCase().includes(query));
  }, [options, teamQuery]);

  function normalizeTeamName(name: string): string {
    return name.trim().toLowerCase();
  }

  function resolveTeamByName(name: string): FavoriteTeamOption | null {
    const normalized = normalizeTeamName(name);
    if (!normalized) return null;
    return (
      options.find((team) => normalizeTeamName(team.name) === normalized) ??
      null
    );
  }

  function commitTeamSelection(name: string): boolean {
    const selected = resolveTeamByName(name);
    if (!selected) {
      if (!name.trim()) {
        onFavoriteTeamChange(null);
        return true;
      }
      return false;
    }

    onFavoriteTeamChange(selected.key);
    setTeamQuery(selected.name);
    return true;
  }

  function selectTeam(team: FavoriteTeamOption) {
    onFavoriteTeamChange(team.key);
    setTeamQuery(team.name);
    setIsTeamPickerOpen(false);
  }

  const displayedTeamQuery = isTeamQueryFocused
    ? teamQuery
    : (selectedTeam?.name ?? "");

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
          Selección favorita
        </p>
        <h2 className="text-2xl font-semibold text-zinc-950">
          Elegí tu equipo y seguí su grupo
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-zinc-600">
          Seleccioná una selección para ver su tabla de grupo y todos sus
          partidos (jugados y pendientes).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <Loader label="Cargando selección favorita..." />
      ) : (
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative min-w-[220px] flex-1 sm:min-w-[360px] sm:max-w-xl">
                <label className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                  Selección favorita
                </label>
                <input
                  value={displayedTeamQuery}
                  onFocus={() => {
                    setTeamQuery(selectedTeam?.name ?? "");
                    setIsTeamQueryFocused(true);
                    setIsTeamPickerOpen(true);
                  }}
                  onBlur={() => {
                    setIsTeamQueryFocused(false);
                    commitTeamSelection(teamQuery);
                    window.setTimeout(() => {
                      setIsTeamPickerOpen(false);
                    }, 120);
                  }}
                  onChange={(event) => {
                    setTeamQuery(event.target.value);
                    setIsTeamPickerOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setIsTeamPickerOpen(false);
                      (event.currentTarget as HTMLInputElement).blur();
                      return;
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const committed = commitTeamSelection(teamQuery);
                      if (!committed && filteredOptions.length > 0) {
                        selectTeam(filteredOptions[0]);
                      } else {
                        setIsTeamPickerOpen(false);
                        (event.currentTarget as HTMLInputElement).blur();
                      }
                    }
                  }}
                  placeholder="Escribí para buscar (ej: Argentina)"
                  className="mt-2 h-10 w-full rounded-xl border border-zinc-200 bg-white px-4 pr-14 text-sm font-semibold text-zinc-900 shadow-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-200 sm:h-11"
                  aria-label="Buscar selección favorita"
                  autoComplete="off"
                />
                {selectedTeam && (
                  <div className="pointer-events-none absolute bottom-2 right-3 flex h-8 w-8 items-center justify-center sm:bottom-1.5 sm:h-9 sm:w-9">
                    {selectedTeam.badgeUrl ? (
                      <img
                        src={selectedTeam.badgeUrl}
                        alt={selectedTeam.name}
                        className="h-7 w-7 object-contain sm:h-8 sm:w-8"
                      />
                    ) : (
                      <div className="grid h-7 w-7 place-items-center rounded-md bg-zinc-100 text-[10px] font-bold text-zinc-700 sm:h-8 sm:w-8">
                        {selectedTeam.name.slice(0, 1)}
                      </div>
                    )}
                  </div>
                )}

                {isTeamPickerOpen && filteredOptions.length > 0 && (
                  <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
                    {filteredOptions.slice(0, 12).map((team) => (
                      <button
                        key={team.key}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectTeam(team);
                        }}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition hover:bg-zinc-50 ${
                          team.key === favoriteTeamKey ? "bg-emerald-50/60" : ""
                        }`}
                      >
                        <span className="truncate font-semibold text-zinc-900">
                          {team.name}
                        </span>
                        {team.badgeUrl ? (
                          <img
                            src={team.badgeUrl}
                            alt={team.name}
                            className="h-6 w-6 shrink-0 object-contain"
                          />
                        ) : (
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-zinc-100 text-[10px] font-bold text-zinc-700">
                            {team.name.slice(0, 1)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {!favoriteTeamKey ? (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-8 text-sm text-zinc-600">
              Elegí una selección para ver su información.
            </div>
          ) : !selectedGroup ? (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-8 text-sm text-zinc-600">
              No se encontró el grupo de la selección seleccionada.
            </div>
          ) : (
            <div className="relative left-1/2 right-1/2 mx-[-50vw] w-screen">
              <div className="mx-auto w-full max-w-[1440px] px-4 md:px-8">
                <div className="grid gap-6 lg:gap-12 lg:grid-cols-[minmax(420px,1fr)_minmax(520px,680px)] lg:items-start">
                  <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm md:mt-15 mt-0">
                    <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                        Grupo {selectedGroup.name}
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-zinc-950">
                        Tabla
                      </h3>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-white text-zinc-500">
                          <tr className="border-b border-zinc-100">
                            <th className="px-4 py-3 text-left font-semibold">
                              POS
                            </th>
                            <th className="w-6 px-1 py-3 text-center font-semibold"></th>
                            <th className="px-4 py-3 text-left font-semibold">
                              Equipo
                            </th>
                            <th className="px-3 py-3 text-center font-semibold">
                              PTS
                            </th>
                            <th className="px-3 py-3 text-center font-semibold">
                              PJ
                            </th>
                            <th className="px-3 py-3 text-center font-semibold">
                              GF
                            </th>
                            <th className="px-3 py-3 text-center font-semibold">
                              GC
                            </th>
                            <th className="px-3 py-3 text-center font-semibold">
                              DG
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {standings.map((row, index) => {
                            const isFavorite =
                              getTeamKey(row.team) === favoriteTeamKey;
                            return (
                              <tr
                                key={getTeamKey(row.team)}
                                className={`border-b border-zinc-100 last:border-b-0 ${
                                  index < 3 ? "bg-emerald-50/60" : "bg-white"
                                }`}
                              >
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                                      index < 3
                                        ? "border border-emerald-300 text-emerald-700"
                                        : "text-zinc-700"
                                    }`}
                                  >
                                    {index + 1}
                                  </span>
                                </td>
                                <td className="w-6 px-1 py-3 text-center">
                                  <span
                                    className={`inline-block text-sm leading-none ${
                                      isFavorite
                                        ? "text-amber-500"
                                        : "invisible"
                                    }`}
                                  >
                                    ★
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    {row.team.badgeUrl ? (
                                      <img
                                        src={row.team.badgeUrl}
                                        alt={row.team.name}
                                        className="h-6 w-6 object-contain"
                                      />
                                    ) : (
                                      <div className="grid h-6 w-6 place-items-center rounded-md bg-zinc-100 text-[10px] font-bold text-zinc-700">
                                        {row.team.name.slice(0, 1)}
                                      </div>
                                    )}
                                    <span
                                      className={`truncate font-medium ${
                                        isFavorite
                                          ? "text-amber-900"
                                          : "text-zinc-900"
                                      }`}
                                    >
                                      {row.team.name}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-center font-semibold text-zinc-950">
                                  {row.points}
                                </td>
                                <td className="px-3 py-3 text-center text-zinc-700">
                                  {row.played}
                                </td>
                                <td className="px-3 py-3 text-center text-zinc-700">
                                  {row.goalsFor}
                                </td>
                                <td className="px-3 py-3 text-center text-zinc-700">
                                  {row.goalsAgainst}
                                </td>
                                <td className="px-3 py-3 text-center text-zinc-700">
                                  {row.goalDifference > 0
                                    ? `+${row.goalDifference}`
                                    : row.goalDifference}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                          Partidos
                        </p>
                      </div>
                    </div>

                    {pendingTeamMatches.length > 0 && (
                      <div className="space-y-3">
                        <div className="grid gap-4 md:grid-cols-2">
                          {pendingTeamMatches.map((match) => (
                            <MatchCard
                              key={match.id}
                              match={match}
                              playedById={playedById}
                              liveById={liveById}
                              favoriteTeamKey={favoriteTeamKey}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {playedTeamMatches.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-zinc-900">
                          Jugados
                        </p>
                        <div className="grid gap-4 md:grid-cols-2">
                          {playedTeamMatches
                            .slice()
                            .sort((a, b) =>
                              getSortableMatchDate(b).localeCompare(
                                getSortableMatchDate(a),
                              ),
                            )
                            .map((match) => (
                              <MatchCard
                                key={match.id}
                                match={match}
                                playedById={playedById}
                                liveById={liveById}
                                favoriteTeamKey={favoriteTeamKey}
                              />
                            ))}
                        </div>
                      </div>
                    )}

                    {teamMatches.length === 0 && (
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-8 text-sm text-zinc-600">
                        No hay partidos disponibles para esta selección.
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
