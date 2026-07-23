"use client";

import { useState } from "react";
import { Reply, Copy, Check } from "lucide-react";

/**
 * Reply section on the public message page. The mailto: button silently does
 * nothing on machines with no default mail app (very common on desktop), so
 * the company's address is always shown in plain text with a copy button —
 * the client can never be stranded with a dead button.
 */
export default function ReplyBox({
  email,
  phone,
  subject,
  companyName,
  accent,
  accentText,
}: {
  email: string | null;
  phone: string | null;
  subject: string;
  companyName: string;
  accent: string;
  accentText: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    if (!email) return;
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      {email && (
        <a
          href={`mailto:${email}?subject=${encodeURIComponent(`Re: ${subject}`)}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-opacity hover:opacity-90"
          style={{ background: accent, color: accentText }}
        >
          <Reply size={15} />
          Reply to {companyName}
        </a>
      )}
      <p className="text-xs text-gray-500 mt-3">
        {email ? (
          <>
            Or email us at{" "}
            <span className="inline-flex items-center gap-1 font-medium text-gray-700">
              {email}
              <button
                onClick={copyEmail}
                title="Copy email address"
                className="text-gray-400 hover:text-gray-600 align-middle"
              >
                {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
              </button>
            </span>{" "}
            — replying to the email that brought you here works too
            {phone ? `, or call ${phone}` : ""}.
          </>
        ) : (
          <>
            Reply to the email that brought you here
            {phone ? `, or call ${phone}` : ""}.
          </>
        )}
      </p>
    </div>
  );
}
