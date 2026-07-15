import Link from "next/link";

export function LegalFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="smart-legal-footer">
      <nav aria-label="Legal">
        <Link href="/privacy">Privacy Policy</Link>
        <span aria-hidden>·</span>
        <Link href="/terms">Terms of Use</Link>
      </nav>
      <p>
        © {year} NYC FIRST · Smart Cabinet
        <br />
        Workshop inventory for personal tracking only.
      </p>
    </footer>
  );
}
