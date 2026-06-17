import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { getWorldCup2026Groups } from "./services";
import {
  hasFinalMatchStatus,
  getWorldCup2026ResultsByGroup,
  getWorldCup2026LiveMatches,
  type WorldCupResultMatch,
  type WorldCupResultsByGroup,
} from "./services/results";
import AllPredictionsPage from "./pages/allPredictions";
import InstallAppPage from "./pages/installApp";
import IntroPage from "./pages/intro";
import LoginPage from "./pages/login";
import FavoriteTeamPage from "./pages/favoriteTeam";
import MundialPage from "./pages/mundial";
import UsersTablePage from "./pages/usersTablePage";
import UsersTable, { type UsersTableRow } from "./components/usersTable";
import Prode from "./components/prode";
import Header, { type ThemeMode } from "./components/header";
import Loader from "./components/loader";
import {
  getCurrentGoogleUser,
  onGoogleAuthStateChanged,
  completeGoogleRedirectLogin,
  signOutFromGoogle,
} from "./services/googleLogin";
import {
  calculateTotalPoints,
  calculatePredictionPoints,
  onAllPredictionsSnapshot,
  onLeaderboardSnapshot,
  onUserProfileSnapshot,
  onUserPredictionsSnapshot,
  setUserFavoriteTeamKey,
  setUserLeaderboardPoints,
  setUserThemeMode,
  type MatchPrediction,
  upsertUserLeaderboardProfile,
  type PlayedMatchResult,
  type UserLeaderboardEntry,
} from "./services/firebaseStore";
import type { User } from "firebase/auth";

const OFFICIAL_START_MATCH = {
  id: "2391740",
  label: "Argentina vs Algeria",
};

const FAVORITE_TEAM_STORAGE_KEY = "prode:favoriteTeamKey";
const MOBILE_INTRO_SESSION_KEY = "prode:intro:seen";
const THEME_STORAGE_KEY = "prode:theme";
const COUNTRY_ABBREVIATIONS: Record<string, string> = {
  argelia: "ALG",
  argentina: "ARG",
  australia: "AUS",
  austria: "AUT",
  belgica: "BEL",
  bélgica: "BEL",
  bolivia: "BOL",
  brasil: "BRA",
  cameron: "CMR",
  camerún: "CMR",
  canada: "CAN",
  canadá: "CAN",
  chile: "CHI",
  colombia: "COL",
  "costa rica": "CRC",
  croacia: "CRO",
  "república checa": "CZE",
  dinamarca: "DEN",
  ecuador: "ECU",
  egipto: "EGY",
  inglaterra: "ENG",
  francia: "FRA",
  alemania: "GER",
  ghana: "GHA",
  grecia: "GRE",
  irán: "IRN",
  iran: "IRN",
  irak: "IRQ",
  italia: "ITA",
  japon: "JPN",
  japón: "JPN",
  "costa de marfil": "CIV",
  mexico: "MEX",
  méxico: "MEX",
  marruecos: "MAR",
  "países bajos": "NED",
  "paises bajos": "NED",
  "nueva zelanda": "NZL",
  nigeria: "NGA",
  noruega: "NOR",
  panama: "PAN",
  panamá: "PAN",
  paraguay: "PAR",
  peru: "PER",
  perú: "PER",
  polonia: "POL",
  portugal: "POR",
  catar: "QAT",
  rumania: "ROU",
  "arabia saudita": "KSA",
  senegal: "SEN",
  serbia: "SRB",
  eslovaquia: "SVK",
  eslovenia: "SVN",
  sudáfrica: "RSA",
  sudafrica: "RSA",
  "corea del sur": "KOR",
  espana: "ESP",
  españa: "ESP",
  suecia: "SWE",
  suiza: "SUI",
  tunez: "TUN",
  túnez: "TUN",
  turquia: "TUR",
  turquía: "TUR",
  ucrania: "UKR",
  uruguay: "URU",
  "estados unidos": "USA",
  gales: "WAL",
  escocia: "SCO",
  jordania: "JOR",
};

type InstallPlatform = "ios" | "android" | "other";

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

function formatPlayedMatchDate(dateMs: number): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateMs));
}

function normalizeCountryLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getCountryAbbreviation(teamName: string): string {
  const normalized = normalizeCountryLabel(teamName);
  const exactMatch = COUNTRY_ABBREVIATIONS[normalized];
  if (exactMatch) {
    return exactMatch;
  }

  const compact = normalized.replace(/[^a-z ]/g, "");
  const compactMatch = COUNTRY_ABBREVIATIONS[compact];
  if (compactMatch) {
    return compactMatch;
  }

  const words = compact.split(" ").filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((word) => word[0] ?? "")
      .join("")
      .toUpperCase();
  }

  return (
    compact.slice(0, 3).toUpperCase() || teamName.slice(0, 3).toUpperCase()
  );
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

