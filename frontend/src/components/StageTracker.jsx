const STEPS = ['Upload', 'Scan', 'Review', 'Clean', 'Export'];

export default function StageTracker({ currentStep }) {
  return (
    <div className="hidden md:flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-black/40 p-1">
      {STEPS.map((label, i) => {
        const isDone = i < currentStep;
        const isActive = i === currentStep;
        return (
          <span
            key={label}
            className={`px-3.5 py-1.5 rounded-full text-xs font-display font-medium mono transition-all duration-300 ${
              isActive
                ? 'bg-white text-[#0a0b10] shadow-[0_0_0_1px_rgba(255,255,255,0.25),0_0_16px_rgba(255,255,255,0.35)]'
                : isDone
                  ? 'text-[var(--color-text-muted)]'
                  : 'text-[var(--color-border)]'
            }`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
