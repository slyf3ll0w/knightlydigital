import {Composition} from 'remotion';
import {Steadfast} from './videos/steadfast-ep1/Video';
import {FPS, totalFrames} from './videos/steadfast-ep1/edit';

// One <Composition> per video. New video = copy src/videos/steadfast-ep1/, edit its edit.ts, add a line here.
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="steadfast-ep1" component={Steadfast} durationInFrames={totalFrames()} fps={FPS} width={1080} height={1920} />
  </>
);
