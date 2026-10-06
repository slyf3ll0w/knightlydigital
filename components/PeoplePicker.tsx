"use client";

/**
 * Tick the team members on something (an appointment can take more than one
 * person — David 2026-10-06). The order they were ticked in is kept: the
 * first stays the appointment's lead person (Appointment.assignedToId), the
 * rest ride along (lib/appointment-people.ts). At least one stays ticked
 * unless `allowNone`.
 */
export default function PeoplePicker({
  users,
  value,
  onChange,
  allowNone = false,
}: {
  users: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Let the last one be unticked too (editing an appointment that may have nobody). */
  allowNone?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {users.map((u) => {
        const on = value.includes(u.id);
        return (
          <label key={u.id} className="flex w-fit items-center gap-2 text-sm text-gray-700 select-none">
            <input
              type="checkbox"
              checked={on}
              // The last one can't be unticked — an appointment always has someone
              disabled={!allowNone && on && value.length === 1}
              onChange={() => onChange(on ? value.filter((x) => x !== u.id) : [...value, u.id])}
              className="h-3.5 w-3.5 rounded border-gray-300 accent-[color:var(--ds-primary)] focus:ring-[color:var(--ds-primary)]"
            />
            {u.name}
          </label>
        );
      })}
    </div>
  );
}
