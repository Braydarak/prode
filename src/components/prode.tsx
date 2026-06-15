import { useEffect, useMemo, useRef, useState } from "react";
import { getWorldCup2026Groups, type WorldCupGroupMatch } from "../services";
import {
  onUserPredictionsSnapshot,
  upsertUserMatchPrediction,
  type MatchPrediction,
} from "../services/firebaseStore";
import { FirebaseError } from "firebase/app";
import {
  getCurrentGoogleUser,
  getFirebaseAppInstance,
} from "../services/googleLogin";
import Loader from "./loader";

type ProdeProps = {
  userId: string;
};

type DraftPrediction = {
  homeGoals: string;
  awayGoals: string;
};

function getMatchStartDate(match: WorldCupGroupMatch): Date | null {
  const rawTimestamp = match.timestamp?.trim() ?? "";
  const iso =
    rawTimestamp ||
    (match.date
      ? `${match.date}T${match.time?.trim() ? match.time.trim() : "00:00:00"}Z`
      : null);
  if (!iso) return null;

  const hasTimezone =
    iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso) || /[+-]\d{4}$/.test(iso);
  const normalizedIso =
    /^\d{4}-\d{2}-\d{2}T/.test(iso) && !hasTimezone ? `${iso}Z` : iso;

  const ms = Date.parse(normalizedIso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

function formatMatchDate(date: Date | null): string {
  if (!date) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function Prode({ userId }: ProdeProps) {
  const predictionDeadlineMs = 60 * 60 * 1000;
  const [matches, setMatches] = useState<WorldCupGroupMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const [predictionsByMatchId, setPredictionsByMatchId] = useState<
    Record<string, MatchPrediction>
  >({});

  const [drafts, setDrafts] = useState<Record<string, DraftPrediction>>({});

  const touchedRef = useRef<Record<string, boolean>>({});

  const validation = useMemo(() => {
    const invalidMatchIds: string[] = [];
    const normalized = new Map<string, { home: number; away: number }>();

    for (const match of matches) {
      if (predictionsByMatchId[match.id]) {
        continue;
      }

      const draft = drafts[match.id];
      const home = Number(draft?.homeGoals);
      const away = Number(draft?.awayGoals);

      if (
        !draft ||
        !Number.isInteger(home) ||
        home < 0 ||
        !Number.isInteger(away) ||
        away < 0
      ) {
        invalidMatchIds.push(match.id);
        continue;
      }

      normalized.set(match.id, { home, away });
    }

    return {
      invalidMatchIds,
      isComplete: invalidMatchIds.length === 0,
      normalized,
    };
  }, [drafts, matches, predictionsByMatchId]);

  useEffect(() => {
    let isMounted = true;

    async function loadUpcoming() {
      try {
        setIsLoading(true);
        setError(null);

        const groups = await getWorldCup2026Groups();
        const nowMs = Date.now();
        const endMs = nowMs + 2 * 24 * 60 * 60 * 1000;

        const upcoming = groups
          .flatMap((group) => group.matches)
          .map((match) => ({ match, date: getMatchStartDate(match) }))
          .filter(({ date }) => {
            if (!date) return false;
            const ms = date.getTime();
            return ms - predictionDeadlineMs >= nowMs && ms <= endMs;
          })
          .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
          .map(({ match }) => match);

        if (!isMounted) return;
        setMatches(upcoming);
      } catch (loadError) {
        if (!isMounted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar los partidos.",
        );
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadUpcoming();

    return () => {
      isMounted = false;
    };
  }, [predictionDeadlineMs]);

  useEffect(() => {
    const unsubscribe = onUserPredictionsSnapshot({
      userId,
      callback: (predictions) => {
        const next: Record<string, MatchPrediction> = {};
        for (const prediction of predictions) {
          next[prediction.matchId] = prediction;
        }
        setPredictionsByMatchId(next);
      },
    });

    return unsubscribe;
  }, [userId]);

  useEffect(() => {
    setDrafts((prev) => {
      let didChange = false;
      const next = { ...prev };

      for (const match of matches) {
        const matchId = match.id;
        if (touchedRef.current[matchId]) continue;
        if (next[matchId]) continue;

        const existing = predictionsByMatchId[matchId];
        next[matchId] = {
          homeGoals:
            typeof existing?.predictedHomeGoals === "number"
              ? String(existing.predictedHomeGoals)
              : "",
          awayGoals:
            typeof existing?.predictedAwayGoals === "number"
              ? String(existing.predictedAwayGoals)
              : "",
        };
        didChange = true;
      }

      return didChange ? next : prev;
    });
  }, [matches, predictionsByMatchId]);

  const enrichedMatches = useMemo(() => {
    return matches
      .map((match) => ({
        match,
        date: getMatchStartDate(match),
        hasPrediction: Boolean(predictionsByMatchId[match.id]),
      }))
      .sort((a, b) => {
        if (a.hasPrediction !== b.hasPrediction) {
          return a.hasPrediction ? 1 : -1;
        }

        return (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0);
      });
  }, [matches, predictionsByMatchId]);

  const pendingMatchesCount = useMemo(
    () => matches.filter((match) => !predictionsByMatchId[match.id]).length,
    [matches, predictionsByMatchId],
  );

  async function handleSaveAll() {
    try {
      setError(null);
      setShowValidation(true);

      if (!validation.isComplete) {
        setError(
          "Completá todos los partidos con goles válidos (enteros >= 0).",
        );
        return;
      }

      setIsSavingAll(true);

      await Promise.all(
        matches.map(async (match) => {
          if (predictionsByMatchId[match.id]) {
            return;
          }

          const normalized = validation.normalized.get(match.id);
          if (!normalized) {
            return;
          }

          await upsertUserMatchPrediction({
            userId,
            matchId: match.id,
            predictedHomeGoals: normalized.home,
            predictedAwayGoals: normalized.away,
            homeTeamId: match.homeTeam.id,
            awayTeamId: match.awayTeam.id,
            homeTeamName: match.homeTeam.name,
            awayTeamName: match.awayTeam.name,
            group: match.group,
            round: match.round,
            scheduledTimestamp: match.timestamp,
          });
        }),
      );
    } catch (saveError) {
      if (saveError instanceof FirebaseError) {
        const authUid = getCurrentGoogleUser()?.uid ?? null;
        const projectId = getFirebaseAppInstance().options.projectId ?? null;

        if (saveError.code === "permission-denied") {
          setError(
            `Permisos insuficientes en Firestore (permission-denied). Verificá que:\n` +
              `- Estás logueado (auth.uid=${authUid ?? "null"})\n` +
              `- Estás escribiendo en el mismo proyecto donde actualizaste las rules (projectId=${projectId ?? "null"})\n` +
              `- Publicaste las rules en Firestore (no solo guardarlas)\n` +
              `- La ruta sea users/${userId}/predictions/{matchId} y el uid coincida`,
          );
          return;
        }
        setError(
          `Firebase error (${saveError.code}): ${saveError.message}\n` +
            `auth.uid=${authUid ?? "null"} projectId=${projectId ?? "null"}`,
        );
        return;
      }

      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar el pronóstico.",
      );
    } finally {
      setIsSavingAll(false);
    }
  }

  return (
    <section className="relative left-1/2 right-1/2 mx-[-50vw] w-screen">
      <div className="border-b border-emerald-100 bg-[linear-gradient(90deg,#ecfdf5_0%,#f0fdfa_50%,#eff6ff_100%)] px-4 py-5 sm:px-6 lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Prode
          </p>
          <h2 className="mt-2 text-2xl font-semibold leading-tight text-zinc-950">
            Cargá tus pronósticos
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Se muestran los partidos de las próximas 48 horas. Puntaje: 2 si
            acertás el resultado exacto, 1 si acertás ganador/empate, 0 si no.
            Podés cargar tu predicción hasta 1 hora antes del partido.
          </p>
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <Loader label="Cargando partidos..." />
        ) : enrichedMatches.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
            No hay partidos disponibles para predecir en las próximas 48 horas.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {enrichedMatches.map(({ match, date, hasPrediction }) => {
              const draft = drafts[match.id] ?? {
                homeGoals: "",
                awayGoals: "",
              };
              const saved = predictionsByMatchId[match.id];
              const isInvalid =
                showValidation && validation.invalidMatchIds.includes(match.id);
              const inputBase =
                "mt-2 w-full rounded-md border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none transition focus:ring-4";
              const inputValid =
                "border-zinc-200 focus:border-emerald-400 focus:ring-emerald-100";
              const inputInvalid =
                "border-rose-300 focus:border-rose-400 focus:ring-rose-100";

              return (
                <article
                  key={match.id}
                  className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm"
                >
                  <header className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-100 pb-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        Grupo {match.group} · Fecha {match.round ?? "-"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatMatchDate(date)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-zinc-100 px-3 py-1 text-[11px] font-medium text-zinc-600">
                        {match.status ?? "Programado"}
                      </span>
                      {!hasPrediction && (
                        <span className="shrink-0 rounded-md bg-amber-100 px-3 py-1 text-[11px] font-medium text-amber-800">
                          Sin predicción
                        </span>
                      )}
                      {saved && (
                        <span className="shrink-0 rounded-md bg-emerald-100 px-3 py-1 text-[11px] font-medium text-emerald-800">
                          Guardado
                        </span>
                      )}
                    </div>
                  </header>

                  <div className="mt-3 grid gap-3">
                    <div className="min-w-0">
                      <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                        <div className="min-w-0">
                          <label className="block min-w-0 text-xs font-medium uppercase tracking-wide text-zinc-500">
                            <span className="flex min-w-0 items-center gap-2">
                              {match.homeTeam.badgeUrl ? (
                                <img
                                  src={match.homeTeam.badgeUrl}
                                  alt={match.homeTeam.name}
                                  className="h-5 w-5 shrink-0 object-contain"
                                />
                              ) : (
                                <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-zinc-200 text-[10px] font-bold text-zinc-700">
                                  {match.homeTeam.name.slice(0, 1)}
                                </span>
                              )}
                              <span className="truncate">
                                {match.homeTeam.name}
                              </span>
                            </span>
                          </label>
                        </div>
                        {saved ? (
                          <div className="flex h-10 w-16 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-800">
                            {saved.predictedHomeGoals}
                          </div>
                        ) : (
                          <input
                            inputMode="numeric"
                            value={draft.homeGoals}
                            onChange={(event) => {
                              const value = event.target.value;
                              touchedRef.current[match.id] = true;
                              setDrafts((prev) => ({
                                ...prev,
                                [match.id]: {
                                  ...(prev[match.id] ?? {
                                    homeGoals: "",
                                    awayGoals: "",
                                  }),
                                  homeGoals: value,
                                },
                              }));
                            }}
                            className={`${inputBase} ${isInvalid ? inputInvalid : inputValid} mt-0 w-16 text-center`}
                            placeholder="0"
                          />
                        )}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                        <div className="min-w-0">
                          <label className="block min-w-0 text-xs font-medium uppercase tracking-wide text-zinc-500">
                            <span className="flex min-w-0 items-center gap-2">
                              {match.awayTeam.badgeUrl ? (
                                <img
                                  src={match.awayTeam.badgeUrl}
                                  alt={match.awayTeam.name}
                                  className="h-5 w-5 shrink-0 object-contain"
                                />
                              ) : (
                                <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-zinc-200 text-[10px] font-bold text-zinc-700">
                                  {match.awayTeam.name.slice(0, 1)}
                                </span>
                              )}
                              <span className="truncate">
                                {match.awayTeam.name}
                              </span>
                            </span>
                          </label>
                        </div>
                        {saved ? (
                          <div className="flex h-10 w-16 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-800">
                            {saved.predictedAwayGoals}
                          </div>
                        ) : (
                          <input
                            inputMode="numeric"
                            value={draft.awayGoals}
                            onChange={(event) => {
                              const value = event.target.value;
                              touchedRef.current[match.id] = true;
                              setDrafts((prev) => ({
                                ...prev,
                                [match.id]: {
                                  ...(prev[match.id] ?? {
                                    homeGoals: "",
                                    awayGoals: "",
                                  }),
                                  awayGoals: value,
                                },
                              }));
                            }}
                            className={`${inputBase} ${isInvalid ? inputInvalid : inputValid} mt-0 w-16 text-center`}
                            placeholder="0"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                    {match.venue ?? "Sin estadio"} ·{" "}
                    {match.country ?? "Sin país"}
                  </div>
                </article>
              );
            })}
            <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 md:col-span-2 xl:col-span-3">
              <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-zinc-700">
                  {pendingMatchesCount === 0
                    ? "Ya guardaste todas las predicciones disponibles."
                    : validation.isComplete
                      ? "Listo: completaste todos los partidos nuevos."
                      : "Completá todos los partidos nuevos para habilitar el guardado."}
                </div>

                <button
                  type="button"
                  onClick={() => void handleSaveAll()}
                  disabled={
                    pendingMatchesCount === 0 ||
                    !validation.isComplete ||
                    isSavingAll
                  }
                  className="inline-flex h-11 items-center justify-center rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingAll ? "Guardando..." : "Guardar predicción"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
