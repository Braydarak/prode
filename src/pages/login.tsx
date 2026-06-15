import { useEffect, useMemo, useState } from "react";
import googleLogo from "../assets/google-logo.png";
import mundialBg from "../assets/mundial.png";

import {
  isGoogleLoginConfigured,
  onGoogleAuthStateChanged,
  signInWithGoogle,
} from "../services/googleLogin";

export default function LoginPage() {
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFirebaseConfig = useMemo(() => isGoogleLoginConfigured(), []);

  useEffect(() => {
    const unsubscribe = onGoogleAuthStateChanged(() => {
      setIsAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  async function handleGoogleLogin() {
    if (!hasFirebaseConfig) {
      setError(
        "Falta configurar Firebase (VITE_FIREBASE_API_KEY / VITE_FIREBASE_APP_ID).",
      );
      return;
    }

    setError(null);
    setIsSigningIn(true);

    try {
      await signInWithGoogle();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "No se pudo iniciar sesión.",
      );
    } finally {
      setIsSigningIn(false);
    }
  }

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-950"
      style={{
        backgroundImage: `url(${mundialBg})`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className="absolute inset-0 bg-linear-to-br from-black/70 via-black/55 to-emerald-950/60" />

      <section className="relative flex min-h-screen items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3">
          <p className="text-center uppercase text-2xl font-semibold tracking-wide text-white md:text-3xl">
            Bienvenido al prode
          </p>

          <button
            type="button"
            className="inline-flex h-16 items-center justify-center gap-3 bg-white px-8 text-base font-semibold text-zinc-950 shadow-lg transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-300 md:h-18 md:px-10"
            onClick={handleGoogleLogin}
            disabled={isAuthLoading || isSigningIn || !hasFirebaseConfig}
            aria-busy={isSigningIn}
          >
            <img
              src={googleLogo}
              alt=""
              aria-hidden="true"
              className="h-6 w-6 object-contain"
            />
            {isSigningIn ? "Conectando..." : "Iniciar sesión con Google"}
          </button>

          {error && <p className="text-center text-sm text-white">{error}</p>}
        </div>
      </section>
    </main>
  );
}
