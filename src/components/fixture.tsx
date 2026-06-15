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
import Loader from "./loader";

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

type GroupStanding = {
  groupName: string;
  standings: TeamStanding[];
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

function formatMatchDate(match: WorldCupGroupMatch): string {
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

function buildStandings(
  groups: WorldCupGroup[],
  results: WorldCupResultMatch[],
): GroupStanding[] {
  const resultsByMatchId = new Map(
    results.map((match) => [match.id, match] as const),
  );

  return groups.map((group) => {
    const standingsMap = new Map<string, TeamStanding>();

    for (const team of group.teams) {
      standingsMap.set(team.id ?? team.name, {
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

      const homeKey = match.homeTeam.id ?? match.homeTeam.name;
      const awayKey = match.awayTeam.id ?? match.awayTeam.name;
      const homeStanding = standingsMap.get(homeKey);
      const awayStanding = standingsMap.get(awayKey);

      if (!homeStanding || !awayStanding) {
        continue;
      }

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

    const standings = Array.from(standingsMap.values())
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

    return {
      groupName: group.name,
      standings,
    };
  });
}

function getTeamKey(team: Pick<WorldCupGroupTeam, "id" | "name">): string {
  return team.id ?? team.name;
}

export default function Fixture() {
  const [groups, setGroups] = useState<WorldCupGroup[]>([]);
  const [playedMatches, setPlayedMatches] = useState<WorldCupResultMatch[]>([]);
  const [liveMatches, setLiveMatches] = useState<WorldCupResultMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRound, setOpenRound] = useState<number>(1);

  useEffect(() => {
    let isMounted = true;

    async function loadFixture() {
      try {
        setIsLoading(true);
        setError(null);

        const [nextGroups, nextPlayedMatches, nextLiveMatches] =
          await Promise.all([
            getWorldCup2026Groups(),
            getWorldCup2026PlayedMatches(),
            getWorldCup2026LiveMatches(),
          ]);

        if (!isMounted) {
          return;
        }

        setGroups(nextGroups);
        setPlayedMatches(nextPlayedMatches);
        setLiveMatches(nextLiveMatches);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar el fixture del Mundial.",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadFixture();

    return () => {
      isMounted = false;
    };
  }, []);

  const standingsByGroup = useMemo(
    () => buildStandings(groups, playedMatches),
    [groups, playedMatches],
  );

  const rounds = useMemo(() => {
    return [1, 2, 3].map((round) => ({
      round,
      matches: groups
        .flatMap((group) => group.matches)
        .filter((match) => match.round === round)
        .sort((a, b) => {
          const dateA = a.timestamp ?? `${a.date ?? ""}T${a.time ?? ""}`;
          const dateB = b.timestamp ?? `${b.date ?? ""}T${b.time ?? ""}`;

          return dateA.localeCompare(dateB);
        }),
    }));
  }, [groups]);

  const playedMatchesById = useMemo(
    () => new Map(playedMatches.map((match) => [match.id, match] as const)),
    [playedMatches],
  );

  const liveMatchesById = useMemo(
    () => new Map(liveMatches.map((match) => [match.id, match] as const)),
    [liveMatches],
  );

  const liveScoreByTeamKey = useMemo(() => {
    const scores = new Map<string, string>();

    for (const match of liveMatches) {
      if (
        typeof match.homeTeam.score !== "number" ||
        typeof match.awayTeam.score !== "number"
      ) {
        continue;
      }

      const partialScore = `${match.homeTeam.score} - ${match.awayTeam.score}`;
      scores.set(getTeamKey(match.homeTeam), partialScore);
      scores.set(getTeamKey(match.awayTeam), partialScore);
    }

    return scores;
  }, [liveMatches]);

  return (
    <section className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <Loader label="Cargando fixture y posiciones..." />
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            {standingsByGroup.map((group) => (
              <article
                key={group.groupName}
                className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-4 py-3">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900">
                      Grupo {group.groupName}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Clasifican los puestos 1, 2 y 3.
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    {group.standings.length} equipos
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-white text-zinc-500">
                      <tr className="border-b border-zinc-100">
                        <th className="px-4 py-3 text-left font-semibold">#</th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Equipo
                        </th>
                        <th className="px-3 py-3 text-center font-semibold">
                          Estado
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
                      {group.standings.map((row, index) => {
                        const liveScore = liveScoreByTeamKey.get(
                          getTeamKey(row.team),
                        );

                        return (
                          <tr
                            key={row.team.id ?? row.team.name}
                            className={`border-b border-zinc-100 last:border-b-0 ${
                              index < 3 ? "bg-emerald-50/60" : "bg-white"
                            }`}
                          >
                            <td className="px-4 py-3 font-semibold text-zinc-700">
                              {index + 1}
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
                                <span className="font-medium text-zinc-900">
                                  {row.team.name}
                                </span>
                                {liveScore && (
                                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                    {liveScore}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center">
                              {index < 3 ? (
                                <span className="rounded-md bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                  Clasifica
                                </span>
                              ) : (
                                <span className="rounded-md bg-zinc-100 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                                  En juego
                                </span>
                              )}
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
              </article>
            ))}
          </div>

          <div className="mt-8 space-y-8">
            {rounds.map((roundData) => (
              <section key={roundData.round}>
                <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenRound(roundData.round)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-zinc-50"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                        Fase de grupos
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-zinc-950">
                        Fecha {roundData.round}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
                        {roundData.matches.length} partidos
                      </span>
                      <span className="text-lg font-semibold text-zinc-500">
                        {openRound === roundData.round ? "−" : "+"}
                      </span>
                    </div>
                  </button>

                  {openRound === roundData.round && (
                    <div className="border-t border-zinc-100 px-4 py-4">
                      {roundData.matches.length === 0 ? (
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-600">
                          No hay partidos cargados para esta fecha.
                        </div>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {roundData.matches.map((match) => {
                            const played = playedMatchesById.get(match.id);
                            const live = liveMatchesById.get(match.id);
                            const activeMatch = live ?? played;
                            const liveState = formatLiveMatchState(
                              live?.status ?? match.status,
                            );
                            const isLive = isLiveMatchStatus(
                              live?.status ?? match.status,
                            );

                            return (
                              <article
                                key={match.id}
                                className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                                      Grupo {match.group}
                                    </p>
                                    <p className="mt-1 text-xs text-zinc-500">
                                      {formatMatchDate(match)}
                                    </p>
                                  </div>
                                  <span
                                    className={`rounded-md px-3 py-1 text-[11px] font-medium ${
                                      isLive
                                        ? "bg-emerald-100 text-emerald-700"
                                        : "bg-zinc-100 text-zinc-600"
                                    }`}
                                  >
                                    {isLive
                                      ? (liveState ?? "En vivo")
                                      : (match.status ?? "Programado")}
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
                                      <span className="truncate text-sm font-medium text-zinc-900">
                                        {match.homeTeam.name}
                                      </span>
                                    </div>
                                    <strong className="text-base text-zinc-950">
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
                                      <span className="truncate text-sm font-medium text-zinc-900">
                                        {match.awayTeam.name}
                                      </span>
                                    </div>
                                    <strong className="text-base text-zinc-950">
                                      {activeMatch?.awayTeam.score ?? "-"}
                                    </strong>
                                  </div>
                                </div>

                                <div className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                                  {match.venue ?? "Sin estadio"} ·{" "}
                                  {match.country ?? "Sin país"}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
