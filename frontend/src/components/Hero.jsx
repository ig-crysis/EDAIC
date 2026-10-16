import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, ShieldCheck, Gauge, Layers } from 'lucide-react';

const STATS = [
  { icon: Layers, value: '8', label: 'Detector groups' },
  { icon: Sparkles, value: 'SHAP', label: 'Explained outliers' },
  { icon: ShieldCheck, value: '100%', label: 'Human-reviewed fixes' },
  { icon: Gauge, value: 'Adaptive', label: 'Sensitivity tuning' },
];

// Numeric stat values (e.g. "8", "100%") count up from 0 once the hero
// scrolls into view; non-numeric ones ("SHAP", "Adaptive") just fade in
// with the rest of the row, the same split ADQI's stat footer makes.
function useCountUpOnView(targetText, duration = 1200) {
  const match = /^(\d+)(.*)$/.exec(targetText);
  const target = match ? parseInt(match[1], 10) : null;
  const suffix = match ? match[2] : '';
  const [display, setDisplay] = useState(target === null ? targetText : '0' + suffix);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (target === null || !ref.current) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        const start = performance.now();
        const tick = (now) => {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.round(target * eased) + suffix);
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        observer.unobserve(el);
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, suffix, duration]);

  return [ref, display];
}

function StatValue({ value }) {
  const [ref, display] = useCountUpOnView(value);
  return (
    <p ref={ref} className="font-display font-semibold text-base mono">
      {display}
    </p>
  );
}

// Deterministic-looking scatter of binary digits across the banner, the
// way the reference image used a field of stray 0/1s as texture behind
// the headline. Generated once per mount, not on every render.
function useBinaryField(count) {
  return useMemo(() => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      char: rand() > 0.5 ? '1' : '0',
      top: rand() * 100,
      left: rand() * 100,
      size: 10 + rand() * 9,
      opacity: 0.06 + rand() * 0.16,
    }));
  }, [count]);
}

export default function Hero() {
  const bits = useBinaryField(90);

  return (
    <div
      className="relative overflow-hidden mb-10"
      style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)' }}
    >
      {/* Translucent brand-color wash, in the app's own teal/violet/coral
          accents — no opaque fill, so the page's own background video (see
          index.html's .bg / .bg-video) shows through underneath it. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 1000px 500px at 50% -10%, rgba(124,124,240,0.38), transparent 60%),' +
            'radial-gradient(ellipse 900px 460px at 20% 25%, rgba(53,208,176,0.24), transparent 65%),' +
            'radial-gradient(ellipse 900px 460px at 85% 20%, rgba(241,102,122,0.22), transparent 65%)',
        }}
      />

      {/* Scattered binary-digit texture, twinkling so the field itself reads as "alive" */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
        {bits.map((b) => (
          <span
            key={b.id}
            className="absolute mono font-bold text-[var(--color-text)] bit-twinkle"
            style={{
              top: `${b.top}%`,
              left: `${b.left}%`,
              fontSize: `${b.size}px`,
              '--bo': b.opacity,
              '--bdur': `${3 + (b.id % 5)}s`,
              '--bdelay': `${(b.id % 7) * 0.4}s`,
            }}
          >
            {b.char}
          </span>
        ))}
      </div>

      {/* Layered dune / mountain silhouette for depth — translucent so the
          background video still reads through, instead of the opaque fill
          this used to have (which fully hid whatever sat behind it). */}
      <svg
        className="absolute bottom-0 left-0 w-full"
        style={{ height: '45%' }}
        viewBox="0 0 1440 300"
        preserveAspectRatio="none"
      >
        <path
          d="M0,180 C240,100 420,220 680,150 C940,80 1160,200 1440,120 L1440,300 L0,300 Z"
          fill="var(--color-violet-soft)"
          opacity="0.5"
        />
        <path
          d="M0,230 C260,170 500,260 760,200 C1000,150 1220,250 1440,190 L1440,300 L0,300 Z"
          fill="var(--color-bg)"
          opacity="0.55"
        />
      </svg>

      <div className="relative px-6 pt-16 pb-14 text-center">
        <div
          className="reveal group inline-flex items-center mb-7"
          style={{ '--d': '0.05s' }}
        >
          {STATS.slice(0, 3).map(({ icon: Icon }, i) => (
            <span
              key={i}
              className="relative w-8 h-8 rounded-full bg-[var(--color-panel-2)] border border-[var(--color-border)] p-1 transition-transform duration-300 group-hover:[transform:translateY(-3px)]"
              style={{ marginLeft: i === 0 ? 0 : '-10px', zIndex: i + 1 }}
            >
              <span className="flex items-center justify-center w-full h-full rounded-full bg-white text-[#0a0b10]">
                <Icon size={13} strokeWidth={2} />
              </span>
            </span>
          ))}
          <span
            className="inline-flex items-center h-8 rounded-full border border-[var(--color-border)] bg-[var(--color-panel)]/80 backdrop-blur-sm pr-3.5 text-[11px] font-medium mono text-[var(--color-text-muted)]"
            style={{ marginLeft: '-10px', paddingLeft: '18px' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-teal)] animate-pulse mr-2" />
            SHAP-explained · reviewer-approved · self-adjusting
          </span>
        </div>

        <h2
          className="mb-5 leading-[1.3] px-2"
          style={{
            fontFamily: 'var(--font-pixel)',
            fontSize: 'clamp(1.6rem, 5vw, 3rem)',
            textShadow: '0 0 24px rgba(124,124,240,0.45), 0 0 48px rgba(53,208,176,0.25)',
          }}
        >
          <span className="reveal-line text-[var(--color-text)]" style={{ '--fd': '0.16s' }}>
            DATA QUALITY
          </span>
          <span
            className="reveal-line bg-clip-text text-transparent"
            style={{ '--fd': '0.34s', backgroundImage: 'linear-gradient(90deg, var(--color-teal), var(--color-violet))' }}
          >
            BUILT TO EXPLAIN ITSELF
          </span>
        </h2>

        <p
          className="reveal text-[var(--color-text-muted)] text-center mb-10 leading-relaxed max-w-xl mx-auto"
          style={{ '--d': '0.46s' }}
        >
          Eight detector groups scan for missing values, duplicates, outliers, format
          inconsistencies, rare categories, date anomalies, pattern and range violations, and
          temporal spikes. Every outlier comes with a SHAP explanation, nothing is changed without
          your review, and the outlier detector's sensitivity adapts from your accept/reject
          decisions over time.
        </p>

        <div
          className="reveal flex flex-wrap items-start justify-center gap-x-10 gap-y-6 max-w-2xl mx-auto"
          style={{ '--d': '0.58s' }}
        >
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 w-24">
              <Icon size={16} className="text-[var(--color-violet)]" />
              <StatValue value={value} />
              <p className="text-[10px] text-[var(--color-text-muted)] text-center leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
