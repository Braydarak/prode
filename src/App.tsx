import { useEffect, useState } from "react";
import "./App.css";
import { getWorldCup2026Groups } from "./services";
import {
  getWorldCup2026ResultsByGroup,
  getWorldCup2026LiveMatches,
  type WorldCupResultMatch,
  type WorldCupResultsByGroup,
} from "./services/results";
import AllPredictionsPage from "./pages/allPredictions";
import InstallAppPage from "./pages/installApp";
import LoginPage from "./pages/login";
import MundialPage from "./pages/mundial";
import UsersTablePage from "./pages/usersTablePage";
import UsersTable, { type UsersTableRow } from "./components/usersTable";
import Prode from "./components/prode";
import Header from "./components/header";
import Loader from "./components/loader";
import {
  getCurrentGoogleUser,
  onGoogleAuthStateChanged,
  completeGoogleRedirectLogin,
  signOutFromGoogle,
} from "./services/googleLogin";
import {
  calculateTotalPoints,
  onLeaderboardSnapshot,
  onUserPredictionsSnapshot,
  setUserLeaderboardPoints,
  upsertUserLeaderboardProfile,
  type PlayedMatchResult,
} from "./services/firebaseStore";
import type { User } from "firebase/auth";

const OFFICIAL_START_MATCH = {
  group: "J",
  homeTeam: "Argentina",
  awayTeam: "Argelia",
};

type InstallPlatform = "ios" | "android" | "other";

function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getMatchStartMs(match: {
  timestamp: string | null;
  date: string | null;
  time: string | null;
}): number | null {
  const iso =
    match.timestamp ??
    (match.date ? `${match.date}T${match.time?.trim() || "00:00:00"}Z` : null);

  if (!iso) return null;

  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMatchStatus(status: string | null | undefined): string {
  return status?.trim().toUpperCase() ?? "";
}

function formatLiveMatchTime(
  match: Pick<WorldCupResultMatch, "status" | "timestamp" | "date" | "time">,
  nowMs: number,
): string {
  const normalizedStatus = normalizeMatchStatus(match.status);
  const liveMinuteMatch = normalizedStatus.match(/^(\d{1,3}(?:\+\d{1,2})?)'?$/);
  if (liveMinuteMatch) {
    const minuteNumber = Number.parseInt(liveMinuteMatch[1], 10);

    if (Number.isFinite(minuteNumber) && minuteNumber > 90) {
      return "En vivo · ET";
    }

    if (Number.isFinite(minuteNumber) && minuteNumber > 45) {
      return "En vivo · 2T";
    }

    return "En vivo · 1T";
  }

  if (normalizedStatus === "HT") {
    return "Entretiempo";
  }

  if (normalizedStatus === "BT") {
    return "CB";
  }

  if (normalizedStatus === "ET") {
    return "En vivo · ET";
  }

  if (normalizedStatus === "P" || normalizedStatus === "PEN_LIVE") {
    return "Penales";
  }

  if (
    normalizedStatus === "2H" ||
    normalizedStatus === "INPLAY_2ND_HALF" ||
    normalizedStatus === "INT"
  ) {
    return normalizedStatus === "INT" ? "Pausa" : "En vivo · 2T";
  }

  if (
    normalizedStatus === "1H" ||
    normalizedStatus === "INPLAY_1ST_HALF" ||
    normalizedStatus === "LIVE" ||
    normalizedStatus === "IN PLAY" ||
    normalizedStatus === "INPLAY"
  ) {
    return "En vivo · 1T";
  }

  void nowMs;
  void match.timestamp;
  void match.date;
  void match.time;
  return "En vivo";
}

function getInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "other";

  const ua = navigator.userAgent ?? "";
  const isIPhoneIPadIPod = /iPad|iPhone|iPod/.test(ua);
  const isIPadOs13Plus =
    !isIPhoneIPadIPod &&
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1;

  if (isIPhoneIPadIPod || isIPadOs13Plus) {
    return "ios";
  }

  if (/Android/i.test(ua)) {
    return "android";
  }

  return "other";
}

function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return true;

  const standaloneNavigator = window.navigator as Navigator & {
    standalone?: boolean;
  };

  return Boolean(
    window.matchMedia?.("(display-mode: standalone)").matches ||
    standaloneNavigator.standalone ||
    document.referrer.startsWith("android-app://"),
  );
}

