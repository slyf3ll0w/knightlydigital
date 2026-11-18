import {AbsoluteFill, spring, staticFile, useCurrentFrame, useVideoConfig, delayRender, continueRender} from 'remotion';
import {useEffect, useMemo, useState} from 'react';
import {ORANGE, fontFamily} from './brand';

type Word = {text: string; startMs: number; endMs: number};

// Group words into short pages: break on sentence/clause punctuation, pauses, or 3 words
const toPages = (words: Word[]) => {
  const pages: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const punct = /[.,!?;:]$/.test(w.text);
    const gap = next ? next.startMs - w.endMs > 350 : true;
    if (punct || gap || cur.length >= 3) {
      pages.push(cur);
      cur = [];
    }
  });
  if (cur.length) pages.push(cur);
  return pages;
};

export const Captions: React.FC<{id: string; top?: number; src?: string; hide?: (ms: number) => boolean; offsetMs?: number}> = ({id, top = 1180, src, hide, offsetMs = 0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const [words, setWords] = useState<Word[] | null>(null);
  const [handle] = useState(() => delayRender('captions'));

  useEffect(() => {
    fetch(staticFile(src ?? `captions/${id}.words.json`))
      .then((r) => r.json())
      .then((w) => {
        setWords(w);
        continueRender(handle);
      });
  }, [id, handle]);

  const pages = useMemo(() => (words ? toPages(words) : []), [words]);
  const ms = (frame / fps) * 1000 + offsetMs;
  const pageIdx = pages.findIndex((p, i) => {
    const end = pages[i + 1] ? pages[i + 1][0].startMs : p[p.length - 1].endMs + 400;
    return ms >= p[0].startMs && ms < end;
  });
  if (pageIdx < 0 || hide?.(ms)) return null;
  const page = pages[pageIdx];
  const pageStartFrame = Math.round((page[0].startMs / 1000) * fps);
  const pop = spring({frame: frame - pageStartFrame, fps, config: {damping: 14, stiffness: 220}, durationInFrames: 8});

  return (
    <AbsoluteFill style={{justifyContent: 'flex-start', alignItems: 'center', top}}>
      <div
        style={{
          fontFamily,
          fontWeight: 900,
          fontSize: 84,
          lineHeight: 1.08,
          textAlign: 'center',
          maxWidth: 940,
          textTransform: 'uppercase',
          letterSpacing: -1,
          transform: `scale(${0.85 + 0.15 * pop})`,
        }}
      >
        {page.map((w, i) => {
          const active = ms >= w.startMs && ms < (page[i + 1]?.startMs ?? w.endMs + 400);
          return (
            <span
              key={i}
              style={{
                color: active ? ORANGE : 'white',
                WebkitTextStroke: '14px rgba(0,0,0,0.9)',
                paintOrder: 'stroke fill',
                textShadow: '0 6px 18px rgba(0,0,0,0.45)',
                marginRight: 30,
                display: 'inline-block',
                transform: active ? 'scale(1.06)' : 'none',
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
