import { useEffect, useMemo, useRef, useState } from "react";
import wc26Logo from "../assets/WC26_Logo.png";
import wc26LogoWhite from "../assets/WC26_Logo-white.png";
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
import type { ThemeMode } from "./header";
import Loader from "./loader";

type ProdeProps = {
  userId: string;
  theme: ThemeMode;
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

export default function Prode({ userId, theme }: ProdeProps) {
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
  const isDarkMode = theme === "dark";

  const validation = useMemo(() => {
    const invalidMatchIds: string[] = [];
    const normalized = new Map<string, { home: number; away: number }>();

    for (const match of matches) {
      if (predictionsByMatchId[match.id]) {
        continue;
      }

      const draft = drafts[match.id];
      const rawHome = draft?.homeGoals ?? "";
      const rawAway = draft?.awayGoals ?? "";
      const homeText = rawHome.trim();
      const awayText = rawAway.trim();

      if (!homeText && !awayText) {
        continue;
      }

      const home = Number(homeText);
      const away = Number(awayText);

      if (
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
      hasSavable: normalized.size > 0,
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

  const pendingMatches = useMemo(() => {
    return matches
      .map((match) => ({
        match,
        date: getMatchStartDate(match),
      }))
      .filter(({ match }) => !predictionsByMatchId[match.id])
      .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
  }, [matches, predictionsByMatchId]);

  const pendingMatchesCount = pendingMatches.length;

  async function handleSaveAll() {
    try {
      setError(null);
      setShowValidation(true);

      if (!validation.isComplete) {
        setError("Completá los goles del/los partido(s) incompleto(s).");
        return;
      }

      if (!validation.hasSavable) {
        setError("Completá al menos un partido para guardar.");
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
      <div
        className={`border-b px-4 py-5 sm:px-6 lg:px-8 ${
          isDarkMode
            ? "border-emerald-900/40 bg-[linear-gradient(90deg,#052e2b_0%,#042f2e_50%,#0f172a_100%)]"
            : "border-emerald-100 bg-[linear-gradient(90deg,#ecfdf5_0%,#f0fdfa_50%,#eff6ff_100%)]"
        }`}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Prode
          </p>
          <h2
            className={`mt-2 text-2xl font-semibold leading-tight ${
              isDarkMode ? "text-zinc-50" : "text-zinc-950"
            }`}
          >
            Cargá tus pronósticos
          </h2>
          <p
            className={`mt-2 max-w-2xl text-sm ${
              isDarkMode ? "text-zinc-300" : "text-zinc-600"
            }`}
          >
            Se muestran los partidos de las próximas 48 horas. Puntaje: 2 si
            acertás el resultado exacto, 1 si acertás ganador/empate, 0 si no.
            Podés cargar tu predicción hasta 1 hora antes del partido.
          </p>
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              isDarkMode
                ? "border-rose-900/50 bg-rose-950/40 text-rose-200"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {error}
          </div>
        )}

        {isLoading ? (
          <Loader label="Cargando partidos..." />
        ) : pendingMatches.length === 0 ? (
          <div
            className={`overflow-hidden rounded-3xl border ${
              isDarkMode
                ? "border-emerald-900/40 bg-[linear-gradient(135deg,#052e2b_0%,#042f2e_45%,#0f172a_100%)] shadow-[0_20px_40px_rgba(0,0,0,0.35)]"
                : "border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#f0fdfa_45%,#eff6ff_100%)] shadow-sm"
            }`}
          >
            <div className="grid gap-6 px-6 py-8 md:grid-cols-[auto_1fr] md:items-center md:px-8">
              <div className="flex justify-center md:justify-start">
                <div
                  className={`grid h-24 w-24 place-items-center rounded-3xl ring-1 ${
                    isDarkMode
                      ? "bg-zinc-900/80 shadow-[0_20px_40px_rgba(0,0,0,0.35)] ring-emerald-900/50"
                      : "bg-white/80 shadow-[0_20px_40px_rgba(16,24,40,0.08)] ring-emerald-100"
                  }`}
                >
                  <img
                    src={isDarkMode ? wc26LogoWhite : wc26Logo}
                    alt="Prode Mundial"
                    className="h-16 w-16 object-contain"
                  />
                </div>
              </div>

              <div className="text-center md:text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                  Todo al dia
                </p>
                <h3
                  className={`mt-2 text-2xl font-semibold ${
                    isDarkMode ? "text-zinc-50" : "text-zinc-950"
                  }`}
                >
                  Todavia no hay nuevos partidos para predecir
                </h3>
                <p
                  className={`mt-3 max-w-2xl text-sm leading-6 ${
                    isDarkMode ? "text-zinc-300" : "text-zinc-600"
                  }`}
                >
                  Ya cargaste todo lo disponible en las proximas 48 horas.
                  Cuando aparezcan nuevos cruces, los vas a ver aca para
                  completar tus pronosticos.
                </p>
                <p
                  className={`mt-5 text-sm font-medium ${
                    isDarkMode ? "text-emerald-300" : "text-emerald-800"
                  }`}
                >
                  Volvé más tarde para seguir jugando
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pendingMatches.map(({ match, date }) => {
              const draft = drafts[match.id] ?? {
                homeGoals: "",
                awayGoals: "",
              };
              const isInvalid =
                showValidation && validation.invalidMatchIds.includes(match.id);
              const inputBase = `mt-2 w-12 rounded-md border px-3 py-2 text-sm font-semibold outline-none transition focus:ring-4 ${
                isDarkMode
                  ? "bg-zinc-950 text-zinc-100"
                  : "bg-white text-zinc-900"
              }`;
              const inputValid = isDarkMode
                ? "border-zinc-700 focus:border-emerald-500 focus:ring-emerald-950"
                : "border-zinc-200 focus:border-emerald-400 focus:ring-emerald-100";
              const inputInvalid = isDarkMode
                ? "border-rose-700 focus:border-rose-500 focus:ring-rose-950"
                : "border-rose-300 focus:border-rose-400 focus:ring-rose-100";

              return (
                <article
                  key={match.id}
                  className={`rounded-lg border p-3 ${
                    isDarkMode
                      ? "border-zinc-800 bg-zinc-900 shadow-[0_18px_30px_rgba(0,0,0,0.3)]"
                      : "border-zinc-200 bg-white shadow-sm"
                  }`}
                >
                  <header
                    className={`flex flex-wrap items-start justify-between gap-2 border-b pb-3 ${
                      isDarkMode ? "border-zinc-800" : "border-zinc-100"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        Grupo {match.group} · Fecha {match.round ?? "-"}
                      </p>
                      <p
                        className={`mt-1 text-xs ${
                          isDarkMode ? "text-zinc-400" : "text-zinc-500"
                        }`}
                      >
                        {formatMatchDate(date)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-md px-3 py-1 text-[11px] font-medium ${
                          isDarkMode
                            ? "bg-zinc-800 text-zinc-300"
                            : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {match.status ?? "Programado"}
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-3 py-1 text-[11px] font-medium ${
                          isDarkMode
                            ? "bg-amber-950/60 text-amber-200"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        Nueva
                      </span>
                    </div>
                  </header>

                  <div className="mt-3 grid gap-3">
                    <div className="min-w-0">
                      <div
                        className={`grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border p-3 ${
                          isDarkMode
                            ? "border-zinc-800 bg-zinc-950/70"
                            : "border-zinc-200 bg-zinc-50"
                        }`}
                      >
                        <div className="min-w-0">
                          <label
                            className={`block min-w-0 text-xs font-medium uppercase tracking-wide ${
                              isDarkMode ? "text-zinc-400" : "text-zinc-500"
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {match.homeTeam.badgeUrl ? (
                                <img
                                  src={match.homeTeam.badgeUrl}
                                  alt={match.homeTeam.name}
                                  className="h-5 w-5 shrink-0 object-contain"
                                />
                              ) : (
                                <span
                                  className={`grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold ${
                                    isDarkMode
                                      ? "bg-zinc-800 text-zinc-200"
                                      : "bg-zinc-200 text-zinc-700"
                                  }`}
                                >
                                  {match.homeTeam.name.slice(0, 1)}
                                </span>
                              )}
                              <span className="truncate">
                                {match.homeTeam.name}
                              </span>
                            </span>
                          </label>
                        </div>
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
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div
                        className={`grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border p-3 ${
                          isDarkMode
                            ? "border-zinc-800 bg-zinc-950/70"
                            : "border-zinc-200 bg-zinc-50"
                        }`}
                      >
                        <div className="min-w-0">
                          <label
                            className={`block min-w-0 text-xs font-medium uppercase tracking-wide ${
                              isDarkMode ? "text-zinc-400" : "text-zinc-500"
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {match.awayTeam.badgeUrl ? (
                                <img
                                  src={match.awayTeam.badgeUrl}
                                  alt={match.awayTeam.name}
                                  className="h-5 w-5 shrink-0 object-contain"
                                />
                              ) : (
                                <span
                                  className={`grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold ${
                                    isDarkMode
                                      ? "bg-zinc-800 text-zinc-200"
                                      : "bg-zinc-200 text-zinc-700"
                                  }`}
                                >
                                  {match.awayTeam.name.slice(0, 1)}
                                </span>
                              )}
                              <span className="truncate">
                                {match.awayTeam.name}
                              </span>
                            </span>
                          </label>
                        </div>
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
                      </div>
                    </div>
                  </div>

                  <div
                    className={`mt-3 border-t pt-3 text-xs ${
                      isDarkMode
                        ? "border-zinc-800 text-zinc-400"
                        : "border-zinc-100 text-zinc-500"
                    }`}
                  >
                    {match.venue ?? "Sin estadio"} ·{" "}
                    {match.country ?? "Sin país"}
                  </div>
                </article>
              );
            })}
            <div className="mt-4 text-center md:col-span-2 xl:col-span-3">
              <div
                className={`text-sm ${
                  isDarkMode ? "text-zinc-300" : "text-zinc-700"
                }`}
              >
                {pendingMatchesCount === 0
                  ? "Ya guardaste todas las predicciones disponibles."
                  : !validation.isComplete
                    ? "Completá los goles del/los partido(s) incompleto(s) para habilitar el guardado."
                    : !validation.hasSavable
                      ? "Completá al menos un partido para habilitar el guardado."
                      : ""}
              </div>

              <button
                type="button"
                onClick={() => void handleSaveAll()}
                disabled={
                  pendingMatchesCount === 0 ||
                  !validation.isComplete ||
                  !validation.hasSavable ||
                  isSavingAll
                }
                className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingAll ? "Guardando..." : "Guardar predicción"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