function hasSeenMobileIntroInSession(): boolean {
  if (typeof window === "undefined") return true;

  try {
    return window.sessionStorage.getItem(MOBILE_INTRO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markMobileIntroAsSeen(): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(MOBILE_INTRO_SESSION_KEY, "1");
  } catch {
    return;
  }
}

function shouldShowMobileIntro(params: {
  platform: InstallPlatform;
  isStandalone: boolean;
}): boolean {
  return (
    params.isStandalone &&
    (params.platform === "ios" || params.platform === "android") &&
    !hasSeenMobileIntroInSession()
  );
}

function getSystemPreferredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getStoredThemePreference(): ThemeMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }
  } catch {
    return null;
  }

  return null;
}

function getInitialTheme(): ThemeMode {
  return getStoredThemePreference() ?? getSystemPreferredTheme();
}

function App() {
  const [currentPath, setCurrentPath] = useState(
    () => window.location.pathname,
  );
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [hasExplicitThemePreference, setHasExplicitThemePreference] = useState(
    () => getStoredThemePreference() !== null,
  );
  const [user, setUser] = useState<User | null>(() => getCurrentGoogleUser());
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [installPlatform, setInstallPlatform] =
    useState<InstallPlatform>("other");
  const [isInstallCheckComplete, setIsInstallCheckComplete] = useState(false);
  const [shouldShowInstallPage, setShouldShowInstallPage] = useState(false);
  const [shouldShowMobileIntroPage, setShouldShowMobileIntroPage] =
    useState(false);
  const [isRevealOverlayVisible, setIsRevealOverlayVisible] = useState(false);
  const [isRevealOverlayOpaque, setIsRevealOverlayOpaque] = useState(false);
  const [isThemeOverlayVisible, setIsThemeOverlayVisible] = useState(false);
  const [isThemeOverlayOpaque, setIsThemeOverlayOpaque] = useState(false);
  const [themeOverlayMode, setThemeOverlayMode] = useState<ThemeMode>(theme);
  const [resultsByGroup, setResultsByGroup] = useState<
    WorldCupResultsByGroup[]
  >([]);
  const [liveMatches, setLiveMatches] = useState<WorldCupResultMatch[]>([]);
  const [leaderboardEntries, setLeaderboardEntries] = useState<
    UserLeaderboardEntry[]
  >([]);
  const [allPredictions, setAllPredictions] = useState<MatchPrediction[]>([]);
  const [userPredictions, setUserPredictions] = useState<MatchPrediction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [officialStartMs, setOfficialStartMs] = useState<number | null>(null);
  const [hasOfficialStartBegun, setHasOfficialStartBegun] = useState(true);
  const [liveClockMs, setLiveClockMs] = useState(() => Date.now());
  const [isSmallScreen, setIsSmallScreen] = useState(
    () => window.matchMedia?.("(max-width: 767px)").matches ?? false,
  );
  const [favoriteTeamKey, setFavoriteTeamKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(FAVORITE_TEAM_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const favoriteTeamKeyFromFirebaseRef = useRef<string | null | undefined>(
    undefined,
  );
  const themePreferenceFromFirebaseRef = useRef<ThemeMode | null | undefined>(
    undefined,
  );
  const recentResultsScrollerRef = useRef<HTMLDivElement | null>(null);
  const themeTransitionTimeoutRef = useRef<number | null>(null);
  const isDarkMode = theme === "dark";
  const isFavoriteTeamPage = currentPath === "/seleccion-favorita";
  const isMundialPage = currentPath === "/mundial";
  const isAllPredictionsPage = currentPath === "/predicciones";
  const isUsersTablePage = currentPath === "/posiciones";
  const liveMatch = liveMatches[0] ?? null;
  const recentlyPlayedMatches = useMemo(() => {
    const nowMs = liveClockMs;
    const windowStartMs = nowMs - 24 * 60 * 60 * 1000;

    return resultsByGroup
      .flatMap((group) => group.matches)
      .filter((match) => {
        if (!hasFinalMatchStatus(match.status)) {
          return false;
        }

        if (
          typeof match.homeTeam.score !== "number" ||
          typeof match.awayTeam.score !== "number"
        ) {
          return false;
        }

        const matchMs = getMatchStartMs(match);
        if (matchMs === null) {
          return false;
        }

        return matchMs >= windowStartMs && matchMs <= nowMs;
      })
      .sort((a, b) => (getMatchStartMs(b) ?? 0) - (getMatchStartMs(a) ?? 0));
  }, [liveClockMs, resultsByGroup]);
  const mobileRecentMatches = useMemo(() => {
    if (!isSmallScreen) return recentlyPlayedMatches;
    if (recentlyPlayedMatches.length === 0) return [];
    return [...recentlyPlayedMatches, ...recentlyPlayedMatches];
  }, [isSmallScreen, recentlyPlayedMatches]);
  const currentUserPredictionsByMatchId = useMemo(() => {
    return new Map(
      userPredictions.map(
        (prediction) => [prediction.matchId, prediction] as const,
      ),
    );
  }, [userPredictions]);
  const playedResults = useMemo<PlayedMatchResult[]>(() => {
    return resultsByGroup.flatMap((group) =>
      group.matches.flatMap((match) => {
        if (
          !hasFinalMatchStatus(match.status) ||
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
      }),
    );
  }, [resultsByGroup]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    root.classList.toggle("dark", isDarkMode);

    try {
      if (hasExplicitThemePreference) {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      } else {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      }
    } catch {
      return;
    }
  }, [hasExplicitThemePreference, isDarkMode, theme]);

  useEffect(() => {
    if (hasExplicitThemePreference || typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mediaQuery) {
      return;
    }

    const handleChange = () => {
      setTheme(mediaQuery.matches ? "dark" : "light");
    };

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [hasExplicitThemePreference]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    if (isThemeOverlayVisible) {
      root.classList.add("theme-transitioning");
    } else {
      root.classList.remove("theme-transitioning");
    }

    return () => {
      root.classList.remove("theme-transitioning");
    };
  }, [isThemeOverlayVisible]);

  useEffect(() => {
    return () => {
      if (themeTransitionTimeoutRef.current !== null) {
        window.clearTimeout(themeTransitionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (favoriteTeamKey) {
        window.localStorage.setItem(FAVORITE_TEAM_STORAGE_KEY, favoriteTeamKey);
      } else {
        window.localStorage.removeItem(FAVORITE_TEAM_STORAGE_KEY);
      }
    } catch {
      return;
    }
  }, [favoriteTeamKey]);

  useEffect(() => {
    if (!user) {
      return;
    }

    return onUserProfileSnapshot({
      userId: user.uid,
      callback: (profile) => {
        if (!profile) {
          favoriteTeamKeyFromFirebaseRef.current = null;
          themePreferenceFromFirebaseRef.current = undefined;
          return;
        }

        const profileAny = profile as unknown as Record<string, unknown>;
        const hasFavoriteTeamKey = Object.prototype.hasOwnProperty.call(
          profileAny,
          "favoriteTeamKey",
        );
        const hasThemeMode = Object.prototype.hasOwnProperty.call(
          profileAny,
          "themeMode",
        );

        if (!hasFavoriteTeamKey) {
          if (favoriteTeamKey) {
            favoriteTeamKeyFromFirebaseRef.current = favoriteTeamKey;
            void setUserFavoriteTeamKey({
              userId: user.uid,
              favoriteTeamKey,
            }).catch(() => null);
          }
        } else {
          const firebaseFavorite =
            typeof profile.favoriteTeamKey === "string"
              ? profile.favoriteTeamKey
              : null;
          favoriteTeamKeyFromFirebaseRef.current = firebaseFavorite;
          setFavoriteTeamKey((current) =>
            current === firebaseFavorite ? current : firebaseFavorite,
          );
        }

        if (!hasThemeMode) {
          themePreferenceFromFirebaseRef.current = null;
          return;
        }

        const firebaseTheme =
          profile.themeMode === "light" || profile.themeMode === "dark"
            ? profile.themeMode
            : null;
        themePreferenceFromFirebaseRef.current = firebaseTheme;

        if (firebaseTheme) {
          setHasExplicitThemePreference(true);
          setTheme((current) =>
            current === firebaseTheme ? current : firebaseTheme,
          );
          return;
        }

        setHasExplicitThemePreference(false);
        const systemTheme = getSystemPreferredTheme();
        setTheme((current) =>
          current === systemTheme ? current : systemTheme,
        );
      },
    });
  }, [favoriteTeamKey, user]);

  useEffect(() => {
    if (!user || !hasExplicitThemePreference) {
      return;
    }

    if (themePreferenceFromFirebaseRef.current === theme) {
      return;
    }

    themePreferenceFromFirebaseRef.current = theme;
    void setUserThemeMode({
      userId: user.uid,
      themeMode: theme,
    }).catch(() => null);
  }, [hasExplicitThemePreference, theme, user]);
  const leaderboardUsers = useMemo<UsersTableRow[]>(() => {
    const statsByUserId = new Map<
      string,
      {
        points: number;
        exactHits: number;
        outcomeHits: number;
        misses: number;
        predictions: number;
      }
    >();

    if (hasOfficialStartBegun && typeof officialStartMs === "number") {
      const matchStartMsById = new Map(
        resultsByGroup
          .flatMap((group) => group.matches)
          .map((match) => [match.id, getMatchStartMs(match)] as const)
          .filter((entry): entry is readonly [string, number] => {
            const [, ms] = entry;
            return typeof ms === "number" && Number.isFinite(ms);
          }),
      );
      const eligibleResultsByMatchId = new Map(
        playedResults
          .map((result) => {
            const startMs = matchStartMsById.get(result.matchId) ?? null;
            return startMs !== null && startMs >= officialStartMs
              ? ([result.matchId, result] as const)
              : null;
          })
          .filter(
            (entry): entry is readonly [string, PlayedMatchResult] =>
              entry !== null,
          ),
      );

      for (const prediction of allPredictions) {
        const result = eligibleResultsByMatchId.get(prediction.matchId);
        if (!result) {
          continue;
        }

        const existing = statsByUserId.get(prediction.userId) ?? {
          points: 0,
          exactHits: 0,
          outcomeHits: 0,
          misses: 0,
          predictions: 0,
        };

        const points = calculatePredictionPoints(prediction, result);
        const next = {
          ...existing,
          points: existing.points + points,
          predictions: existing.predictions + 1,
          exactHits: existing.exactHits + (points === 2 ? 1 : 0),
          outcomeHits: existing.outcomeHits + (points === 1 ? 1 : 0),
          misses: existing.misses + (points === 0 ? 1 : 0),
        };

        statsByUserId.set(prediction.userId, next);
      }
    }

    return leaderboardEntries.map((entry) => {
      const stats = statsByUserId.get(entry.userId) ?? {
        points: 0,
        exactHits: 0,
        outcomeHits: 0,
        misses: 0,
        predictions: 0,
      };

      return {
        id: entry.userId,
        name: entry.name,
        photoUrl: entry.photoUrl,
        points: stats.points,
        predictions: stats.predictions,
        exactHits: stats.exactHits,
        outcomeHits: stats.outcomeHits,
        misses: stats.misses,
      };
    });
  }, [
    allPredictions,
    hasOfficialStartBegun,
    leaderboardEntries,
    officialStartMs,
    playedResults,
    resultsByGroup,
  ]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(max-width: 767px)");
    if (!mediaQuery) {
      return;
    }

    const handleChange = () => {
      setIsSmallScreen(mediaQuery.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    if (!isSmallScreen) return;
    if (mobileRecentMatches.length <= 1) return;

    const container = recentResultsScrollerRef.current;
    if (!container) return;

    container.scrollLeft = 0;

    let rafId = 0;
    let lastTs = 0;
    const speedPxPerSecond = 40;
    const gapPx = 12;

    const step = (ts: number) => {
      if (!recentResultsScrollerRef.current) {
        return;
      }

      if (!lastTs) {
        lastTs = ts;
      }

      const deltaMs = ts - lastTs;
      lastTs = ts;

      const nextScrollLeft =
        recentResultsScrollerRef.current.scrollLeft +
        (speedPxPerSecond * deltaMs) / 1000;

      const threshold =
        recentResultsScrollerRef.current.scrollWidth / 2 - gapPx / 2;

      recentResultsScrollerRef.current.scrollLeft =
        threshold > 0 && nextScrollLeft >= threshold
          ? nextScrollLeft - threshold
          : nextScrollLeft;

      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isSmallScreen, mobileRecentMatches.length]);

  useEffect(() => {
    function refreshInstallStatus() {
      const platform = getInstallPlatform();
      const isStandalone = isRunningStandalone();

      setInstallPlatform(platform);
      setShouldShowInstallPage(
        !isStandalone && (platform === "ios" || platform === "android"),
      );
      setShouldShowMobileIntroPage(
        shouldShowMobileIntro({ platform, isStandalone }),
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
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [currentPath]);

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
          setLeaderboardEntries([]);
          setAllPredictions([]);
          setUserPredictions([]);
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
    const intervalId = window.setInterval(() => {
      setLiveClockMs(Date.now());
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

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
        setLeaderboardEntries(users);
      },
    });

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const unsubscribe = onAllPredictionsSnapshot({
      callback: (predictions) => {
        setAllPredictions(predictions);
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
          .find((match) => match.id === OFFICIAL_START_MATCH.id);

        const nextOfficialStartMs = officialStartMatch
          ? getMatchStartMs(officialStartMatch)
          : null;

        setResultsByGroup(worldCupResults);
        setLiveMatches(nextLiveMatches);
        setLiveClockMs(Date.now());
        setOfficialStartMs(nextOfficialStartMs);
        setHasOfficialStartBegun(
          officialStartMatch
            ? hasFinalMatchStatus(officialStartMatch.status)
            : false,
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

    let lastPoints: number | null = null;

    const unsubscribe = onUserPredictionsSnapshot({
      userId: user.uid,
      callback: (predictions) => {
        setUserPredictions(predictions);

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
  }, [officialStartMs, playedResults, user]);

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
          const isStandalone = isRunningStandalone();
          setInstallPlatform(platform);
          setShouldShowInstallPage(
            !isStandalone && (platform === "ios" || platform === "android"),
          );
          setShouldShowMobileIntroPage(
            shouldShowMobileIntro({ platform, isStandalone }),
          );
          setIsInstallCheckComplete(true);
        }}
      />
    );
  }

  if (shouldShowMobileIntroPage) {
    return (
      <IntroPage
        onComplete={() => {
          markMobileIntroAsSeen();
          setShouldShowMobileIntroPage(false);
          startRevealTransition();
        }}
      />
    );
  }

  if (isAuthLoading || !user) {
    return renderWithReveal(<LoginPage theme={theme} />);
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

  function handleFavoriteTeamChange(nextKey: string | null) {
    setFavoriteTeamKey(nextKey);

    if (!user) {
      return;
    }

    if (favoriteTeamKeyFromFirebaseRef.current === nextKey) {
      return;
    }

    favoriteTeamKeyFromFirebaseRef.current = nextKey;

    void setUserFavoriteTeamKey({
      userId: user.uid,
      favoriteTeamKey: nextKey,
    }).catch((writeError) => {
      setError(
        writeError instanceof Error
          ? writeError.message
          : "No se pudo guardar la selección favorita.",
      );
    });
  }

  function handleToggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";

    if (themeTransitionTimeoutRef.current !== null) {
      window.clearTimeout(themeTransitionTimeoutRef.current);
      themeTransitionTimeoutRef.current = null;
    }

    setThemeOverlayMode(theme);
    setIsThemeOverlayVisible(true);
    setIsThemeOverlayOpaque(true);
    setHasExplicitThemePreference(true);
    setTheme(nextTheme);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setIsThemeOverlayOpaque(false);
      });
    });

    themeTransitionTimeoutRef.current = window.setTimeout(() => {
      setIsThemeOverlayVisible(false);
      themeTransitionTimeoutRef.current = null;
    }, 680);
  }

  function renderPredictionBadge(
    matchId: string,
    teams: {
      homeName: string;
      awayName: string;
    },
  ) {
    const prediction = currentUserPredictionsByMatchId.get(matchId);

    return (
      <div
        className={`mt-3 border-t pt-3 ${
          isDarkMode ? "border-zinc-700" : "border-zinc-100"
        }`}
      >
        <p
          className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
            isDarkMode ? "text-zinc-400" : "text-zinc-500"
          }`}
        >
          Tu prediccion
        </p>
        <p
          className={`mt-1 text-sm font-semibold ${
            isDarkMode ? "text-zinc-100" : "text-zinc-900"
          }`}
        >
          {prediction
            ? `${getCountryAbbreviation(teams.homeName)} ${prediction.predictedHomeGoals} - ${prediction.predictedAwayGoals} ${getCountryAbbreviation(teams.awayName)}`
            : "Sin cargar"}
        </p>
      </div>
    );
  }

  function startRevealTransition() {
    setIsRevealOverlayVisible(true);
    setIsRevealOverlayOpaque(true);

    window.requestAnimationFrame(() => {
      setIsRevealOverlayOpaque(false);
    });

    window.setTimeout(() => {
      setIsRevealOverlayVisible(false);
    }, 700);
  }

  function renderWithReveal(content: React.ReactNode) {
    return (
      <>
        {content}
        {isRevealOverlayVisible && (
          <div
            className={`pointer-events-none fixed inset-0 z-100 bg-black transition-opacity duration-700 ${
              isRevealOverlayOpaque ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
        {isThemeOverlayVisible && (
          <div
            className={`pointer-events-none fixed inset-0 z-90 transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isThemeOverlayOpaque ? "opacity-100" : "opacity-0"
            } ${
              themeOverlayMode === "dark"
                ? "bg-[radial-gradient(circle_at_top,#064e3b_0%,#09090b_34%,#09090b_100%)]"
                : "bg-[radial-gradient(circle_at_top,#d1fae5_0%,#f8fafc_30%,#f8fafc_100%)]"
            }`}
          />
        )}
      </>
    );
  }

  return renderWithReveal(
    <main
      id="top"
      data-app-shell="true"
      className={`min-h-screen ${
        isDarkMode
          ? "bg-[radial-gradient(circle_at_top,#064e3b_0%,#09090b_34%,#09090b_100%)] text-zinc-100"
          : "bg-[radial-gradient(circle_at_top,#d1fae5_0%,#f8fafc_30%,#f8fafc_100%)] text-zinc-950"
      }`}
    >
      <Header
        onLogout={() => void handleLogout()}
        onNavigate={handleNavigate}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        currentPath={
          isFavoriteTeamPage
            ? "/seleccion-favorita"
            : isMundialPage
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
          <div
            className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
              isDarkMode
                ? "border-rose-900/50 bg-rose-950/40 text-rose-200"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            Error: <span className="font-medium">{error}</span>
          </div>
        )}

        {isFavoriteTeamPage ? (
          <FavoriteTeamPage
            favoriteTeamKey={favoriteTeamKey}
            onFavoriteTeamChange={handleFavoriteTeamChange}
          />
        ) : isMundialPage ? (
          <MundialPage favoriteTeamKey={favoriteTeamKey} />
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
                  <h2
                    className={`mt-1 text-xl font-semibold ${
                      isDarkMode ? "text-zinc-50" : "text-zinc-950"
                    }`}
                  >
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
                  {liveMatches.map((match) => {
                    const isFavoriteHome =
                      favoriteTeamKey !== null &&
                      (match.homeTeam.id ?? match.homeTeam.name) ===
                        favoriteTeamKey;
                    const isFavoriteAway =
                      favoriteTeamKey !== null &&
                      (match.awayTeam.id ?? match.awayTeam.name) ===
                        favoriteTeamKey;

                    return (
                      <article
                        key={match.id}
                        className={`overflow-hidden rounded-3xl border ${
                          isDarkMode
                            ? "border-emerald-900/40 bg-zinc-900 shadow-[0_20px_40px_rgba(0,0,0,0.35)]"
                            : "border-emerald-200 bg-white shadow-sm"
                        } ${
                          liveMatches.length > 1
                            ? "min-w-[280px] max-w-[320px] shrink-0 snap-start"
                            : ""
                        }`}
                      >
                        <div
                          className={`border-b px-4 py-3 ${
                            isDarkMode
                              ? "border-emerald-900/40 bg-linear-to-r from-emerald-950/70 to-zinc-900"
                              : "border-emerald-100 bg-linear-to-r from-emerald-50 to-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                                Grupo {match.group}
                              </p>
                              <p
                                className={`mt-1 truncate text-sm font-medium ${
                                  isDarkMode ? "text-zinc-300" : "text-zinc-600"
                                }`}
                              >
                                {match.venue ?? "Sede a confirmar"}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                                isDarkMode
                                  ? "bg-rose-950/60 text-rose-200"
                                  : "bg-rose-100 text-rose-700"
                              }`}
                            >
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
                                  <div
                                    className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${
                                      isDarkMode
                                        ? "bg-zinc-800 text-zinc-200"
                                        : "bg-zinc-100 text-zinc-700"
                                    }`}
                                  >
                                    {match.homeTeam.name.slice(0, 1)}
                                  </div>
                                )}
                                <p
                                  className={`truncate text-base font-semibold ${
                                    isDarkMode
                                      ? "text-zinc-50"
                                      : "text-zinc-950"
                                  }`}
                                >
                                  {match.homeTeam.name}
                                  {isFavoriteHome && (
                                    <span className="text-amber-500"> ★</span>
                                  )}
                                </p>
                              </div>
                              <span
                                className={`text-2xl font-bold ${
                                  isDarkMode ? "text-zinc-50" : "text-zinc-950"
                                }`}
                              >
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
                                  <div
                                    className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${
                                      isDarkMode
                                        ? "bg-zinc-800 text-zinc-200"
                                        : "bg-zinc-100 text-zinc-700"
                                    }`}
                                  >
                                    {match.awayTeam.name.slice(0, 1)}
                                  </div>
                                )}
                                <p
                                  className={`truncate text-base font-semibold ${
                                    isDarkMode
                                      ? "text-zinc-50"
                                      : "text-zinc-950"
                                  }`}
                                >
                                  {match.awayTeam.name}
                                  {isFavoriteAway && (
                                    <span className="text-amber-500"> ★</span>
                                  )}
                                </p>
                              </div>
                              <span
                                className={`text-2xl font-bold ${
                                  isDarkMode ? "text-zinc-50" : "text-zinc-950"
                                }`}
                              >
                                {match.awayTeam.score ?? 0}
                              </span>
                            </div>
                          </div>
                          {renderPredictionBadge(match.id, {
                            homeName: match.homeTeam.name,
                            awayName: match.awayTeam.name,
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {recentlyPlayedMatches.length > 0 && (
              <section className="relative left-1/2 right-1/2 mx-[-50vw] mb-8 w-screen">
                <div className="px-4 md:px-8">
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                      Resultados
                    </p>
                    <h2
                      className={`mt-1 text-xl font-semibold ${
                        isDarkMode ? "text-zinc-50" : "text-zinc-950"
                      }`}
                    >
                      Últimas 24 hs
                    </h2>
                  </div>

                  <div
                    ref={recentResultsScrollerRef}
                    className="flex gap-3 overflow-x-auto pb-3 md:hidden"
                  >
                    {mobileRecentMatches.map((match, index) => {
                      const matchMs = getMatchStartMs(match);
                      const matchDate = matchMs === null ? null : matchMs;
                      const isFavoriteHome =
                        favoriteTeamKey !== null &&
                        (match.homeTeam.id ?? match.homeTeam.name) ===
                          favoriteTeamKey;
                      const isFavoriteAway =
                        favoriteTeamKey !== null &&
                        (match.awayTeam.id ?? match.awayTeam.name) ===
                          favoriteTeamKey;

                      return (
                        <article
                          key={`${match.id}-${index}`}
                          className={`w-[220px] shrink-0 overflow-hidden rounded-md border ${
                            isDarkMode
                              ? "border-zinc-800 bg-zinc-900 shadow-[0_18px_30px_rgba(0,0,0,0.3)]"
                              : "border-zinc-200 bg-white shadow-sm"
                          }`}
                        >
                          <div
                            className={`border-b px-3 py-2 ${
                              isDarkMode
                                ? "border-zinc-800 bg-zinc-950/70"
                                : "border-zinc-100 bg-zinc-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                                  Grupo {match.group}
                                </p>
                                <p
                                  className={`mt-1 truncate text-xs font-medium ${
                                    isDarkMode
                                      ? "text-zinc-300"
                                      : "text-zinc-600"
                                  }`}
                                >
                                  {matchDate
                                    ? formatPlayedMatchDate(matchDate)
                                    : (match.venue ?? "Final")}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                                  isDarkMode
                                    ? "bg-emerald-950/60 text-emerald-200"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                Final
                              </span>
                            </div>
                          </div>

                          <div className="px-3 py-3">
                            <div className="grid gap-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  {match.homeTeam.badgeUrl ? (
                                    <img
                                      src={match.homeTeam.badgeUrl}
                                      alt={match.homeTeam.name}
                                      className="h-7 w-7 object-contain"
                                    />
                                  ) : (
                                    <div
                                      className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                                        isDarkMode
                                          ? "bg-zinc-800 text-zinc-200"
                                          : "bg-zinc-100 text-zinc-700"
                                      }`}
                                    >
                                      {match.homeTeam.name.slice(0, 1)}
                                    </div>
                                  )}
                                  <p
                                    className={`truncate text-sm font-semibold ${
                                      isDarkMode
                                        ? "text-zinc-50"
                                        : "text-zinc-950"
                                    }`}
                                  >
                                    {match.homeTeam.name}
                                    {isFavoriteHome && (
                                      <span className="text-amber-500"> ★</span>
                                    )}
                                  </p>
                                </div>
                                <span
                                  className={`text-xl font-bold ${
                                    isDarkMode
                                      ? "text-zinc-50"
                                      : "text-zinc-950"
                                  }`}
                                >
                                  {match.homeTeam.score}
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  {match.awayTeam.badgeUrl ? (
                                    <img
                                      src={match.awayTeam.badgeUrl}
                                      alt={match.awayTeam.name}
                                      className="h-7 w-7 object-contain"
                                    />
                                  ) : (
                                    <div
                                      className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                                        isDarkMode
                                          ? "bg-zinc-800 text-zinc-200"
                                          : "bg-zinc-100 text-zinc-700"
                                      }`}
                                    >
                                      {match.awayTeam.name.slice(0, 1)}
                                    </div>
                                  )}
                                  <p
                                    className={`truncate text-sm font-semibold ${
                                      isDarkMode
                                        ? "text-zinc-50"
                                        : "text-zinc-950"
                                    }`}
                                  >
                                    {match.awayTeam.name}
                                    {isFavoriteAway && (
                                      <span className="text-amber-500"> ★</span>
                                    )}
                                  </p>
                                </div>
                                <span
                                  className={`text-xl font-bold ${
                                    isDarkMode
                                      ? "text-zinc-50"
                                      : "text-zinc-950"
                                  }`}
                                >
                                  {match.awayTeam.score}
                                </span>
                              </div>
                            </div>
                            {renderPredictionBadge(match.id, {
                              homeName: match.homeTeam.name,
                              awayName: match.awayTeam.name,
                            })}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="hidden md:flex md:gap-4">
                    {recentlyPlayedMatches.slice(0, 4).map((match) => {
                      const matchMs = getMatchStartMs(match);
                      const matchDate = matchMs === null ? null : matchMs;
                      const isFavoriteHome =
                        favoriteTeamKey !== null &&
                        (match.homeTeam.id ?? match.homeTeam.name) ===
                          favoriteTeamKey;
                      const isFavoriteAway =
                        favoriteTeamKey !== null &&
                        (match.awayTeam.id ?? match.awayTeam.name) ===
                          favoriteTeamKey;

                      return (
                        <article
                          key={match.id}
                          className={`w-[calc((100%-3rem)/4)] shrink-0 overflow-hidden rounded-md border ${
                            isDarkMode
                              ? "border-zinc-800 bg-zinc-900 shadow-[0_18px_30px_rgba(0,0,0,0.3)]"
                              : "border-zinc-200 bg-white shadow-sm"
                          }`}
                        >
                          <div
                            className={`border-b px-4 py-3 ${
                              isDarkMode
                                ? "border-zinc-800 bg-zinc-950/70"
                                : "border-zinc-100 bg-zinc-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                                  Grupo {match.group}
                                </p>
                                <p
                                  className={`mt-1 truncate text-sm font-medium ${
                                    isDarkMode
                                      ? "text-zinc-300"
                                      : "text-zinc-600"
                                  }`}
                                >
                                  {matchDate
                                    ? formatPlayedMatchDate(matchDate)
                                    : (match.venue ?? "Final")}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                                  isDarkMode
                                    ? "bg-emerald-950/60 text-emerald-200"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                Final
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
                                    <div
                                      className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${
                                        isDarkMode
                                          ? "bg-zinc-800 text-zinc-200"
                                          : "bg-zinc-100 text-zinc-700"
                                      }`}
                                    >
                                      {match.homeTeam.name.slice(0, 1)}
                                    </div>
                                  )}
                                  <p
                                    className={`truncate text-base font-semibold ${
                                      isDarkMode
                                        ? "text-zinc-50"
                                        : "text-zinc-950"
                                    }`}
                                  >
                                    {match.homeTeam.name}
                                    {isFavoriteHome && (
                                      <span className="text-amber-500"> ★</span>
                                    )}
                                  </p>
                                </div>
                                <span
                                  className={`text-2xl font-bold ${
                                    isDarkMode
                                      ? "text-zinc-50"
                                      : "text-zinc-950"
                                  }`}
                                >
                                  {match.homeTeam.score}
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
                                    <div
                                      className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${
                                        isDarkMode
                                          ? "bg-zinc-800 text-zinc-200"
                                          : "bg-zinc-100 text-zinc-700"
                                      }`}
                                    >
                                      {match.awayTeam.name.slice(0, 1)}
                                    </div>
                                  )}
                                  <p
                                    className={`truncate text-base font-semibold ${
                                      isDarkMode
                                        ? "text-zinc-50"
                                        : "text-zinc-950"
                                    }`}
                                  >
                                    {match.awayTeam.name}
                                    {isFavoriteAway && (
                                      <span className="text-amber-500"> ★</span>
                                    )}
                                  </p>
                                </div>
                                <span
                                  className={`text-2xl font-bold ${
                                    isDarkMode
                                      ? "text-zinc-50"
                                      : "text-zinc-950"
                                  }`}
                                >
                                  {match.awayTeam.score}
                                </span>
                              </div>
                            </div>
                            {renderPredictionBadge(match.id, {
                              homeName: match.homeTeam.name,
                              awayName: match.awayTeam.name,
                            })}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            <section id="mis-predicciones">
              <Prode userId={user.uid} theme={theme} />
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
    </main>,
  );
}

export default App;
