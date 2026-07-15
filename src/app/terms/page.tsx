import { LegalDoc } from "@/components/legal-doc";

export default function TermsPage() {
  return (
    <LegalDoc title="Terms of Use" updated="July 15, 2026">
      <section>
        <h2>Agreement</h2>
        <p>
          By using NYC FIRST Smart Cabinet, you agree to these Terms of Use. If you
          do not agree, do not use the app or unlock drawers.
        </p>
      </section>

      <section>
        <h2>Purpose</h2>
        <p>
          Smart Cabinet helps authorized workshop participants track takes and returns
          of shared parts and tools. It is for personal and workshop accountability —
          not for commercial resale of inventory.
        </p>
      </section>

      <section>
        <h2>Eligibility</h2>
        <p>
          You may use Smart Cabinet only if you are an authorized NYC FIRST workshop
          participant (or staff) and have permission to access the drawers shown to
          you. Unauthorized access is prohibited.
        </p>
      </section>

      <section>
        <h2>Your responsibilities</h2>
        <ul>
          <li>Use only your own name at check-in.</li>
          <li>Take and return only what you need, in the quantities you record.</li>
          <li>Close and lock drawers when you are done.</li>
          <li>Do not share your session or bypass safety or access controls.</li>
          <li>Treat hardware, locks, and other people’s work with care.</li>
        </ul>
      </section>

      <section>
        <h2>Workshop rules</h2>
        <p>
          These Terms supplement NYC FIRST workshop policies, safety rules, and staff
          instructions. If there is a conflict, staff instructions and workshop safety
          rules control.
        </p>
      </section>

      <section>
        <h2>Accuracy of inventory</h2>
        <p>
          Stock levels are maintained server-side. You agree not to attempt to forge,
          replay, or manipulate unlocks, transactions, or quantities. False takes or
          returns may result in loss of access.
        </p>
      </section>

      <section>
        <h2>Availability</h2>
        <p>
          The service is provided as-is for workshop use. NYC FIRST may pause,
          change, or discontinue Smart Cabinet (or specific drawers) at any time,
          including for maintenance, stockouts, or safety.
        </p>
      </section>

      <section>
        <h2>Limitation of liability</h2>
        <p>
          To the fullest extent allowed by law, NYC FIRST and its staff are not liable
          for indirect or consequential damages arising from use of Smart Cabinet,
          including lost work time or misplaced parts, except where liability cannot
          be limited under applicable law.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Interfere with locks, cabinets, or other users’ sessions.</li>
          <li>Probe, scrape, or attack the service.</li>
          <li>Use the app for anything illegal or unsafe in the workshop.</li>
        </ul>
      </section>

      <section>
        <h2>Termination</h2>
        <p>
          NYC FIRST may suspend or revoke access if you violate these Terms, workshop
          rules, or endanger people or property.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          We may update these Terms. Continued use after an update means you accept
          the revised Terms. The “Last updated” date will reflect changes.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about these Terms: speak with NYC FIRST workshop staff or your
          program contact.
        </p>
      </section>
    </LegalDoc>
  );
}
