import { getFirestore, type Firestore } from "firebase/firestore";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseAppInstance } from "./googleLogin";

export type MatchOutcome = "HOME" | "DRAW" | "AWAY";

export type MatchPrediction = {
  matchId: string;
  userId: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  group: string | null;
  round: number | null;
  scheduledTimestamp: string | null;
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  createdAt: unknown;
  updatedAt: unknown;
};

export type PlayedMatchResult = {
  matchId: string;
  homeGoals: number;
  awayGoals: number;
};

export type UserLeaderboardEntry = {
  userId: string;
  name: string;
  email: string | null;
  photoUrl: string | null;
  points: number;
  createdAt: unknown;
  updatedAt: unknown;
};

let firestoreDb: Firestore | null = null;

export function getFirebaseFirestoreInstance(): Firestore {
  if (firestoreDb) return firestoreDb;
  firestoreDb = getFirestore(getFirebaseAppInstance());
  return firestoreDb;
}

function getOutcome(homeGoals: number, awayGoals: number): MatchOutcome {
  if (homeGoals === awayGoals) return "DRAW";
  return homeGoals > awayGoals ? "HOME" : "AWAY";
}

function assertValidGoals(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`${label} debe ser un entero >= 0.`);
  }
}

export function calculatePredictionPoints(
  prediction: Pick<
    MatchPrediction,
    "predictedHomeGoals" | "predictedAwayGoals"
  >,
  result: PlayedMatchResult,
): 0 | 1 | 2 {
  assertValidGoals(prediction.predictedHomeGoals, "Goles local");
  assertValidGoals(prediction.predictedAwayGoals, "Goles visitante");
  assertValidGoals(result.homeGoals, "Goles local (resultado)");
  assertValidGoals(result.awayGoals, "Goles visitante (resultado)");

  if (
    prediction.predictedHomeGoals === result.homeGoals &&
    prediction.predictedAwayGoals === result.awayGoals
  ) {
    return 2;
  }

  const predictedOutcome = getOutcome(
    prediction.predictedHomeGoals,
    prediction.predictedAwayGoals,
  );
  const actualOutcome = getOutcome(result.homeGoals, result.awayGoals);

  return predictedOutcome === actualOutcome ? 1 : 0;
}

function getPredictionDocRef(userId: string, matchId: string) {
  return doc(
    getFirebaseFirestoreInstance(),
    "users",
    userId,
    "predictions",
    matchId,
  );
}

export async function upsertUserMatchPrediction(input: {
  userId: string;
  matchId: string;
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeTeamName?: string;
  awayTeamName?: string;
  group?: string | null;
  round?: number | null;
  scheduledTimestamp?: string | null;
}): Promise<void> {
  assertValidGoals(input.predictedHomeGoals, "Goles local");
  assertValidGoals(input.predictedAwayGoals, "Goles visitante");

  const ref = getPredictionDocRef(input.userId, input.matchId);
  const existing = await getDoc(ref);

  const payload: Omit<MatchPrediction, "createdAt" | "updatedAt"> &
    Partial<Pick<MatchPrediction, "createdAt">> &
    Pick<MatchPrediction, "updatedAt"> = {
    matchId: input.matchId,
    userId: input.userId,
    homeTeamId: input.homeTeamId ?? null,
    awayTeamId: input.awayTeamId ?? null,
    homeTeamName: input.homeTeamName ?? "",
    awayTeamName: input.awayTeamName ?? "",
    group: input.group ?? null,
    round: input.round ?? null,
    scheduledTimestamp: input.scheduledTimestamp ?? null,
    predictedHomeGoals: input.predictedHomeGoals,
    predictedAwayGoals: input.predictedAwayGoals,
    updatedAt: serverTimestamp(),
    ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
  };

  await setDoc(ref, payload, { merge: true });
}

export async function getUserMatchPrediction(params: {
  userId: string;
  matchId: string;
}): Promise<MatchPrediction | null> {
  const snapshot = await getDoc(
    getPredictionDocRef(params.userId, params.matchId),
  );
  if (!snapshot.exists()) return null;
  return snapshot.data() as MatchPrediction;
}

export async function getAllUserMatchPredictions(
  userId: string,
): Promise<MatchPrediction[]> {
  const predictionsRef = collection(
    getFirebaseFirestoreInstance(),
    "users",
    userId,
    "predictions",
  );
  const predictionsSnapshot = await getDocs(
    query(predictionsRef, orderBy("updatedAt", "desc")),
  );
  return predictionsSnapshot.docs.map(
    (docSnap) => docSnap.data() as MatchPrediction,
  );
}

