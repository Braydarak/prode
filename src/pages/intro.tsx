import { useEffect, useRef } from "react";
import introMobileVideo from "../assets/intro-mobile.mp4";

type IntroPageProps = {
  onComplete: () => void;
};

export default function IntroPage({ onComplete }: IntroPageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
    <main className="relative min-h-screen overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src={introMobileVideo}
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={onComplete}
        onError={onComplete}
      />
    </main>
  );
}
