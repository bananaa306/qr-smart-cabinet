import { LegalDoc } from "@/components/legal-doc";

export default function PrivacyPage() {
  return (
    <LegalDoc title="Privacy Policy" updated="July 15, 2026">
      <section>
        <h2>Who we are</h2>
        <p>
          Smart Cabinet is operated by NYC FIRST for workshop inventory tracking on
          Roosevelt Island. This policy explains what information the app collects and
          how it is used.
        </p>
      </section>

      <section>
        <h2>Information we collect</h2>
        <p>When you use Smart Cabinet, we may collect:</p>
        <ul>
          <li>
            <strong>Display name</strong> — the name you enter at check-in, used to
            identify your session and activity.
          </li>
          <li>
            <strong>Session data</strong> — a signed session cookie so you stay signed
            in while using the cabinet.
          </li>
          <li>
            <strong>Activity records</strong> — takes, returns, unlocks, and locks,
            including drawer, part, quantity, and time.
          </li>
          <li>
            <strong>Technical logs</strong> — limited server logs needed to operate and
            secure the service (for example, rate limiting).
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use information</h2>
        <p>We use this information to:</p>
        <ul>
          <li>Let you take and return workshop parts from drawers you can access.</li>
          <li>Show you your own activity history.</li>
          <li>Keep workshop stock accurate for the community.</li>
          <li>Prevent abuse (rate limits, session checks).</li>
        </ul>
        <p>
          Activity may also be recorded in an operations spreadsheet used by NYC FIRST
          staff for workshop inventory oversight.
        </p>
      </section>

      <section>
        <h2>How we store information</h2>
        <p>
          Session credentials live in an HttpOnly cookie — not in browser localStorage.
          Inventory and ledger data are stored on systems controlled by NYC FIRST (or
          its hosting providers). Do not put secrets or passwords into your display
          name.
        </p>
      </section>

      <section>
        <h2>Sharing</h2>
        <p>
          We do not sell your personal information. Workshop staff may review activity
          records as needed to run the space. We may share information if required by
          law or to protect the safety of people or property.
        </p>
      </section>

      <section>
        <h2>Retention</h2>
        <p>
          Session cookies expire after a limited period of inactivity. Activity and
          inventory records are kept as long as needed for workshop operations and
          accountability.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          You can sign out by ending your browser session or clearing site cookies.
          For questions about your activity records, contact NYC FIRST workshop staff.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          Smart Cabinet is intended for authorized workshop participants. Guardians or
          program staff should supervise use by minors as required by NYC FIRST
          program rules.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          We may update this policy from time to time. The “Last updated” date at the
          top of this page will change when we do.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about privacy: speak with NYC FIRST staff at the workshop, or use
          the contact channels provided by your program.
        </p>
      </section>
    </LegalDoc>
  );
}
