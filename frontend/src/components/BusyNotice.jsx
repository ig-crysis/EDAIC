import { useEffect, useState } from 'react';

// Live progress text while a file is being uploaded and analysed. The backend
// does everything in one request, so there is no real percentage to show; a
// running timer and honest wording are what stop a long scan from looking
// frozen.
export default function BusyNotice() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  let text;
  if (seconds < 15) {
    text = 'The first scan after the backend wakes up can take up to a minute while the ML libraries load.';
  } else if (seconds < 60) {
    text = 'Still working — bigger and wider files take longer to analyse.';
  } else {
    text = 'This is a big one. The free hosted backend is slow on large files; the scan gives up after 3 minutes.';
  }

  return (
    <div className="state-message" role="status" aria-live="polite">
      <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)' }}>
        Scanning for {seconds}s…
      </p>
      <p style={{ margin: 0 }}>{text}</p>
    </div>
  );
}
