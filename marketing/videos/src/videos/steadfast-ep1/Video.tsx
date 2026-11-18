import {AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, delayRender, continueRender} from 'remotion';
import {useEffect, useState} from 'react';
import {loadFont as loadPacifico} from '@remotion/google-fonts/Pacifico';
import {loadFont as loadLora} from '@remotion/google-fonts/Lora';
import {BLUE, ORANGE, fontFamily} from '../../brand';
import {Captions} from '../../Captions';
import {EndCard} from '../../EndCard';
import {Backdrop, PT, Phone} from '../../PhoneFrame';
import {FPS, NEXT_UP, SEGMENTS, Segment, Shot, VERSE, VERSE_REF, segFrames} from './edit';

const script = loadPacifico().fontFamily;
const serif = loadLora('normal', {weights: ['500', '600'], subsets: ['latin']}).fontFamily;
const SF = {green: '#438051', deep: '#1f4c2c', night: '#142e1b', paper: '#fdf9f1', paper2: '#f6eedd', gold: '#e7c873'};

type Word = {text: string; startMs: number; endMs: number};
const useWords = (id: string) => {
  const [words, setWords] = useState<Word[] | null>(null);
  const [h] = useState(() => delayRender(`words-${id}`));
  useEffect(() => {
    fetch(staticFile(`sf/${id}.words.json`)).then((r) => r.json()).then((w) => { setWords(w); continueRender(h); });
  }, [id, h]);
  return words ?? [];
};

type Span = {shot: Shot; start: number; end: number};
const spans = (seg: Segment): Span[] => {
  const total = segFrames(seg);
  return seg.shots.map((shot, i) => ({
    shot,
    start: Math.round((shot.from - seg.trimFrom) * FPS),
    end: i + 1 < seg.shots.length ? Math.round((seg.shots[i + 1].from - seg.trimFrom) * FPS) : total,
  }));
};
const isPhone = (s: Shot) => s.kind === 'app' || s.kind === 'site';

// ---------- shots ----------

/** David on camera — one continuous source video; punch-ins just scale it. */
const Face: React.FC<{seg: Segment; zoomAt: (f: number) => number}> = ({seg, zoomAt}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{transform: `scale(${zoomAt(frame)})`, transformOrigin: '50% 38%'}}>
      <OffthreadVideo src={staticFile(seg.file)} startFrom={Math.round(seg.trimFrom * FPS)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
    </AbsoluteFill>
  );
};

const PhoneScreen: React.FC<{shot: Extract<Shot, {take: string}>}> = ({shot}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 6], [0, 1], {extrapolateRight: 'clamp'});
  const video = <OffthreadVideo muted src={staticFile(`broll/${shot.take}.mp4`)} startFrom={Math.round((shot.at ?? 0) * FPS)} style={{width: '100%', height: '100%'}} />;
  // Website takes are recorded content-only (393x759pt); the status bar + home-indicator strips are drawn here.
  if (shot.kind === 'site')
    return (
      <AbsoluteFill style={{opacity, background: SF.paper}}>
        <div style={{position: 'absolute', top: 59 * PT, left: 0, width: '100%', height: 759 * PT}}>{video}</div>
      </AbsoluteFill>
    );
  return <AbsoluteFill style={{opacity}}>{video}</AbsoluteFill>;
};

const Photo: React.FC<{src: string; dur: number}> = ({src, dur}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, dur], [1.08, 1.2]);
  const opacity = interpolate(frame, [0, 4], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{opacity, background: 'black'}}>
      <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`}} />
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)'}} />
    </AbsoluteFill>
  );
};

const Paper: React.FC<{children: React.ReactNode}> = ({children}) => (
  <AbsoluteFill style={{background: `radial-gradient(circle at 50% 35%, ${SF.paper} 0%, ${SF.paper2} 75%, #eadfc6 100%)`}}>{children}</AbsoluteFill>
);

