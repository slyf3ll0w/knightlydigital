/**
 * The "WorkBench in action" videos on the home page (components/wb/WBInAction).
 * Short, silent, captions burned in. To add one: render it from the Remotion
 * project at ~/workbench-intro (`bash scripts/render.sh tips` writes the
 * `-web.mp4` + `-poster.jpg`; phones play a 720×1280 cut of `-vertical.mp4`),
 * drop them in public/video/, and add an entry here. The first entry is the
 * one selected when the page loads.
 */
export type WBVideo = {
  /** Stable id (also the button's key). */
  key: string;
  /** The button label. */
  title: string;
  /** One line under the label. */
  blurb: string;
  /** 16:9 cut (desktop/tablet). */
  src: string;
  poster: string;
  /** 9:16 cut for phones — its captions are sized for a phone screen. */
  srcVertical: string;
  posterVertical: string;
  seconds: number;
  /** Matching Help Center guide, when there is one. */
  guide?: string;
};

export const WB_VIDEOS: WBVideo[] = [
  {
    key: "quote-to-job",
    title: "Quote to job in two taps",
    blurb: "The client said yes on the phone. Approve it and it's a job.",
    src: "/video/tip-quote-to-job.mp4",
    poster: "/video/tip-quote-to-job-poster.jpg",
    srcVertical: "/video/tip-quote-to-job-vertical.mp4",
    posterVertical: "/video/tip-quote-to-job-vertical-poster.jpg",
    seconds: 28,
    guide: "/help/convert-quote-to-job",
  },
  {
    key: "reschedule",
    title: "Reschedule with a drag",
    blurb: "Move a job to a new day and time, with Undo built in.",
    src: "/video/tip-reschedule.mp4",
    poster: "/video/tip-reschedule-poster.jpg",
    srcVertical: "/video/tip-reschedule-vertical.mp4",
    posterVertical: "/video/tip-reschedule-vertical-poster.jpg",
    seconds: 27,
    guide: "/help/use-the-schedule",
  },
  {
    key: "ask-atlas",
    title: "Ask Atlas anything",
    blurb: "Ask about your numbers or tell it what to do. You approve every change.",
    src: "/video/tip-ask-atlas.mp4",
    poster: "/video/tip-ask-atlas-poster.jpg",
    srcVertical: "/video/tip-ask-atlas-vertical.mp4",
    posterVertical: "/video/tip-ask-atlas-vertical-poster.jpg",
    seconds: 26,
    guide: "/help/what-atlas-can-do",
  },
];
