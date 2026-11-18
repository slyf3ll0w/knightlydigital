// iPhone 15 frame for app/website recordings (786x1704 = 393x852pt @2x).
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {BLUE} from './brand';

// App recordings are 786 x 1704: an iPhone 15 (393 x 852 pt) at 2x, laid out
// with the phone's safe areas (59 pt top, 34 pt bottom) so the status bar,
// Dynamic Island and home indicator below sit where they do on a real phone.
export const SCREEN_W = 690;
export const PT = SCREEN_W / 393; // px per iPhone point
const SCREEN_H = Math.round(852 * PT);
const SCREEN_R = 55 * PT;
const BEZEL = 20;
const RIM = 5;
const PHONE_TOP = 318;

export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 50% 30%, #2f78f0 0%, ${BLUE} 50%, #06347f 100%)`}}>
      <AbsoluteFill
        style={{
          opacity: 0.12,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          backgroundPosition: `0 ${(frame * 0.4) % 60}px`,
        }}
      />
    </AbsoluteFill>
  );
};

export const StatusBar: React.FC = () => {
  const ink = '#0b0f19';
  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
      {/* Dynamic Island */}
      <div style={{position: 'absolute', top: 11 * PT, left: (393 / 2 - 62.5) * PT, width: 125 * PT, height: 37 * PT, borderRadius: 999, background: '#000'}} />
      {/* Time */}
      <div
        style={{
          position: 'absolute', top: 17 * PT, left: 0, width: 132 * PT, textAlign: 'center',
          fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif', fontWeight: 600, fontSize: 17 * PT, color: ink, letterSpacing: -0.3,
        }}
      >
        9:41
      </div>
      {/* Signal, Wi-Fi, battery */}
      <div style={{position: 'absolute', top: 21 * PT, right: 26 * PT, display: 'flex', alignItems: 'center', gap: 6 * PT}}>
        <svg width={18 * PT} height={12 * PT} viewBox="0 0 18 12">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={i * 5} y={9 - i * 3} width={3.2} height={3 + i * 3} rx={0.8} fill={ink} />
          ))}
        </svg>
        <svg width={16 * PT} height={12 * PT} viewBox="0 0 16 12">
          <path d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.1-1.1C13.4 1.7 10.8.6 8 .6S2.6 1.7.7 3.6l1.1 1.1C3.4 3.1 5.6 2.2 8 2.2z" fill={ink} />
          <path d="M8 5.6c1.5 0 2.8.6 3.8 1.5l1.1-1.1C11.6 4.7 9.9 4 8 4s-3.6.7-4.9 2l1.1 1.1c1-.9 2.3-1.5 3.8-1.5z" fill={ink} />
          <path d="M8 9c.6 0 1.1.2 1.5.6L8 11.1 6.5 9.6C6.9 9.2 7.4 9 8 9z" fill={ink} />
        </svg>
        <svg width={27 * PT} height={13 * PT} viewBox="0 0 27 13">
          <rect x={0.5} y={0.5} width={23} height={12} rx={3.6} fill="none" stroke={ink} strokeOpacity={0.4} />
          <rect x={2} y={2} width={20} height={9} rx={2.2} fill={ink} />
          <path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" fill={ink} fillOpacity={0.45} />
        </svg>
      </div>
      {/* Home indicator */}
      <div style={{position: 'absolute', bottom: 8 * PT, left: (393 / 2 - 67) * PT, width: 134 * PT, height: 5 * PT, borderRadius: 999, background: 'rgba(0,0,0,0.85)'}} />
    </div>
  );
};

export const Phone: React.FC<{children: React.ReactNode}> = ({children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 16, stiffness: 150}});
  return (
    <AbsoluteFill style={{alignItems: 'center'}}>
      <div
        style={{
          position: 'absolute',
          top: PHONE_TOP,
          width: SCREEN_W + (BEZEL + RIM) * 2,
          height: SCREEN_H + (BEZEL + RIM) * 2,
          padding: RIM,
          borderRadius: SCREEN_R + BEZEL + RIM,
          background: 'linear-gradient(135deg, #8a8f98 0%, #3b3f46 30%, #6d727b 55%, #2c2f35 80%, #8a8f98 100%)',
          boxShadow: '0 40px 90px rgba(0,0,0,0.45)',
          opacity: s,
          transform: `translateY(${(1 - s) * 140}px) scale(${0.94 + 0.06 * s})`,
        }}
      >
        <div style={{padding: BEZEL, borderRadius: SCREEN_R + BEZEL, background: '#050608'}}>
          <div style={{position: 'relative', width: SCREEN_W, height: SCREEN_H, borderRadius: SCREEN_R, overflow: 'hidden', background: 'white'}}>
            {children}
            <StatusBar />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