const NameCard: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const badge = spring({frame, fps, config: {damping: 12}});
  const rise = (d: number) => {
    const s = spring({frame: frame - d, fps, config: {damping: 16}});
    return {opacity: s, transform: `translateY(${(1 - s) * 40}px)`};
  };
  return (
    <Paper>
      <AbsoluteFill style={{alignItems: 'center', top: 300}}>
        <Img src={staticFile('sf/steadfast-badge.svg')} style={{width: 520, height: 520, transform: `scale(${badge}) rotate(${(1 - badge) * -25}deg)`, filter: 'drop-shadow(0 24px 40px rgba(20,46,27,0.25))'}} />
        <div style={{fontFamily: script, fontSize: 150, color: SF.deep, marginTop: 30, ...rise(6)}}>Steadfast</div>
        <div style={{fontFamily, fontWeight: 800, fontSize: 44, letterSpacing: 10, color: SF.green, textTransform: 'uppercase', marginTop: -10, ...rise(12)}}>Outdoor Living Co.</div>
      </AbsoluteFill>
    </Paper>
  );
};

const GbpCard: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 15}});
  const check = spring({frame: frame - 14, fps, config: {damping: 10}});
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', paddingBottom: 260}}>
        <div style={{width: 860, background: 'white', borderRadius: 48, padding: '56px 56px 60px', boxShadow: '0 40px 90px rgba(0,0,0,0.35)', fontFamily, opacity: s, transform: `translateY(${(1 - s) * 120}px)`}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 28}}>
            <Img src={staticFile('sf/steadfast-badge.svg')} style={{width: 150, height: 150}} />
            <div>
              <div style={{fontSize: 50, fontWeight: 900, color: '#171a17', letterSpacing: -1, lineHeight: 1.05}}>Steadfast Outdoor Living Co.</div>
              <div style={{fontSize: 34, fontWeight: 600, color: '#5d635e', marginTop: 10}}>Fence contractor · DFW</div>
            </div>
          </div>
          <div style={{marginTop: 44, display: 'flex', alignItems: 'center', gap: 20, fontSize: 40, fontWeight: 800, color: SF.deep}}>
            <div style={{width: 66, height: 66, borderRadius: 99, background: SF.green, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, transform: `scale(${check})`}}>✓</div>
            Google Business Profile is live
          </div>
          <div style={{marginTop: 18, fontSize: 36, fontWeight: 600, color: '#3f4540', paddingLeft: 86}}>First reviews from family &amp; friends</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Verse, word by word in time with David reading it; his face in a circle below. */
const VerseCard: React.FC<{seg: Segment; startSec: number}> = ({seg, startSec}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const words = useWords(seg.id);
  const ms = (startSec + frame / fps) * 1000;
  const verse = VERSE.split(' ');
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '');
  // Match each verse word to the next spoken word with the same text
  const spoken = words.filter((w) => w.startMs >= 33000 && w.startMs < 42500);
  let j = 0;
  const times = verse.map((v) => {
    const k = spoken.findIndex((w, i) => i >= j && norm(w.text) === norm(v));
    if (k < 0) return null;
    j = k + 1;
    return spoken[k].startMs;
  });
  for (let i = 0; i < times.length; i++) if (times[i] == null) times[i] = times[i - 1] ?? 33500;
  const inS = spring({frame, fps, config: {damping: 16}});
  const ref = spring({frame: frame - 8, fps, config: {damping: 14}});
  const cam = spring({frame: frame - 10, fps, config: {damping: 14}});
  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 50% 30%, ${SF.green} 0%, ${SF.deep} 55%, ${SF.night} 100%)`, opacity: inS}}>
      <AbsoluteFill style={{alignItems: 'center', top: 220, padding: '0 90px'}}>
        <div style={{fontFamily: script, fontSize: 92, color: SF.gold, opacity: ref, transform: `translateY(${(1 - ref) * 30}px)`}}>{VERSE_REF}</div>
        <div style={{width: 160, height: 6, borderRadius: 9, background: SF.gold, opacity: 0.6 * ref, margin: '26px 0 46px'}} />
        <div style={{fontFamily: serif, fontWeight: 600, fontSize: 70, lineHeight: 1.32, textAlign: 'center', color: SF.paper, textWrap: 'balance'}}>
          “
          {verse.map((w, i) => {
            const t = times[i]!;
            const lit = interpolate(ms, [t - 60, t + 140], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            const key = /steadfast|immovable|vain/i.test(w);
            return (
              <span key={i} style={{opacity: 0.28 + 0.72 * lit, color: key && lit > 0.5 ? SF.gold : SF.paper}}>
                {w}{i < verse.length - 1 ? ' ' : ''}
              </span>
            );
          })}
          ”
        </div>
      </AbsoluteFill>
      {/* face cam */}
      <AbsoluteFill style={{alignItems: 'center', top: 1440}}>
        <div style={{width: 340, height: 340, borderRadius: 999, overflow: 'hidden', border: `8px solid ${SF.gold}`, boxShadow: '0 20px 50px rgba(0,0,0,0.4)', transform: `scale(${cam})`}}>
          <OffthreadVideo muted src={staticFile(seg.file)} startFrom={Math.round(startSec * FPS)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.6)', transformOrigin: '50% 35%'}} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** David in a circle on Steadfast green — keeps him present without showing the room. */
const TalkCard: React.FC<{seg: Segment; startSec: number; title?: string}> = ({seg, startSec, title}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const inS = interpolate(frame, [0, 6], [0, 1], {extrapolateRight: 'clamp'});
  const cam = spring({frame: frame - 2, fps, config: {damping: 15}});
  const t = spring({frame: frame - 8, fps, config: {damping: 14}});
  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 50% 30%, ${SF.green} 0%, ${SF.deep} 55%, ${SF.night} 100%)`, opacity: inS}}>
      <AbsoluteFill style={{alignItems: 'center', top: 230}}>
        {title && <div style={{fontFamily: script, fontSize: 96, color: SF.gold, marginBottom: 50, opacity: t, transform: `translateY(${(1 - t) * 30}px)`}}>{title}</div>}
        <div style={{width: 640, height: 640, borderRadius: 999, overflow: 'hidden', border: `10px solid ${SF.gold}`, boxShadow: '0 30px 70px rgba(0,0,0,0.45)', transform: `scale(${0.8 + 0.2 * cam})`}}>
          <OffthreadVideo muted src={staticFile(seg.file)} startFrom={Math.round(startSec * FPS)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.45)', transformOrigin: '50% 35%'}} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- overlays ----------

