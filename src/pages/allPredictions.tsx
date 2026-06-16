import { useEffect, useMemo, useState } from "react";
import {
  getAllUserMatchPredictions,
  calculatePredictionPoints,
  type MatchPrediction,
} from "../services/firebaseStore";
import {
  getWorldCup2026PlayedMatches,
  type WorldCupResultMatch,
} from "../services/results";
import Loader from "../components/loader";

type PredictionCard = {
  prediction: MatchPrediction;
  result: WorldCupResultMatch | null;
  points: 0 | 1 | 2 | null;
};

function formatPredictionDate(value: string | null): string {
  if (!value) return "Sin fecha";

  const trimmed = value.trim();
  const normalized =
    trimmed &&
    /^\d{4}-\d{2}-\d{2}T/.test(trimmed) &&
    !trimmed.endsWith("Z") &&
    !/[+-]\d{2}:\d{2}$/.test(trimmed) &&
    !/[+-]\d{4}$/.test(trimmed)
      ? `${trimmed}Z`
      : trimmed;

  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return value;

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Tiempo de espera agotado al cargar datos."));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

type AllPredictionsPageProps = {
  userId: string;
};

export default function AllPredictionsPage({
  userId,
}: AllPredictionsPageProps) {
  const [predictions, setPredictions] = useState<MatchPrediction[]>([]);
  const [playedMatches, setPlayedMatches] = useState<WorldCupResultMatch[]>([]);
  const [openRound, setOpenRound] = useState<number | null>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      try {
        setIsLoading(true);
        setError(null);

        const resultsPromise = getWorldCup2026PlayedMatches().catch(() => []);

        const [allPredictions, results] = await Promise.all([
          withTimeout(getAllUserMatchPredictions(userId), 12000),
          resultsPromise,
        ]);

        if (!isMounted) return;

        setPredictions(allPredictions);
        setPlayedMatches(results);
      } catch (loadError) {
        if (!isMounted) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar las predicciones.",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const cardsByRound = useMemo(() => {
    const resultsByMatchId = new Map(
      playedMatches.map((match) => [match.id, match] as const),
    );

    const cards = predictions.map((prediction) => {
      const result = resultsByMatchId.get(prediction.matchId) ?? null;
      const homeScore = result?.homeTeam.score;
      const awayScore = result?.awayTeam.score;
      const hasRealResult =
        typeof homeScore === "number" && typeof awayScore === "number";

      return {
        prediction,
        result,
        points: hasRealResult
          ? calculatePredictionPoints(prediction, {
              matchId: prediction.matchId,
              homeGoals: homeScore,
              awayGoals: awayScore,
            })
          : null,
      } satisfies PredictionCard;
    });

    return [1, 2, 3].map((round) => ({
      round,
      cards: cards.filter((card) => card.prediction.round === round),
    }));
  }, [playedMatches, predictions]);

  return (
    <section className="relative left-1/2 right-1/2 mx-[-50vw] w-screen">
      <div className="space-y-6 px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-emerald-100 bg-white/80 px-6 py-6 shadow-sm backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
            Predicciones
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-950">
            Tus predicciones y resultados reales
          </h2>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <Loader label="Cargando predicciones..." />
        ) : (
          <div className="space-y-8">
            {cardsByRound.map((roundData) => (
              <section key={roundData.round}>
                <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenRound((currentRound) =>
                        currentRound === roundData.round
                          ? null
                          : roundData.round,
                      )
                    }
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
                        {roundData.cards.length} predicciones
                      </span>
                      <span className="text-lg font-semibold text-zinc-500">
                        {openRound === roundData.round ? "−" : "+"}
                      </span>
                    </div>
                  </button>

                  {openRound === roundData.round && (
                    <div className="border-t border-zinc-100 px-4 py-4">
                      {roundData.cards.length === 0 ? (
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-600">
                          No hay predicciones registradas para esta fecha.
                        </div>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {roundData.cards.map((card) => (
                            <article
                              key={`${card.prediction.userId}-${card.prediction.matchId}`}
                              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                                    Grupo {card.prediction.group ?? "-"}
                                  </p>
                                  <p className="mt-1 truncate text-xs text-zinc-500">
                                    Vos
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-500">
                                    {formatPredictionDate(
                                      card.prediction.scheduledTimestamp,
                                    )}
                                  </p>
                                </div>

                                <span className="rounded-md bg-zinc-100 px-3 py-1 text-[11px] font-medium text-zinc-600">
                                  {card.result
                                    ? "Resultado final"
                                    : "Pendiente"}
                                </span>
                              </div>

                              <div className="mt-4 grid gap-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="truncate text-sm font-medium text-zinc-900">
                                    {card.prediction.homeTeamName}
                                  </span>
                                  <strong className="text-base text-zinc-950">
                                    {card.prediction.predictedHomeGoals}
                                  </strong>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                  <span className="truncate text-sm font-medium text-zinc-900">
                                    {card.prediction.awayTeamName}
                                  </span>
                                  <strong className="text-base text-zinc-950">
                                    {card.prediction.predictedAwayGoals}
                                  </strong>
                                </div>
                              </div>

                              <div className="mt-4 border-t border-zinc-100 pt-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                  Resultado real
                                </p>
                                <div className="mt-2 grid gap-2">
                                  <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="truncate text-zinc-700">
                                      {card.prediction.homeTeamName}
                                    </span>
                                    <strong className="text-zinc-950">
                                      {card.result?.homeTeam.score ?? "-"}
                                    </strong>
                                  </div>
                                  <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="truncate text-zinc-700">
                                      {card.prediction.awayTeamName}
                                    </span>
                                    <strong className="text-zinc-950">
                                      {card.result?.awayTeam.score ?? "-"}
                                    </strong>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4 border-t border-zinc-100 pt-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                    Puntaje
                                  </span>
                                  <span
                                    className={`rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                                      card.points === 2
                                        ? "bg-emerald-100 text-emerald-800"
                                        : card.points === 1
                                          ? "bg-amber-100 text-amber-800"
                                          : card.points === 0
                                            ? "bg-zinc-100 text-zinc-700"
                                            : "bg-sky-100 text-sky-800"
                                    }`}
                                  >
                                    {card.points === null
                                      ? "Sin jugar"
                                      : `${card.points} pts`}
                                  </span>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
