export default function SkipLink({ targetId = 'main' }) {
  return (
    <a
      className="skip-link"
      href={`#${targetId}`}
      onClick={(e) => {
        // A real hash change would be read by the router as a navigation.
        e.preventDefault();
        document.getElementById(targetId)?.focus();
      }}
    >
      Skip to content
    </a>
  );
}
