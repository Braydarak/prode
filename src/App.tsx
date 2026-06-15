import { useEffect, useState } from "react";
import "./App.css";
import { getWorldCup2026Groups } from "./services";
import {
  getWorldCup2026ResultsByGroup,
  type WorldCupResultsByGroup,
} from "./services/results";
import AllPredictionsPage from "./pages/allPredictions";
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

function App() {
  const currentPath = window.location.pathname;
  const isMundialPage = currentPath === "/mundial";
  const isAllPredictionsPage = currentPath === "/predicciones";
  const isUsersTablePage = currentPath === "/posiciones";
  const [user, setUser] = useState<User | null>(() => getCurrentGoogleUser());
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [resultsByGroup, setResultsByGroup] = useState<
    WorldCupResultsByGroup[]
  >([]);
  const [leaderboardUsers, setLeaderboardUsers] = useState<UsersTableRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [officialStartMs, setOfficialStartMs] = useState<number | null>(null);
  const [hasOfficialStartBegun, setHasOfficialStartBegun] = useState(true);

  useEffect(() => {
    const unsubscribe = onGoogleAuthStateChanged((nextUser) => {
      setUser(nextUser);
      setIsAuthLoading(false);

      if (!nextUser) {
        setResultsByGroup([]);
        setLeaderboardUsers([]);
        setIsLoading(true);
        setOfficialStartMs(null);
        setHasOfficialStartBegun(true);
        setError(null);
      }
    });

    return unsubscribe;
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
        const [worldCupResults, worldCupGroups] = await Promise.all([
          getWorldCup2026ResultsByGroup(),
          getWorldCup2026Groups(),
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

  return (
    <main
      id="top"
      className="min-h-screen bg-[radial-gradient(circle_at_top,#d1fae5_0%,#f8fafc_30%,#f8fafc_100%)]"
    >
      <Header
        onLogout={() => void handleLogout()}
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
