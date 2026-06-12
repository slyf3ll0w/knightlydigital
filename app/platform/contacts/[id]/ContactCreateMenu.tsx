"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Plus, Inbox, CalendarClock, FileText, Briefcase, Receipt, DollarSign } from "lucide-react";

/** Per-client scoped Create menu (Jobber's client-page Create button). */
export default function ContactCreateMenu({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const items = [
    { href: `/app/requests/new?contactId=${contactId}`, label: "Request", icon: Inbox },
    { href: `/app/appointments/new?contactId=${contactId}`, label: "Appointment", icon: CalendarClock },
    { href: `/app/quotes/new?contactId=${contactId}`, label: "Quote", icon: FileText },
    { href: `/app/jobs/new?contactId=${contactId}`, label: "Job", icon: Briefcase },
    { href: `/app/invoices/new?contactId=${contactId}`, label: "Invoice", icon: Receipt },
    { href: `/app/payments/new?contactId=${contactId}`, label: "Payment", icon: DollarSign },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
      >
        <Plus size={14} />
        Create
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-44 bg-white rounded-lg shadow-xl border border-gray-200 py-1.5">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Icon size={14} className="text-gray-400" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
