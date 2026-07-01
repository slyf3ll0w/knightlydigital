"use client";

import { useState } from "react";
import { CheckCircle, Clock, Loader2, PenLine } from "lucide-react";
import { textOn } from "@/lib/branding";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * Public contract page: read the agreement, type your full name, sign.
 * Typed signature + timestamp + IP, same e-sign approach as quote approval.
 */
export default function ContractSignPage({
  token,
  title,
  body,
  status,
  expired,
  signatureName,
  signedAt,
  contactName,
  companyName,
  companyLogoUrl,
  brandColor,
}: {
  token: string;
  title: string;
  body: string;
  status: string;
  expired: boolean;
  signatureName: string | null;
  signedAt: string | null;
  contactName: string;
  companyName: string;
  companyLogoUrl: string | null;
  brandColor: string | null;
}) {
  const accent = brandColor ?? "#16A34A";
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [justSigned, setJustSigned] = useState(false);

  const isSigned = status === "SIGNED" || justSigned;

  async function sign() {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(`/api/public/contract/${token}`, {
      signatureName: name,
    });
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setJustSigned(true);
  }

  return (
    <div className="app-ui min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          {companyLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={companyLogoUrl}
              alt={`${companyName} logo`}
              className="h-14 w-auto max-w-[220px] object-contain mx-auto mb-3"
            />
          )}
          <h1 className="text-xl font-bold text-gray-900">{companyName}</h1>
          <p className="text-sm text-gray-500 mt-1">Service agreement for {contactName}</p>
        </div>

        <div className="card-ledger shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          </div>
          <div className="px-6 py-5">
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{body}</p>
          </div>

          <div className="px-6 py-5 border-t border-gray-100 bg-gray-50">
            {isSigned ? (
              <div className="flex items-start gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${accent}22` }}
                >
                  <CheckCircle size={20} style={{ color: accent }} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Signed{justSigned ? "" : ` by ${signatureName}`}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {justSigned
                      ? "Thank you — both parties will keep a copy of this agreement."
                      : signedAt
                        ? new Date(signedAt).toLocaleString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : ""}
                  </p>
                </div>
              </div>
            ) : expired ? (
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200">
                  <Clock size={20} className="text-gray-500" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">This signing link has expired</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    For your security, agreement links are only valid for a limited time. Please
                    contact {companyName} to have a new link sent to your email.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  <span className="flex items-center gap-1.5 mb-1">
                    <PenLine size={14} className="text-gray-400" />
                    Type your full name to sign
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={contactName}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2"
                    style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: "16px" }}
                  />
                </label>
                <label className="flex items-start gap-2 text-xs text-gray-600 select-none">
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300"
                  />
                  I have read this agreement and intend my typed name to act as my electronic
                  signature.
                </label>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  onClick={sign}
                  disabled={busy || name.trim().length < 2 || !agree}
                  className="w-full py-3 font-semibold text-sm rounded transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ backgroundColor: accent, color: textOn(accent) }}
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  Sign Agreement
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
