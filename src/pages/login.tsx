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

      <section className="relative flex min-h-screen w-full flex-col px-4 py-8 md:items-center md:justify-center">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:flex-none md:items-center">
          <div className="flex flex-col items-center gap-3 pt-10 md:pt-0">
            <p className="text-center text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Prode Mundial
            </p>
            <p className="text-center text-sm leading-relaxed text-white/80 md:text-base">
              Armá tu prode, cargá tus pronósticos y seguí la tabla con tus
              amigos.
            </p>
          </div>

          <div className="mt-auto w-full space-y-3 pb-[env(safe-area-inset-bottom)] md:mt-4 md:pb-0">
            <button
              type="button"
              className="group inline-flex h-14 w-full items-center justify-center gap-3 rounded-full border border-white/15 bg-white/95 px-6 text-base font-semibold text-zinc-950 shadow-lg shadow-black/30 transition active:translate-y-px hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:transform-none disabled:cursor-not-allowed disabled:bg-white/60 disabled:text-zinc-600 md:h-15"
              onClick={handleGoogleLogin}
              disabled={isAuthLoading || isSigningIn || !hasFirebaseConfig}
              aria-busy={isSigningIn}
            >
              <img
                src={googleLogo}
                alt=""
                aria-hidden="true"
                className="h-5 w-5 shrink-0 object-contain"
              />
              <span className="truncate">
                {isSigningIn ? "Conectando..." : "Iniciar sesión con Google"}
              </span>
            </button>

            {error && (
              <p className="text-center text-sm text-white/90">{error}</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
