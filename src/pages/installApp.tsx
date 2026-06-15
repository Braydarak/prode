import { useEffect, useState } from "react";
import mundialBg from "../assets/mundial.png";

type InstallPlatform = "ios" | "android";

type InstallAppPageProps = {
  platform: InstallPlatform;
  onRefreshInstallStatus: () => void;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function getAndroidInstallHint(): string {
  return "Si no aparece el boton, abri el menu del navegador y elegi 'Instalar app' o 'Agregar a pantalla de inicio'.";
}

export default function InstallAppPage({
  platform,
  onRefreshInstallStatus,
}: InstallAppPageProps) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setDeferredPrompt(null);
      onRefreshInstallStatus();
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [onRefreshInstallStatus]);

  async function handleInstall() {
    if (!deferredPrompt) {
      return;
    }

    setError(null);
    setIsInstalling(true);

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome === "dismissed") {
        setError("Se cancelo la instalacion. Podes intentarlo de nuevo.");
      }
    } catch (installError) {
      setError(
        installError instanceof Error
          ? installError.message
          : "No se pudo iniciar la instalacion.",
      );
    } finally {
      setIsInstalling(false);
      setDeferredPrompt(null);
      onRefreshInstallStatus();
    }
  }

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-zinc-950 text-white"
      style={{
        backgroundImage: `url(${mundialBg})`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className="absolute inset-0 bg-linear-to-br from-black/80 via-black/65 to-emerald-950/70" />

      <section className="relative mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4 py-10">
        <div className="w-full rounded-3xl border border-white/15 bg-black/35 p-6 shadow-2xl backdrop-blur-md md:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">
            Instalar app
          </p>

          <h1 className="mt-3 text-3xl font-semibold md:text-4xl">
            Para usar el prode, instalala en tu celu
          </h1>

          <p className="mt-4 text-sm text-zinc-200 md:text-base">
            Detectamos que todavia no esta instalada. Asi evitamos problemas de
            sesion y te queda mucho mas comoda para abrir desde el inicio.
          </p>

          {platform === "android" ? (
            <div className="mt-8 space-y-4">
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                <p className="text-lg font-semibold">Android</p>
                <p className="mt-2 text-sm text-zinc-200">
                  Instalala desde el navegador para abrirla como app.
                </p>
              </div>

              {deferredPrompt ? (
                <button
                  type="button"
                  onClick={() => void handleInstall()}
                  disabled={isInstalling}
                  className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-white px-6 text-base font-semibold text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  {isInstalling ? "Instalando..." : "Instalar app"}
                </button>
              ) : (
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4 text-sm text-zinc-100">
                  {getAndroidInstallHint()}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-8 space-y-4">
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                <p className="text-lg font-semibold">iPhone</p>
                <p className="mt-2 text-sm text-zinc-200">
                  En iOS la instalacion se hace manualmente desde Safari.
                </p>
              </div>

              <ol className="space-y-3 rounded-2xl border border-white/15 bg-white/10 p-5 text-sm text-zinc-100">
                <li>1. Abri esta pagina en Safari.</li>
                <li>2. Tocá el boton Compartir.</li>
                <li>3. Elegi "Agregar a pantalla de inicio".</li>
                <li>4. Abrí la app desde el icono nuevo en tu inicio.</li>
              </ol>

              <p className="text-sm text-zinc-300">
                Si la abriste desde Chrome u otro navegador en iPhone, hacelo
                desde Safari para poder instalarla.
              </p>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

          <button
            type="button"
            onClick={onRefreshInstallStatus}
            className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-6 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            Ya la instale, revisar de nuevo
          </button>
        </div>
      </section>
    </main>
  );
}
