"use client";

import { useEffect, useState } from "react";

/**
 * The home headline's last word, cycling (David 2026-11-18). Screen readers
 * get the `label` once; the moving words are hidden from them. Holds on the
 * last word under reduced motion.
 */
export default function WBCycleWord({ words, label, className = "", wordClassName = "" }: { words: string[]; label: string; className?: string; wordClassName?: string }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setI(words.length - 1);
      return;
    }
    const t = setInterval(() => setI((n) => (n + 1) % words.length), 2200);
    return () => clearInterval(t);
  }, [words.length]);

  return (
    <>
      <span className="sr-only">{label}</span>
      <span aria-hidden className={className}>
        <span key={i} className={`wb-word ${wordClassName}`}>
          {words[i]}
        </span>
      </span>
    </>
  );
}
