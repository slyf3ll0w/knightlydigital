// Steadfast video — the edit decision list. Revisions mostly happen here.
// Times are seconds into each source clip (see public/sf/<id>.words.json for word timings).

export type Shot =
  | {from: number; kind: 'face'; zoom?: number} // David on camera (zoom = punch-in, 1 = none)
  | {from: number; kind: 'app'; take: string; at?: number} // WorkBench app recording in phone frame (public/broll)
  | {from: number; kind: 'site'; take: string; at?: number} // Steadfast website recording in phone frame (public/broll)
  | {from: number; kind: 'photo'; src: string; label?: string} // full-bleed photo, slow push-in
  | {from: number; kind: 'gbp'} // Google Business Profile card
  | {from: number; kind: 'name'} // Steadfast badge + name reveal
  | {from: number; kind: 'verse'} // 1 Corinthians 15:58 card (face in a circle)
  | {from: number; kind: 'talk'; title?: string}; // David in a circle on Steadfast green (less of the room, still personal)

export type Segment = {id: string; file: string; trimFrom: number; trimTo: number; topic?: string; shots: Shot[]};

export const FPS = 30;
export const END_CARD_FRAMES = 84;

export const SEGMENTS: Segment[] = [
  {
    id: 'car', file: 'sf/car.mov', trimFrom: 0, trimTo: 49.05, topic: 'Building a fence company',
    shots: [
      {from: 0, kind: 'face'}, // "Hey guys, this is David with WorkBench"
      {from: 4.3, kind: 'face', zoom: 1.15}, // "I'm building a fence company. Let me explain, let me explain"
      {from: 8.9, kind: 'app', take: 'site', at: 0.3}, // "a lot of softwares out there like WorkBench…"
      {from: 17.2, kind: 'face'}, // "so we're gonna do the opposite"
      {from: 20.6, kind: 'app', take: 'sfwDash'}, // "use WorkBench to start a home service company"
      {from: 24.8, kind: 'face', zoom: 1.12}, // "because I think…"
      {from: 27.4, kind: 'app', take: 'sfwBooking', at: 0.3}, // "really show what this software can do"
      {from: 31.0, kind: 'face'}, // "good way for me to test it…"
      {from: 42.3, kind: 'face', zoom: 1.12}, // "even though that's our target audience"
      {from: 45.0, kind: 'face'}, // "so we're gonna test it — let me show you what I got so far"
    ],
  },
  {
    id: 'room', file: 'sf/room.mov', trimFrom: 0, trimTo: 114.2,
    shots: [
      {from: 0, kind: 'face'}, // "All right, so I went ahead and got…"
      {from: 2.0, kind: 'site', take: 'sfHome'}, // "…a website set up… I'll show you the website"
      {from: 10.5, kind: 'site', take: 'sfServices', at: 0.4}, // "a bunch of service pages"
      {from: 12.6, kind: 'site', take: 'sfCity', at: 0.3}, // "a bunch of city pages… optimized for SEO"
      {from: 15.5, kind: 'gbp'}, // "a couple reviews on the Google Business Profile"
      {from: 20.6, kind: 'site', take: 'sfOurName', at: 0.5}, // "Why the name?" — About page, Our Name section
      {from: 24.3, kind: 'name'}, // "Steadfast Outdoor Living Company"
      {from: 27.5, kind: 'verse'}, // "it's based off of a verse…" 1 Corinthians 15:58
      {from: 42.3, kind: 'talk', title: 'Not in vain'}, // "a lot of things we do down here are in vain…"
      {from: 53.5, kind: 'site', take: 'sfContact', at: 0.5}, // "haven't heard the good news… reach out to us any way you can"
      {from: 63.3, kind: 'talk', title: 'The most important thing'}, // "if you take nothing else away… that should be the thing"
      {from: 82.8, kind: 'app', take: 'sfwSchedule'}, // "how we'll run the business… I'm not able to do any of the work"
      {from: 91.0, kind: 'app', take: 'sfwTeam'}, // "we're going to be hiring crews"
      {from: 94.4, kind: 'app', take: 'sfwRequests'}, // "I'll just be handling the sales…"
      {from: 97.4, kind: 'app', take: 'sfwPricebook', at: 0.5}, // "…and the admin side, the stuff WorkBench is working on"
      {from: 100.4, kind: 'site', take: 'sfBook'}, // "get this going a little quicker" — leads come in through the booking page
      {from: 107.2, kind: 'talk'}, // "money set aside for some ad spend… next video"
    ],
  },
];

export const segFrames = (s: Segment) => Math.round((s.trimTo - s.trimFrom) * FPS);
export const totalFrames = () => SEGMENTS.reduce((n, s) => n + segFrames(s), 0) + END_CARD_FRAMES;

// The verse, ESV — shown on the verse card, lit up word by word as David reads it
export const VERSE_REF = '1 Corinthians 15:58';
export const VERSE =
  'Therefore, my beloved brothers, be steadfast, immovable, always abounding in the work of the Lord, knowing that in the Lord your labor is not in vain.';

// "Next video" teaser over the last line
export const NEXT_UP = {from: 109.7, text: 'Next video: the ad spend'};
