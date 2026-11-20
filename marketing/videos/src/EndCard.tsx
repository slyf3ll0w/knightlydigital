import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {BLUE, ORANGE, fontFamily} from './brand';

export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const logo = spring({frame, fps, config: {damping: 12}});
  const rise = (d: number) => {
    const s = spring({frame: frame - d, fps, config: {damping: 16}});
    return {opacity: s, transform: `translateY(${(1 - s) * 40}px)`};
  };
  const fadeIn = interpolate(frame, [0, 8], [0, 1], {extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill
      style={{
        opacity: fadeIn,
        background: `radial-gradient(circle at 50% 38%, #2f78f0 0%, ${BLUE} 55%, #0841a3 100%)`,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily,
        color: 'white',
        textAlign: 'center',
      }}
    >
      <Img src={staticFile('logo.png')} style={{width: 300, transform: `scale(${logo})`, filter: 'drop-shadow(0 24px 40px rgba(0,0,0,0.35))'}} />
      <div style={{fontSize: 120, fontWeight: 900, letterSpacing: -3, marginTop: 36, ...rise(6)}}>WorkBench</div>
      <div style={{fontSize: 44, fontWeight: 600, maxWidth: 820, lineHeight: 1.25, textWrap: 'balance', marginTop: 12, color: "rgba(255,255,255,0.95)", ...rise(12)}}>
        Run your home service business in one place.
      </div>
      <div
        style={{
          marginTop: 56,
          background: ORANGE,
          borderRadius: 999,
          padding: '24px 56px',
          fontSize: 54,
          fontWeight: 800,
          boxShadow: '0 16px 36px rgba(0,0,0,0.25)',
          ...rise(18),
        }}
      >
        workbenchfsm.com
      </div>
      <div style={{fontSize: 36, fontWeight: 600, marginTop: 36, color: "rgba(255,255,255,0.85)", ...rise(24)}}>App Store · Google Play · Web</div>
    </AbsoluteFill>
  );
};
