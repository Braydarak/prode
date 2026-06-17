import wc26Logo from "../assets/WC26_Logo.png";
import type { WorldCupKnockoutMatch } from "../services";
import type { WorldCupResultMatch } from "../services/results";

type BracketProps = {
  matches: WorldCupKnockoutMatch[];
  playedMatches?: WorldCupResultMatch[];
  liveMatches?: WorldCupResultMatch[];
  favoriteTeamKey?: string | null;
};

type TeamLineProps = {
  name: string;
  badgeUrl: string | null;
  score: number | null;
  compact?: boolean;
  highlight?: boolean;
};

function getMatchResult(
  matchId: string,
  liveById: Map<string, WorldCupResultMatch>,
  playedById: Map<string, WorldCupResultMatch>,
): WorldCupResultMatch | null {
  return liveById.get(matchId) ?? playedById.get(matchId) ?? null;
}

function getStageRank(stage: string): number {
  const normalized = stage.trim().toLowerCase();
  if (normalized.includes("dieciseis")) return 4;
  if (normalized.includes("octav")) return 5;
  if (normalized.includes("cuart")) return 6;
  if (normalized.includes("semi")) return 7;
  if (normalized.includes("tercer")) return 8;
  if (normalized === "final") return 9;
  return 99;
}

function TeamLine({
  name,
  badgeUrl,
  score,
  compact = false,
  highlight = false,
}: TeamLineProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {badgeUrl ? (
          <img
            src={badgeUrl}
            alt={name}
            className={
              compact ? "h-6 w-6 object-contain" : "h-7 w-7 object-contain"
            }
          />
        ) : (
          <div
            className={`grid place-items-center rounded-full bg-zinc-100 font-bold text-zinc-700 ${
              compact ? "h-6 w-6 text-xs" : "h-7 w-7 text-sm"
            }`}
          >
            {name.slice(0, 1)}
          </div>
        )}
        <p
          className={`min-w-0 truncate font-semibold ${
            highlight ? "text-amber-800" : "text-zinc-950"
          } ${compact ? "text-sm" : "text-base"}`}
        >
          {name}
          {highlight && <span className="text-amber-500"> ★</span>}
        </p>
      </div>
      <span
        className={`shrink-0 font-bold ${
          highlight ? "text-amber-800" : "text-zinc-950"
        } ${compact ? "text-lg" : "text-xl"}`}
      >
        {typeof score === "number" ? score : "-"}
      </span>
    </div>
  );
}

function MatchCard(props: {
  match: WorldCupKnockoutMatch;
  result: WorldCupResultMatch | null;
  side: "left" | "right" | "center";
  compact?: boolean;
  favoriteTeamKey?: string | null;
}) {
  const scoreHome = props.result?.homeTeam.score ?? null;
  const scoreAway = props.result?.awayTeam.score ?? null;
  const homeKey = props.match.homeTeam.id ?? props.match.homeTeam.name;
  const awayKey = props.match.awayTeam.id ?? props.match.awayTeam.name;
  const isFavoriteHome =
    props.favoriteTeamKey !== null && homeKey === props.favoriteTeamKey;
  const isFavoriteAway =
    props.favoriteTeamKey !== null && awayKey === props.favoriteTeamKey;

  return (
    <article
      className={`relative overflow-hidden border border-zinc-200 bg-white shadow-sm ${
        props.compact ? "rounded-md" : "rounded-md"
      }`}
    >
      {props.side !== "center" && (
        <div
          className={`pointer-events-none absolute top-1/2 h-px w-4 -translate-y-1/2 bg-zinc-300 ${
            props.side === "left" ? "-right-4" : "-left-4"
          }`}
        />
      )}
      <div
        className={`border-b border-zinc-100 bg-zinc-50 ${
          props.compact ? "px-3 py-2" : "px-4 py-3"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={`font-semibold uppercase tracking-[0.22em] text-emerald-700 ${
                props.compact ? "text-[10px]" : "text-xs"
              }`}
            >
              {props.match.stage}
            </p>
            <p
              className={`mt-1 truncate font-medium text-zinc-600 ${
                props.compact ? "text-xs" : "text-sm"
              }`}
            >
              {props.match.venue ?? "Sede a confirmar"}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full bg-emerald-100 font-semibold uppercase tracking-wide text-emerald-800 ${
              props.compact ? "px-2.5 py-1 text-[10px]" : "px-3 py-1 text-xs"
            }`}
          >
            Final
          </span>
        </div>
      </div>
      <div className={props.compact ? "px-3 py-3" : "px-4 py-4"}>
        <div className="grid gap-2.5">
          <TeamLine
            name={props.match.homeTeam.name}
            badgeUrl={props.match.homeTeam.badgeUrl}
            score={scoreHome}
            compact={props.compact}
            highlight={isFavoriteHome}
          />
          <TeamLine
            name={props.match.awayTeam.name}
            badgeUrl={props.match.awayTeam.badgeUrl}
            score={scoreAway}
            compact={props.compact}
            highlight={isFavoriteAway}
          />
        </div>
      </div>
    </article>
  );
}

