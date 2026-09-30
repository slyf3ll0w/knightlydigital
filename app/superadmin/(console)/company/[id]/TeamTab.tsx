import { Bell, Headset } from "lucide-react";
import { Card, Chip, ListRow, SectionTitle } from "@/components/ds";
import PresenceDot from "@/components/console/PresenceDot";
import DeviceIcons from "@/components/console/DeviceIcons";
import { presenceOf, relativeSeen } from "@/lib/presence";
import { fullDate, monthYear } from "@/lib/console-format";
import { roleLabel } from "@/lib/permissions";
import type { CompanyCore, CompanyUser } from "./shared";

const SOFTPHONE_PRESENCE_MS = 75_000;

function devicesOf(u: CompanyUser) {
  const d = { ios: false, android: false, web: false };
  if (u.lastSeenVia === "ios") d.ios = true;
  else if (u.lastSeenVia === "android") d.android = true;
  else if (u.lastSeenVia === "web") d.web = true;
  for (const s of u.pushSubscriptions) {
    if (s.platform === "ios") d.ios = true;
    else if (s.platform === "android") d.android = true;
    else d.web = true;
  }
  return d;
}

/** Everyone on the account: who they are, when they were last in, how they get in. */
export default function TeamTab({ company }: { company: CompanyCore }) {
  const now = new Date();
  const users = [...company.users].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0);
  });
  const online = users.filter((u) => presenceOf(u.lastSeenAt, company.timezone, now) === "online").length;

  return (
    <>
      <SectionTitle
        className="mt-8"
        info="Last seen comes from any page or API call while signed in (stamped at most once a minute). Sign-ins count fresh logins only, not token refreshes. Devices are where the person was last seen plus where push notifications are turned on. Softphone shows a browser dialer that is registered right now."
      >
        Team <span className="ds-small ml-1 font-normal">{online > 0 ? `${online} online` : `${users.length}`}</span>
      </SectionTitle>

      {/* Phones */}
      <Card className="ds-divide overflow-hidden lg:hidden">
        {users.map((u) => {
          const state = presenceOf(u.lastSeenAt, company.timezone, now);
          return (
            <ListRow
              key={u.id}
              lead={<PresenceDot state={state} />}
              title={
                <>
                  {u.name} <span className="ds-small font-normal">· {roleLabel[u.role] ?? u.role}</span>
                </>
              }
              sub={`${u.email} · ${state === "online" ? "online now" : `seen ${relativeSeen(u.lastSeenAt, now)}`}${u.isActive ? "" : " · deactivated"}`}
              trail={<DeviceIcons devices={devicesOf(u)} />}
            />
          );
        })}
      </Card>

      {/* Desktop */}
      <Card className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] text-[13.5px]">
          <thead>
            <tr className="ds-label border-b border-[color:var(--ds-line)] text-left">
              <th className="px-4 py-2.5 font-medium">Person</th>
              <th className="px-3 py-2.5 font-medium">Role</th>
              <th className="px-3 py-2.5 font-medium">Last seen</th>
              <th className="px-3 py-2.5 font-medium">Last sign-in</th>
              <th className="px-3 py-2.5 text-right font-medium">Sign-ins</th>
              <th className="px-3 py-2.5 font-medium">Devices</th>
              <th className="px-3 py-2.5 font-medium">Push</th>
              <th className="px-3 py-2.5 font-medium">Softphone</th>
              <th className="px-3 py-2.5 font-medium">Bookable</th>
              <th className="px-3 py-2.5 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="ds-divide">
            {users.map((u) => {
              const state = presenceOf(u.lastSeenAt, company.timezone, now);
              const softphoneOn = Boolean(u.softphoneSeenAt && now.getTime() - u.softphoneSeenAt.getTime() < SOFTPHONE_PRESENCE_MS);
              return (
                <tr key={u.id} className={`transition-colors hover:bg-[color:var(--ds-surface-2)] ${u.isActive ? "" : "opacity-60"}`}>
                  <td className="px-4 py-2.5">
                    <span className="block font-medium text-[color:var(--ds-ink)]">
                      {u.name}
                      {!u.isActive && (
                        <span className="ml-2 align-middle">
                          <Chip tone="bad">Deactivated</Chip>
                        </span>
                      )}
                    </span>
                    <span className="ds-small block">
                      {u.email}
                      {u.phone ? ` · ${u.phone}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[color:var(--ds-ink-2)]">{roleLabel[u.role] ?? u.role}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <PresenceDot state={state} />
                      <span className={state === "online" ? "font-medium text-[color:var(--ds-good)]" : "text-[color:var(--ds-ink-2)]"}>
                        {state === "online" ? "Online now" : relativeSeen(u.lastSeenAt, now)}
                      </span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[color:var(--ds-ink-2)]" title={u.lastSignInAt ? fullDate(u.lastSignInAt) : undefined}>
                    {u.lastSignInAt ? relativeSeen(u.lastSignInAt, now) : <span className="ds-small">—</span>}
                  </td>
                  <td className="ds-num px-3 py-2.5 text-right">{u.signInCount}</td>
                  <td className="px-3 py-2.5">
                    <DeviceIcons devices={devicesOf(u)} />
                  </td>
                  <td className="px-3 py-2.5">
                    {u.pushSubscriptions.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[color:var(--ds-ink-2)]">
                        <Bell size={14} strokeWidth={1.8} aria-hidden /> {u.pushSubscriptions.length}
                      </span>
                    ) : (
                      <span className="ds-small">off</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {softphoneOn ? (
                      <span className="inline-flex items-center gap-1 font-medium text-[color:var(--ds-good)]">
                        <Headset size={14} strokeWidth={1.8} aria-hidden /> registered
                      </span>
                    ) : (
                      <span className="ds-small">{u.softphoneEnabled ? "not open" : "off"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[color:var(--ds-ink-2)]">{u.bookable ? "Yes" : <span className="ds-small">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[color:var(--ds-ink-2)]">{monthYear(u.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
