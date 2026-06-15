type LoaderProps = {
  label?: string;
  className?: string;
  center?: boolean;
};

export default function Loader({
  label = "Cargando...",
  className = "",
  center = true,
}: LoaderProps) {
  return (
    <div
      className={`flex gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600 ${
        center ? "items-center justify-center" : "items-center"
      } ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-600"
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}