const Badge: React.FC<{topic: string}> = ({topic}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const inS = spring({frame: frame - 4, fps, config: {damping: 14}});
  const out = interpolate(frame, [fps * 6, fps * 6.5], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const topicIn = spring({frame: frame - 12, fps, config: {damping: 14}});
  return (
    <AbsoluteFill style={{alignItems: 'center', top: 96, fontFamily, opacity: out}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 18, background: 'white', borderRadius: 999, padding: '12px 34px 12px 12px', boxShadow: '0 12px 30px rgba(0,0,0,0.28)', transform: `translateY(${(1 - inS) * -160}px)`}}>
        <Img src={staticFile('logo.png')} style={{width: 76, height: 76}} />
        <span style={{color: BLUE, fontSize: 46, fontWeight: 900, letterSpacing: -1}}>WorkBench</span>
      </div>
      <div style={{marginTop: 18, background: ORANGE, color: 'white', borderRadius: 14, padding: '12px 28px', fontSize: 40, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, boxShadow: '0 10px 24px rgba(0,0,0,0.25)', opacity: topicIn, transform: `scale(${0.7 + 0.3 * topicIn})`}}>
        {topic}
      </div>
    </AbsoluteFill>
  );
};

const NextUp: React.FC<{text: string}> = ({text}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 13}});
  return (
    <AbsoluteFill style={{alignItems: 'center', top: 150, fontFamily}}>
      <div style={{background: ORANGE, color: 'white', borderRadius: 18, padding: '16px 34px', fontSize: 46, fontWeight: 900, textTransform: 'uppercase', boxShadow: '0 12px 30px rgba(0,0,0,0.3)', transform: `scale(${s}) rotate(-2deg)`}}>
        {text} →
      </div>
    </AbsoluteFill>
  );
};

const Flash: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{background: 'white', opacity: interpolate(frame, [0, 2, 8], [0, 0.9, 0], {extrapolateRight: 'clamp'})}} />;
};

const Progress: React.FC<{frames: number}> = ({frames}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end'}}>
      <div style={{height: 10, background: 'rgba(11,87,216,0.45)'}}>
        <div style={{height: '100%', width: `${Math.min(1, frame / frames) * 100}%`, background: ORANGE}} />
      </div>
    </AbsoluteFill>
  );
};

