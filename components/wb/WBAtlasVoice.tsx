import { AudioLines, CalendarDays, MessageSquare, Mic, ShieldCheck, X } from "lucide-react";
import { AtlasMark } from "@/components/AtlasIcon";
import { AtlasCard } from "@/components/wb/WBAtlasCards";

/**
 * A replica of the talk screen (components/AssistantVoice.tsx) for the
 * marketing site: the same control pills, the breathing orb around the
 * Atlas mark with the mic badge, the status line, and the cards Atlas
 * stages right on the talk screen. Static markup built from the real
 * screen so the site shows the software, not a mock of it.
 */

const BLUE = "#0B57D8";

function Pill({ icon: Icon, children, dark }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; children: React.ReactNode; dark?: boolean }) {
  return (
    <span
      className={`flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-[12px] font-semibold shadow-sm ${dark ? "text-gray-700" : "text-gray-600"}`}
    >
      <Icon size={14} strokeWidth={dark ? 2.4 : 2} />
      {children}
    </span>
  );
}

export default function WBAtlasVoice({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col ${className}`}>
      <div className="relative flex min-h-[560px] flex-col overflow-hidden rounded-[1.25rem] border border-gray-200 bg-[#F7F9FC] shadow-[0_1px_2px_rgba(10,20,40,0.04),0_16px_40px_-20px_rgba(10,20,40,0.25)]">
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="flex items-center gap-2">
            <Pill icon={AudioLines}>Voice</Pill>
            <Pill icon={Mic}>Mic on</Pill>
          </div>
          <Pill icon={X} dark>
            Done
          </Pill>
        </div>

        <div className="flex flex-1 flex-col items-center px-5 pt-6 text-center">
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full">
            <span aria-hidden className="atlas-voice-breathe absolute inset-0 rounded-full" style={{ background: "rgba(11,87,216,0.14)" }} />
            <AtlasMark size={64} accent={BLUE} />
            <span
              className="absolute -bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-white shadow-md"
              style={{ background: BLUE }}
            >
              <Mic size={16} />
            </span>
          </div>
          <p className="mt-4 text-[14px] text-gray-800">Listening &mdash; just talk.</p>
          <p className="mt-1.5 max-w-[300px] text-[12px] leading-relaxed text-gray-400">
            You said: &ldquo;Move the Ortiz job to Thursday at one and let them know.&rdquo;
          </p>

          <div className="mt-4 w-full space-y-2 text-left">
            <AtlasCard
              icon={CalendarDays}
              kicker="Applied"
              title="Move Ortiz Rentals · drain clearing"
              rows={[
                { label: "Was", value: "Tue, Oct 28 · 1:00 pm" },
                { label: "Now", value: "Thu, Oct 30 · 1:00 pm" },
              ]}
              done={{ note: "Job moved" }}
              flush
            />
            <AtlasCard
              icon={MessageSquare}
              kicker="Needs your OK"
              title="Text Ortiz Rentals the new time"
              rows={[
                { label: "To", value: "(214) 555-0148" },
                { label: "Says", value: "Hi Luis, we moved your drain clearing to Thu, Oct 30 at 1:00 pm. Reply if that doesn't work." },
              ]}
              commit="Send"
              flush
            />
            <p className="px-1 text-center text-[11px] text-gray-500">Atlas read it to you. Say &ldquo;yes&rdquo; to send, or tap.</p>
          </div>
        </div>

        <p className="px-6 pb-4 pt-3 text-center text-[11px] leading-relaxed text-gray-400">
          Talk like you would to a person &mdash; you can interrupt. Money and permanent changes still need a tap.
        </p>
      </div>
    </div>
  );
}

const POINTS = [
  {
    icon: Mic,
    title: "Hands-free, from the truck",
    body: "Tap the mic on any screen and talk the way you'd talk to an office manager. Atlas answers out loud within a beat, and you can talk over it to interrupt.",
  },
  {
    icon: ShieldCheck,
    title: "Clients never get a surprise",
    body: "Anything that goes to a client, a text, an email, a quote, is read back to you first. Money and permanent changes still take a tap.",
  },
  {
    icon: AudioLines,
    title: "A voice you like",
    body: "Several male and female voices, in an American, British, Australian or Indian accent. Your pick is remembered on your phone.",
  },
];

const SAY = [
  "Who called this morning?",
  "Quote the Hendersons four-fifty for the spring cleanup and send it.",
  "Move Tuesday's jobs to Friday.",
  "Remind me to call Maria Friday at two.",
];

/** The talk screen beside the reasons it matters; used on Home and /features/atlas. */
export function WBAtlasVoiceSection() {
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-16">
      <WBAtlasVoice className="mx-auto w-full max-w-[420px]" />
      <div>
        <ul className="divide-y divide-gray-200">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4 py-5 first:pt-0">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-blue-50">
                <Icon className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
              </span>
              <div>
                <h3 className="text-[16px] font-bold text-gray-900">{title}</h3>
                <p className="mt-1 text-[14.5px] leading-relaxed text-gray-600">{body}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-6 rounded-[1.25rem] border border-gray-200 bg-white p-5">
          <p className="text-[13px] font-bold text-gray-500">Things people say to it</p>
          <ul className="mt-3 space-y-2">
            {SAY.map((s) => (
              <li key={s} className="flex items-start gap-2.5 text-[14.5px] text-gray-800">
                <Mic className="mt-[3px] h-4 w-4 flex-none text-[#0B57D8]" strokeWidth={2} />
                <span>&ldquo;{s}&rdquo;</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
