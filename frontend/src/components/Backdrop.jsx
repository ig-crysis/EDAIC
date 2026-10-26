import { useEffect, useRef } from 'react';

const BG_VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4';
const BG_VIDEO_PLAYBACK_RATE = 1.35;
const BIT_COUNT = 80;

// A field of stray white 0/1s, scattered once with a seeded random so it is
// identical on every render -- the same texture the original EDAIC UI used
// behind every screen.
function generateBits(count) {
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
    opacity: 0.08 + rand() * 0.18,
    duration: 3 + rand() * 4,
    delay: rand() * 3,
  }));
}

const BITS = generateBits(BIT_COUNT);

/**
 * The fixed page background, mounted once above the router so the video keeps
 * playing across navigation. `variant` only changes how dark the overlay is:
 *   landing -> video shows through, fades to black for the stats row
 *   app     -> dashboard screens
 *   reading -> Pipeline / Explainability, darker so paragraphs stay legible
 */
export default function Backdrop({ variant }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.pause();
      return undefined;
    }
    // A touch faster than real time for a livelier feel.
    const applyRate = () => {
      video.playbackRate = BG_VIDEO_PLAYBACK_RATE;
    };
    applyRate();
    video.addEventListener('loadedmetadata', applyRate);
    return () => video.removeEventListener('loadedmetadata', applyRate);
  }, []);

  return (
    <div className={`backdrop is-${variant}`} aria-hidden="true">
      <video ref={videoRef} className="backdrop-video" autoPlay muted loop playsInline>
        <source src={BG_VIDEO_SRC} type="video/mp4" />
      </video>
      <div className="backdrop-wash" />
      <div className="backdrop-dots" />
      <div className="backdrop-bits">
        {BITS.map((b) => (
          <span
            key={b.id}
            style={{
              top: `${b.top.toFixed(2)}%`,
              left: `${b.left.toFixed(2)}%`,
              fontSize: `${b.size.toFixed(1)}px`,
              '--bo': b.opacity.toFixed(2),
              '--bdur': `${b.duration.toFixed(1)}s`,
              '--bdelay': `${b.delay.toFixed(1)}s`,
            }}
          >
            {b.char}
          </span>
        ))}
      </div>
      <div className="backdrop-overlay" />
    </div>
  );
}
