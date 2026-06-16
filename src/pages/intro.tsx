import { useEffect, useRef, useState } from "react";
import introMobileVideo from "../assets/intro-mobile.mp4";

type IntroPageProps = {
  onComplete: () => void;
};

export default function IntroPage({ onComplete }: IntroPageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasVideoStarted, setHasVideoStarted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const playPromise = video.play();
    if (playPromise) {
      void playPromise.catch(() => {
        return;
      });
    }
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src={introMobileVideo}
        autoPlay
        muted
        playsInline
        preload="auto"
        onPlay={() => {
          setHasVideoStarted(true);
        }}
        onEnded={onComplete}
        onError={onComplete}
      />

      <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/15 to-black/35" />

      <div className="relative flex min-h-screen items-end justify-between gap-3 px-4 py-6">
        <div className="max-w-[220px]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/80">
            Prode Mundial
          </p>
          <p className="mt-2 text-sm text-white/75">
            {hasVideoStarted
              ? "Preparando la experiencia..."
              : "Cargando intro..."}
          </p>
        </div>

        <button
          type="button"
          onClick={onComplete}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/35 px-5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-black/50"
        >
          Saltar
        </button>
      </div>
    </main>
  );
}