export function onUserPredictionsSnapshot(params: {
  userId: string;
  callback: (predictions: MatchPrediction[]) => void;
}): Unsubscribe {
  const q = query(
    collection(
      getFirebaseFirestoreInstance(),
      "users",
      params.userId,
      "predictions",
    ),
    orderBy("updatedAt", "desc"),
  );

  return onSnapshot(q, (snapshot) => {
    params.callback(
      snapshot.docs.map((docSnap) => docSnap.data() as MatchPrediction),
    );
  });
}

export function onAllPredictionsSnapshot(params: {
  callback: (predictions: MatchPrediction[]) => void;
}): Unsubscribe {
  return onSnapshot(
    collectionGroup(getFirebaseFirestoreInstance(), "predictions"),
    (snapshot) => {
      params.callback(
        snapshot.docs
          .map((docSnap) => docSnap.data() as MatchPrediction)
          .sort((predictionA, predictionB) => {
            const dateA = predictionA.scheduledTimestamp ?? "";
            const dateB = predictionB.scheduledTimestamp ?? "";

            return dateA.localeCompare(dateB);
          }),
      );
    },
  );
}

export function calculateTotalPoints(params: {
  predictions: MatchPrediction[];
  playedResults: PlayedMatchResult[];
}): number {
  const resultsByMatchId = new Map(
    params.playedResults.map((result) => [result.matchId, result] as const),
  );

  return params.predictions.reduce((total, prediction) => {
    const result = resultsByMatchId.get(prediction.matchId);
    if (!result) return total;
    return total + calculatePredictionPoints(prediction, result);
  }, 0);
}

function getUserDocRef(userId: string) {
  return doc(getFirebaseFirestoreInstance(), "users", userId);
}

export async function upsertUserLeaderboardProfile(input: {
  userId: string;
  name: string;
  email?: string | null;
  photoUrl?: string | null;
}): Promise<void> {
  const ref = getUserDocRef(input.userId);
  const existing = await getDoc(ref);

  const payload: Partial<UserLeaderboardEntry> & {
    userId: string;
    name: string;
    email: string | null;
    photoUrl: string | null;
    updatedAt: unknown;
  } = {
    userId: input.userId,
    name: input.name,
    email: input.email ?? null,
    photoUrl: input.photoUrl ?? null,
    updatedAt: serverTimestamp(),
    ...(existing.exists() ? {} : { createdAt: serverTimestamp(), points: 0 }),
  };

  await setDoc(ref, payload, { merge: true });
}

export async function setUserLeaderboardPoints(input: {
  userId: string;
  points: number;
}): Promise<void> {
  if (!Number.isFinite(input.points) || input.points < 0) {
    throw new Error("Los puntos deben ser un número >= 0.");
  }

  await setDoc(
    getUserDocRef(input.userId),
    { points: input.points, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function onLeaderboardSnapshot(params: {
  callback: (users: UserLeaderboardEntry[]) => void;
  limitCount?: number;
}): Unsubscribe {
  const q = query(
    collection(getFirebaseFirestoreInstance(), "users"),
    orderBy("points", "desc"),
    limit(params.limitCount ?? 50),
  );

  return onSnapshot(q, (snapshot) => {
    params.callback(
      snapshot.docs.map(
        (docSnap) => docSnap.data() as unknown as UserLeaderboardEntry,
      ),
    );
  });
}

export async function getLeaderboardEntries(
  limitCount = 50,
): Promise<UserLeaderboardEntry[]> {
  const snapshot = await getDocs(
    query(
      collection(getFirebaseFirestoreInstance(), "users"),
      orderBy("points", "desc"),
      limit(limitCount),
    ),
  );

  return snapshot.docs.map(
    (docSnap) => docSnap.data() as unknown as UserLeaderboardEntry,
  );
}

export async function getAllPredictions(): Promise<MatchPrediction[]> {
  const snapshot = await getDocs(
    collectionGroup(getFirebaseFirestoreInstance(), "predictions"),
  );

  return snapshot.docs
    .map((docSnap) => docSnap.data() as MatchPrediction)
    .sort((predictionA, predictionB) => {
      const dateA = predictionA.scheduledTimestamp ?? "";
      const dateB = predictionB.scheduledTimestamp ?? "";

      return dateA.localeCompare(dateB);
    });
}
