"use client";

import { useState } from "react";

/**
 * User avatar: the uploaded profile picture when one exists, else a
 * deterministic gradient with two-letter initials (hue derived from the
 * name so every user gets a stable, distinct color). Pass `userId` to try
 * the photo — a missing one falls back to initials silently.
 */

function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  name,
  userId,
  version,
  size = 32,
  className = "",
}: {
  name?: string | null;
  userId?: string | null;
  /** Bump after an upload to bust the browser cache. */
  version?: number | string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const seed = name?.trim() || "?";
  const hue = hashHue(seed);
  const showPhoto = !!userId && !failed;
  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold text-white select-none shrink-0 overflow-hidden ring-1 ring-white/20 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: `linear-gradient(135deg, hsl(${hue} 62% 48%), hsl(${(hue + 50) % 360} 65% 36%))`,
        letterSpacing: "0.02em",
      }}
      title={name ?? undefined}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/avatars/${userId}${version ? `?v=${version}` : ""}`}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(seed)
      )}
    </div>
  );
}