// ---------- one source clip with its shots ----------

const SegmentView: React.FC<{seg: Segment}> = ({seg}) => {
  const frames = segFrames(seg);
  const sp = spans(seg);
  const frame = useCurrentFrame();
  const at = (f: number) => sp.find((s) => f >= s.start && f < s.end) ?? sp[sp.length - 1];
  const zoomAt = (f: number) => {
    const s = at(f).shot;
    return s.kind === 'face' ? s.zoom ?? 1 : 1;
  };
  const cur = at(frame).shot;
  // runs of consecutive phone shots share one phone that slides in once
  const runs: Span[][] = [];
  sp.forEach((s, i) => {
    if (!isPhone(s.shot)) return;
    if (i > 0 && isPhone(sp[i - 1].shot)) runs[runs.length - 1].push(s);
    else runs.push([s]);
  });
  const hideCaptions = (ms: number) => {
    const s = at(Math.floor((ms / 1000) * FPS)).shot;
    return s.kind === 'verse' || s.kind === 'name';
  };
  const captionTop = cur.kind === 'face' ? 1260 : cur.kind === 'photo' ? 1300 : cur.kind === 'gbp' || cur.kind === 'talk' ? 1450 : 1580;
  return (
    <AbsoluteFill style={{background: 'black'}}>
      {/* source video plays end to end — its audio is the soundtrack */}
      <Face seg={seg} zoomAt={zoomAt} />
      {sp.map(({shot, start, end}) => {
        const d = end - start;
        if (shot.kind === 'photo') return <Sequence key={start} from={start} durationInFrames={d}><Photo src={shot.src} dur={d} /></Sequence>;
        if (shot.kind === 'gbp') return <Sequence key={start} from={start} durationInFrames={d}><GbpCard /></Sequence>;
        if (shot.kind === 'name') return <Sequence key={start} from={start} durationInFrames={d}><NameCard /></Sequence>;
        if (shot.kind === 'talk') return <Sequence key={start} from={start} durationInFrames={d}><TalkCard seg={seg} startSec={shot.from} title={shot.title} /></Sequence>;
        if (shot.kind === 'verse') return <Sequence key={start} from={start} durationInFrames={d}><VerseCard seg={seg} startSec={shot.from} /></Sequence>;
        return null;
      })}
      {runs.map((run) => {
        const start = run[0].start;
        const end = run[run.length - 1].end;
        return (
          <Sequence key={start} from={start} durationInFrames={end - start}>
            <Backdrop />
            <Phone>
              {run.map((s) => (
                <Sequence key={s.start} from={s.start - start} durationInFrames={s.end - s.start}>
                  <PhoneScreen shot={s.shot as Extract<Shot, {take: string}>} />
                </Sequence>
              ))}
            </Phone>
          </Sequence>
        );
      })}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 20%)'}} />
      <Captions id={seg.id} src={`sf/${seg.id}.words.json`} top={captionTop} hide={(ms) => hideCaptions(ms - seg.trimFrom * 1000)} offsetMs={seg.trimFrom * 1000} />
      {seg.topic && <Sequence durationInFrames={FPS * 7}><Badge topic={seg.topic} /></Sequence>}
      {seg.id === 'room' && (
        <Sequence from={Math.round((NEXT_UP.from - seg.trimFrom) * FPS)} durationInFrames={frames}>
          <NextUp text={NEXT_UP.text} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

export const Steadfast: React.FC = () => {
  let t = 0;
  const parts = SEGMENTS.map((seg) => {
    const from = t;
    t += segFrames(seg);
    return {seg, from};
  });
  return (
    <AbsoluteFill style={{background: 'black'}}>
      {parts.map(({seg, from}) => (
        <Sequence key={seg.id} from={from} durationInFrames={segFrames(seg)}>
          <SegmentView seg={seg} />
        </Sequence>
      ))}
      {parts.slice(1).map(({seg, from}) => (
        <Sequence key={`flash-${seg.id}`} from={from - 2} durationInFrames={10}>
          <Flash />
        </Sequence>
      ))}
      <Sequence durationInFrames={t}>
        <Progress frames={t} />
      </Sequence>
      <Sequence from={t - 8}>
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
};
