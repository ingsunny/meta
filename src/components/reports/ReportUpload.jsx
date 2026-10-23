"use client";

// Drag-and-drop uploader for Reports. Posts multipart to
// /api/reports/upload, then navigates straight to the new report.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2 } from "lucide-react";

export function ReportUpload({ compact = false }) {
  const router = useRouter();
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const upload = async (file) => {
    if (!file || busy) return;
    setBusy(file.name);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/reports/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");
      router.push(`/reports/${data.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload(e.dataTransfer.files?.[0]);
        }}
        className={`group w-full rounded-2xl border-2 border-dashed transition text-left ${
          compact ? "px-5 py-5" : "px-8 py-12"
        } ${drag ? "border-brand-500 bg-brand-50/60" : "border-ink-300 bg-white/60 hover:border-ink-400 hover:bg-white"}`}
      >
        <div className={`flex ${compact ? "items-center gap-4" : "flex-col items-center text-center"}`}>
          <span
            className={`rounded-2xl bg-ink-900 text-white flex items-center justify-center shadow-[0_8px_20px_-8px_rgba(18,18,18,0.6)] ${
              compact ? "h-11 w-11" : "h-14 w-14"
            }`}
          >
            {busy ? <Loader2 size={22} className="animate-spin" /> : <UploadCloud size={compact ? 20 : 24} />}
          </span>
          <div className={compact ? "" : "mt-5"}>
            <p className="text-[15px] font-medium text-ink-900">
              {busy ? `Reading ${busy}…` : "Drop a Meta export here, or click to browse"}
            </p>
            <p className="mt-1 text-[13px] text-ink-500">
              .xlsx or .csv from Ads Manager → Reports → Export. Any other spreadsheet works too.
            </p>
          </div>
        </div>
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xlsm,.csv,.tsv,.txt"
        className="hidden"
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
    </div>
  );
}