function App() {
  const [currentPath, setCurrentPath] = useState(
    () => window.location.pathname,
  );
  const [user, setUser] = useState<User | null>(() => getCurrentGoogleUser());
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [installPlatform, setInstallPlatform] =
    useState<InstallPlatform>("other");
  const [isInstallCheckComplete, setIsInstallCheckComplete] = useState(false);
  const [shouldShowInstallPage, setShouldShowInstallPage] = useState(false);
  const [resultsByGroup, setResultsByGroup] = useState<
    WorldCupResultsByGroup[]
  >([]);
  const [liveMatches, setLiveMatches] = useState<WorldCupResultMatch[]>([]);
  const [leaderboardUsers, setLeaderboardUsers] = useState<UsersTableRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [officialStartMs, setOfficialStartMs] = useState<number | null>(null);
  const [hasOfficialStartBegun, setHasOfficialStartBegun] = useState(true);
  const [liveClockMs, setLiveClockMs] = useState(() => Date.now());
  const isMundialPage = currentPath === "/mundial";
  const isAllPredictionsPage = currentPath === "/predicciones";
  const isUsersTablePage = currentPath === "/posiciones";
  const liveMatch = liveMatches[0] ?? null;

  useEffect(() => {
    function refreshInstallStatus() {
      const platform = getInstallPlatform();
      const isStandalone = isRunningStandalone();

      setInstallPlatform(platform);
      setShouldShowInstallPage(
        !isStandalone && (platform === "ios" || platform === "android"),
      );
      setIsInstallCheckComplete(true);
    }

    const standaloneMediaQuery = window.matchMedia?.(
      "(display-mode: standalone)",
    );

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshInstallStatus();
      }
    }

    refreshInstallStatus();
    window.addEventListener("appinstalled", refreshInstallStatus);
    window.addEventListener("pageshow", refreshInstallStatus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    standaloneMediaQuery?.addEventListener("change", refreshInstallStatus);

    return () => {
      window.removeEventListener("appinstalled", refreshInstallStatus);
      window.removeEventListener("pageshow", refreshInstallStatus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      standaloneMediaQuery?.removeEventListener("change", refreshInstallStatus);
    };
  }, []);

  useEffect(() => {
    function handlePopState() {
      setCurrentPath(window.location.pathname);
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isMounted = true;

    async function bootstrapAuth() {
      try {
        await completeGoogleRedirectLogin();
      } catch (redirectError) {
        void redirectError;
      }

      if (!isMounted) return;

      unsubscribe = onGoogleAuthStateChanged((nextUser) => {
        setUser(nextUser);
        setIsAuthLoading(false);

        if (!nextUser) {
          setResultsByGroup([]);
          setLiveMatches([]);
          setLeaderboardUsers([]);
          setIsLoading(true);
          setOfficialStartMs(null);
          setHasOfficialStartBegun(true);
          setError(null);
        }
      });
    }

    void bootstrapAuth();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!liveMatch) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setLiveClockMs(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [liveMatch]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void upsertUserLeaderboardProfile({
      userId: user.uid,
      name: user.displayName ?? user.email ?? "Usuario",
      email: user.email ?? null,
      photoUrl: user.photoURL ?? null,
    }).catch((profileError) => {
      setError(
        profileError instanceof Error
          ? profileError.message
          : "No se pudo actualizar el perfil del usuario.",
      );
    });

    const unsubscribe = onLeaderboardSnapshot({
      limitCount: 50,
      callback: (users) => {
        setLeaderboardUsers(
          users.map((entry) => ({
            id: entry.userId,
            name: entry.name,
            email: entry.email,
            photoUrl: entry.photoUrl,
            points: Number.isFinite(entry.points) ? entry.points : 0,
          })),
        );
      },
    });

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let isMounted = true;

    async function loadData() {
      try {
        const [worldCupResults, worldCupGroups, nextLiveMatches] =
          await Promise.all([
            getWorldCup2026ResultsByGroup(),
            getWorldCup2026Groups(),
            getWorldCup2026LiveMatches().catch(() => []),
          ]);

        if (!isMounted) {
          return;
        }

        const officialStartMatch = worldCupGroups
          .flatMap((group) => group.matches)
          .find(
            (match) =>
              normalizeName(match.group) ===
                normalizeName(OFFICIAL_START_MATCH.group) &&
              normalizeName(match.homeTeam.name) ===
                normalizeName(OFFICIAL_START_MATCH.homeTeam) &&
              normalizeName(match.awayTeam.name) ===
                normalizeName(OFFICIAL_START_MATCH.awayTeam),
          );

        const nextOfficialStartMs = officialStartMatch
          ? getMatchStartMs(officialStartMatch)
          : null;

        setResultsByGroup(worldCupResults);
        setLiveMatches(nextLiveMatches);
        setLiveClockMs(Date.now());
        setOfficialStartMs(nextOfficialStartMs);
        setHasOfficialStartBegun(
          nextOfficialStartMs === null
            ? true
            : Date.now() >= nextOfficialStartMs,
        );
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar los datos del Mundial.",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const hasOfficialStartBegun =
      officialStartMs === null ? true : Date.now() >= officialStartMs;
    const playedResults: PlayedMatchResult[] = resultsByGroup
      .flatMap((group) => group.matches)
      .flatMap((match) => {
        if (
          typeof match.homeTeam.score !== "number" ||
          typeof match.awayTeam.score !== "number"
        ) {
          return [];
        }

        return [
          {
            matchId: match.id,
            homeGoals: match.homeTeam.score,
            awayGoals: match.awayTeam.score,
          },
        ];
      });

    let lastPoints: number | null = null;

    const unsubscribe = onUserPredictionsSnapshot({
      userId: user.uid,
      callback: (predictions) => {
        const points = hasOfficialStartBegun
          ? calculateTotalPoints({ predictions, playedResults })
          : 0;

        if (lastPoints === points) {
          return;
        }

        lastPoints = points;

        void setUserLeaderboardPoints({ userId: user.uid, points }).catch(
          (pointsError) => {
            setError(
              pointsError instanceof Error
                ? pointsError.message
                : "No se pudieron actualizar los puntos del usuario.",
            );
          },
        );
      },
    });

    return unsubscribe;
  }, [officialStartMs, user, resultsByGroup]);

  if (!isInstallCheckComplete) {
    return null;
  }

  if (
    shouldShowInstallPage &&
    (installPlatform === "ios" || installPlatform === "android")
  ) {
    return (
      <InstallAppPage
        platform={installPlatform}
        onRefreshInstallStatus={() => {
          const platform = getInstallPlatform();
          setInstallPlatform(platform);
          setShouldShowInstallPage(
            !isRunningStandalone() &&
              (platform === "ios" || platform === "android"),
          );
          setIsInstallCheckComplete(true);
        }}
      />
    );
  }

  if (isAuthLoading || !user) {
    return <LoginPage />;
  }

  async function handleLogout() {
    try {
      setError(null);
      await signOutFromGoogle();
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : "No se pudo cerrar sesión.",
      );
    }
  }

  function handleNavigate(href: string) {
    const nextUrl = new URL(href, window.location.origin);
    const nextLocation = `${nextUrl.pathname}${nextUrl.hash}`;
    const currentLocation = `${window.location.pathname}${window.location.hash}`;

    if (nextLocation !== currentLocation) {
      window.history.pushState({}, "", nextLocation);
    }

    setCurrentPath(nextUrl.pathname);

    if (nextUrl.hash) {
      window.requestAnimationFrame(() => {
        document
          .getElementById(nextUrl.hash.slice(1))
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main
      id="top"
      className="min-h-screen bg-[radial-gradient(circle_at_top,#d1fae5_0%,#f8fafc_30%,#f8fafc_100%)]"
    >
      <Header
        onLogout={() => void handleLogout()}
        onNavigate={handleNavigate}
        currentPath={
          isMundialPage
            ? "/mundial"
            : isAllPredictionsPage
              ? "/predicciones"
              : isUsersTablePage
                ? "/posiciones"
                : "/"
        }
      />

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Error: <span className="font-medium">{error}</span>
          </div>
        )}

        {isMundialPage ? (
          <MundialPage />
        ) : isAllPredictionsPage ? (
          <AllPredictionsPage userId={user.uid} />
        ) : isUsersTablePage ? (
          <UsersTablePage
            users={leaderboardUsers}
            currentUserId={user.uid}
            officialStartMs={officialStartMs}
            hasOfficialStartBegun={hasOfficialStartBegun}
          />
        ) : (
          <>
            {liveMatch && (
              <section className="mb-8">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                    En vivo
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-zinc-950">
                    {liveMatches.length > 1
                      ? "Partidos en juego ahora"
                      : "Partido en juego ahora"}
                  </h2>
                </div>

                <div
                  className={`${
                    liveMatches.length > 1
                      ? "flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory"
                      : "block"
                  }`}
                >
                  {liveMatches.map((match) => (
                    <article
                      key={match.id}
                      className={`overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm ${
                        liveMatches.length > 1
                          ? "min-w-[280px] max-w-[320px] shrink-0 snap-start"
                          : ""
                      }`}
                    >
                      <div className="border-b border-emerald-100 bg-linear-to-r from-emerald-50 to-white px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                              Grupo {match.group}
                            </p>
                            <p className="mt-1 truncate text-sm font-medium text-zinc-600">
                              {match.venue ?? "Sede a confirmar"}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-700">
                            {formatLiveMatchTime(match, liveClockMs)}
                          </span>
                        </div>
                      </div>

                      <div className="px-4 py-4">
                        <div className="grid gap-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              {match.homeTeam.badgeUrl ? (
                                <img
                                  src={match.homeTeam.badgeUrl}
                                  alt={match.homeTeam.name}
                                  className="h-9 w-9 object-contain"
                                />
                              ) : (
                                <div className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-700">
                                  {match.homeTeam.name.slice(0, 1)}
                                </div>
                              )}
                              <p className="truncate text-base font-semibold text-zinc-950">
                                {match.homeTeam.name}
                              </p>
                            </div>
                            <span className="text-2xl font-bold text-zinc-950">
                              {match.homeTeam.score ?? 0}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              {match.awayTeam.badgeUrl ? (
                                <img
                                  src={match.awayTeam.badgeUrl}
                                  alt={match.awayTeam.name}
                                  className="h-9 w-9 object-contain"
                                />
                              ) : (
                                <div className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-700">
                                  {match.awayTeam.name.slice(0, 1)}
                                </div>
                              )}
                              <p className="truncate text-base font-semibold text-zinc-950">
                                {match.awayTeam.name}
                              </p>
                            </div>
                            <span className="text-2xl font-bold text-zinc-950">
                              {match.awayTeam.score ?? 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section id="mis-predicciones">
              <Prode userId={user.uid} />
            </section>

            <section id="partidos" className="mt-8">
              <UsersTable
                users={leaderboardUsers}
                currentUserId={user.uid}
                title="Posiciones"
              />
            </section>
          </>
        )}

        {isLoading && (
          <Loader
            label="Actualizando resultados para calcular puntos..."
            className="mt-6"
            center={false}
          />
        )}
      </div>
    </main>
  );
}

export default App;