export default function Bracket({
  matches,
  playedMatches = [],
  liveMatches = [],
  favoriteTeamKey = null,
}: BracketProps) {
  const liveById = new Map(
    liveMatches.map((match) => [match.id, match] as const),
  );
  const playedById = new Map(
    playedMatches.map((match) => [match.id, match] as const),
  );

  const sorted = [...matches].sort((a, b) => {
    const rankA = getStageRank(a.stage);
    const rankB = getStageRank(b.stage);
    if (rankA !== rankB) return rankA - rankB;
    const dateA = a.timestamp ?? `${a.date ?? ""}T${a.time ?? ""}`;
    const dateB = b.timestamp ?? `${b.date ?? ""}T${b.time ?? ""}`;
    return dateA.localeCompare(dateB);
  });

  const byStage = new Map<string, WorldCupKnockoutMatch[]>();
  for (const match of sorted) {
    const current = byStage.get(match.stage) ?? [];
    current.push(match);
    byStage.set(match.stage, current);
  }

  const stages = Array.from(byStage.keys()).sort(
    (a, b) => getStageRank(a) - getStageRank(b),
  );

  if (matches.length === 0) {
    return null;
  }

  const finalStage =
    stages.find((stage) => stage.trim().toLowerCase() === "final") ?? null;
  const thirdStage =
    stages.find((stage) => stage.trim().toLowerCase().includes("tercer")) ??
    null;
  const mainStages = stages.filter(
    (stage) => stage !== finalStage && stage !== thirdStage,
  );

  const mainStagesSorted = [...mainStages].sort(
    (a, b) => getStageRank(a) - getStageRank(b),
  );

  const columns = mainStagesSorted.slice(0, 4);
  const [r32Stage, r16Stage, qfStage, sfStage] = columns;

  const r32 = r32Stage ? (byStage.get(r32Stage) ?? []) : [];
  const r16 = r16Stage ? (byStage.get(r16Stage) ?? []) : [];
  const qf = qfStage ? (byStage.get(qfStage) ?? []) : [];
  const sf = sfStage ? (byStage.get(sfStage) ?? []) : [];
  const finalMatch = finalStage
    ? ((byStage.get(finalStage) ?? [])[0] ?? null)
    : null;
  const thirdMatch = thirdStage
    ? ((byStage.get(thirdStage) ?? [])[0] ?? null)
    : null;

  function splitHalves(list: WorldCupKnockoutMatch[]) {
    const half = Math.ceil(list.length / 2);
    return {
      left: list.slice(0, half),
      right: list.slice(half),
    };
  }

  const r32Halves = splitHalves(r32);
  const r16Halves = splitHalves(r16);
  const qfHalves = splitHalves(qf);
  const sfHalves = splitHalves(sf);

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="min-w-[1100px]">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_280px_1fr_1fr_1fr_1fr] items-center gap-6">
          <div className="space-y-4">
            {r32Halves.left.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                result={getMatchResult(match.id, liveById, playedById)}
                side="left"
                compact
                favoriteTeamKey={favoriteTeamKey}
              />
            ))}
          </div>

          <div className="space-y-8">
            {r16Halves.left.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                result={getMatchResult(match.id, liveById, playedById)}
                side="left"
                compact
                favoriteTeamKey={favoriteTeamKey}
              />
            ))}
          </div>

          <div className="space-y-12">
            {qfHalves.left.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                result={getMatchResult(match.id, liveById, playedById)}
                side="left"
                favoriteTeamKey={favoriteTeamKey}
              />
            ))}
          </div>

          <div className="space-y-16">
            {sfHalves.left.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                result={getMatchResult(match.id, liveById, playedById)}
                side="left"
                favoriteTeamKey={favoriteTeamKey}
              />
            ))}
          </div>

          <div className="flex flex-col items-center gap-6">
            {finalMatch ? (
              <div className="relative w-full">
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm ring-1 ring-emerald-100" />
                <img
                  src={wc26Logo}
                  alt="Logo"
                  className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 object-contain opacity-95"
                />
                <MatchCard
                  match={finalMatch}
                  result={getMatchResult(finalMatch.id, liveById, playedById)}
                  side="center"
                  favoriteTeamKey={favoriteTeamKey}
                />
              </div>
            ) : (
              <div className="grid w-full place-items-center rounded-lg border border-zinc-200 bg-zinc-50 px-6 py-10 text-sm text-zinc-600">
                Final pendiente
              </div>
            )}

            {thirdMatch && (
              <div className="w-full">
                <MatchCard
                  match={thirdMatch}
                  result={getMatchResult(thirdMatch.id, liveById, playedById)}
                  side="center"
                  compact
                  favoriteTeamKey={favoriteTeamKey}
                />
              </div>
            )}
          </div>

          <div className="space-y-16">
            {sfHalves.right.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                result={getMatchResult(match.id, liveById, playedById)}
                side="right"
                favoriteTeamKey={favoriteTeamKey}
              />
            ))}
          </div>

          <div className="space-y-12">
            {qfHalves.right.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                result={getMatchResult(match.id, liveById, playedById)}
                side="right"
                favoriteTeamKey={favoriteTeamKey}
              />
            ))}
          </div>

          <div className="space-y-8">
            {r16Halves.right.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                result={getMatchResult(match.id, liveById, playedById)}
                side="right"
                compact
                favoriteTeamKey={favoriteTeamKey}
              />
            ))}
          </div>

          <div className="space-y-4">
            {r32Halves.right.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                result={getMatchResult(match.id, liveById, playedById)}
                side="right"
                compact
                favoriteTeamKey={favoriteTeamKey}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
