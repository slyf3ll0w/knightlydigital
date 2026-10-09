"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ds";
import { LaunchSplashArt } from "@/components/LaunchSplashArt";

/**
 * Design-gallery replay of the launch animation (the real one only plays in
 * the native shell, on a cold launch). Same markup and CSS as the shell's.
 */
export default function LaunchSplashPreview() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = (ref.current = document.getElementById("wb-launch-preview") as HTMLDivElement | null);
    if (!el) return;
    const onEnd = (e: AnimationEvent) => {
      if (e.target === el) el.dataset.play = "done";
    };
    el.addEventListener("animationend", onEnd);
    return () => el.removeEventListener("animationend", onEnd);
  }, []);

  const play = () => {
    const el = ref.current;
    if (!el) return;
    // Re-arm: drop the attribute, force a style flush, set it again so every
    // keyframe starts from zero.
    delete el.dataset.play;
    void el.offsetWidth;
    el.dataset.play = "1";
  };

  return (
    <>
      <Button onClick={play}>Play launch animation</Button>
      <LaunchSplashArt id="wb-launch-preview" preview />
    </>
  );
}
