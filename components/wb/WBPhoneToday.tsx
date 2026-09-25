import { CalendarDays, Home, LayoutGrid, MessageSquare, Plus } from "lucide-react";

/**
 * The phone app's Schedule tab (Day view) drawn in HTML for the home-page
 * hero, so it stays sharp at any size — a scaled-down screenshot turns the
 * text to mush at hero size. Mirrors public/screens/mobile-01.png: same
 * title face, grey job cards with the dark left rule, status chips, and the
 * floating tab bar with the + button.
 */

const jobs = [
  { start: "8:00am", end: "10:00am", name: "Dana Ruiz", what: "Panel upgrade · #214", chip: "In progress", tone: "orange" },
  { start: "10:30am", end: "11:30am", name: "Maria Lopez", what: "AC tune-up · #215", chip: "Scheduled", tone: "blue" },
  { start: "1:00pm", end: "3:00pm", name: "Peter Jones", what: "Water heater install · #216", chip: "Scheduled", tone: "blue" },
] as const;

export default function WBPhoneToday({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-[2.1rem] bg-gray-900 p-[7px] shadow-[0_24px_50px_rgba(10,20,40,0.35)] ${className}`}>
      <div
        className="relative flex w-[176px] flex-col overflow-hidden rounded-[1.7rem] bg-[#F4F4F6] sm:w-[212px]"
        style={{ aspectRatio: "331 / 690" }}
        role="img"
        aria-label="The WorkBench phone app's schedule for today: three jobs with times, clients, and status"
      >
        {/* status bar */}
        <div className="flex items-center justify-between px-5 pt-2.5 text-[10px] font-bold text-gray-900">
          <span>9:41</span>
          <span className="h-[14px] w-[52px] rounded-full bg-gray-900" />
          <span className="flex items-center gap-0.5">
            <span className="h-[7px] w-[13px] rounded-[2px] border border-gray-900 p-px">
              <span className="block h-full w-3/4 rounded-[1px] bg-green-500" />
            </span>
          </span>
        </div>

        <div className="px-3.5 pt-3">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold text-gray-900">
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-[6px] font-extrabold text-[#0B57D8] ring-1 ring-gray-200">
              SP
            </span>
            Summit Plumbing
          </p>
          <p className="font-display mt-2 text-[20px] font-bold leading-none text-gray-900 sm:text-[23px]">Today</p>
          <div className="mt-2.5 flex rounded-full bg-white p-[3px] text-[9px] font-semibold text-gray-500 ring-1 ring-gray-200/80">
            <span className="flex-1 rounded-full bg-gray-900 py-1 text-center text-white">Day</span>
            <span className="flex-1 py-1 text-center">Week</span>
            <span className="flex-1 py-1 text-center">Month</span>
            <span className="flex-1 py-1 text-center">Map</span>
          </div>
          <p className="mt-3 text-[9.5px] font-semibold text-gray-500">Tuesday, Oct 6 · 3 jobs · 38 min driving</p>
        </div>

        <div className="mt-2 space-y-2 px-3">
          {jobs.map((j) => (
            <div key={j.name} className="flex gap-1.5">
              <div className="w-[38px] flex-none pt-1.5 text-right sm:w-[42px]">
                <p className="text-[9px] font-bold leading-tight text-gray-900 sm:text-[9.5px]">{j.start}</p>
                <p className="text-[8px] leading-tight text-gray-400">{j.end}</p>
              </div>
              <div className="min-w-0 flex-1 rounded-[10px] border-l-[3px] border-gray-800 bg-[#E4E5EA] px-2 py-1.5">
                <p className="truncate text-[11px] font-bold leading-tight text-gray-900 sm:text-[12px]">{j.name}</p>
                <p className="mt-0.5 truncate text-[9px] leading-tight text-gray-600 sm:text-[9.5px]">{j.what}</p>
                <span
                  className={`mt-1 inline-block rounded-full px-1.5 py-px text-[8px] font-bold sm:text-[8.5px] ${
                    j.tone === "orange" ? "bg-orange-100 text-[#C2410C]" : "bg-blue-100 text-[#0B57D8]"
                  }`}
                >
                  {j.chip}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* floating tab bar */}
        <div className="absolute inset-x-2 bottom-2.5 flex items-center gap-1.5">
          <div className="flex flex-1 items-center justify-around rounded-full bg-white/90 py-1.5 text-[7.5px] font-semibold text-gray-600 shadow-[0_4px_14px_rgba(0,0,0,0.12)] ring-1 ring-gray-200/70">
            {[
              { Icon: Home, label: "Home" },
              { Icon: CalendarDays, label: "Schedule", on: true },
              { Icon: MessageSquare, label: "Chat" },
              { Icon: LayoutGrid, label: "More" },
            ].map(({ Icon, label, on }) => (
              <span
                key={label}
                className={`flex flex-col items-center gap-px rounded-full px-1.5 py-0.5 ${on ? "bg-gray-200/80 text-gray-900" : ""}`}
              >
                <Icon className="h-[11px] w-[11px]" strokeWidth={2.4} />
                {label}
              </span>
            ))}
          </div>
          <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-[#1F2A44] text-white shadow-md">
            <Plus className="h-4 w-4" strokeWidth={2.4} />
          </span>
        </div>
      </div>
    </div>
  );
}
