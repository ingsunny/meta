import { Inbox, AlertCircle, Loader } from "lucide-react";

export function EmptyState({ title = "Nothing here yet", sub, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <Inbox size={20} />
      </div>
      <p className="text-base font-medium text-ink-800">{title}</p>
      {sub && <p className="mt-1 max-w-sm text-sm text-ink-500">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Couldn't load this", sub, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <AlertCircle size={20} />
      </div>
      <p className="text-base font-medium text-ink-800">{title}</p>
      {sub && <p className="mt-1 max-w-sm text-sm text-ink-500">{sub}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 rounded-md bg-ink-900 px-4 py-2 text-xs font-medium text-white hover:bg-ink-800 transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function LoadingState({ label = "Loading" }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-ink-400">
      <Loader size={20} className="animate-spin" />
      <p className="mt-3 text-xs uppercase tracking-wider">{label}</p>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="rounded-xl bg-white ring-1 ring-ink-200/60 p-5">
      <div className="flex items-center gap-4 animate-pulse">
        <div className="h-12 w-12 rounded-full bg-ink-100" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/3 rounded bg-ink-100" />
          <div className="h-3 w-1/5 rounded bg-ink-100" />
        </div>
        <div className="h-6 w-20 rounded bg-ink-100" />
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
