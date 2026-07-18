"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Upload } from "lucide-react";

interface EvidenceFile {
  id: string;
  fileName: string;
  state: string;
  createdAt: string | null;
}

/**
 * Evidence uploads for one dispute — file list + upload button. Files go
 * straight through to the processor (bank rules: PDF/JPG/PNG only), so there's
 * nothing to preview or delete once sent.
 */
export default function DisputeEvidence({
  disputeId,
  initialEvidence,
  canUpload,
}: {
  disputeId: string;
  initialEvidence: EvidenceFile[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/app/payments/disputes/${disputeId}/evidence`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Upload failed. Please try again.");
        return;
      }
      setEvidence((prev) => [data.evidence, ...prev]);
      router.refresh();
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="w-full">
      {evidence.length > 0 && (
        <ul className="space-y-1 mb-1.5">
          {evidence.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-xs text-gray-500">
              <FileText size={12} className="text-gray-400 shrink-0" />
              <span className="truncate">{e.fileName}</span>
              <span
                className={`stamp ${e.state === "FAILED" ? "text-red-700" : "text-green-700"}`}
              >
                {e.state === "FAILED" ? "Failed" : "Sent"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Upload size={12} />
            )}
            {uploading ? "Uploading…" : evidence.length > 0 ? "Add more evidence" : "Upload evidence"}
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}
