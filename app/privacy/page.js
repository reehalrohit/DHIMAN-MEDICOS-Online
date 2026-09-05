import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Dhiman Medicos",
  description:
    "Privacy Policy for Dhiman Medicos online medicine ordering platform.",
};

export default function PrivacyPage() {
  return (
    <main style={styles.page}>
      <article style={styles.card}>
        <Link href="/online-order" style={styles.back}>
          ← Back to online ordering
        </Link>

        <div style={styles.kicker}>DHIMAN MEDICOS</div>
        <h1 style={styles.title}>Privacy Policy</h1>
        <p style={styles.updated}>Last updated: 5 September 2026</p>

        <Section title="1. Information We Collect">
          <p>
            When you create an account or place an online order, we may collect
            your name, mobile number, email address, delivery address, order
            details and account information. When a prescription is required,
            we may also receive the prescription file you upload for pharmacy
            review.
          </p>
        </Section>

        <Section title="2. How We Use Your Information">
          <p>
            We use your information to authenticate your account, process and
            fulfill orders, verify prescriptions, provide home delivery or
            store-pickup services, communicate with you about your order,
            maintain pharmacy records, and improve our services.
          </p>
        </Section>

        <Section title="3. Prescription Information">
          <p>
            Prescription files are used for pharmacy review and fulfillment.
            Access is restricted to the customer and authorized pharmacy staff
            according to the application's access controls.
          </p>
        </Section>

        <Section title="4. Location Information">
          <p>
            For home delivery, the website may request your device's current
            GPS location to verify whether your delivery address is within the
            available service area. GPS does not automatically replace the
            address you enter. You remain responsible for providing the correct
            delivery address.
          </p>
          <p>
            Where an exact delivery pin is confirmed, the location may be
            retained with the order for delivery and navigation purposes. The
            location is not intended to be publicly displayed.
          </p>
        </Section>

        <Section title="5. Payments">
          <p>
            Online payments are processed through Razorpay. Dhiman Medicos
            does not store your complete card, UPI or banking credentials on
            this website. Payment information is handled by the payment
            provider according to its own security and privacy practices.
          </p>
        </Section>

        <Section title="6. Data Sharing">
          <p>
            We may share only the information reasonably required to fulfill
            your request, such as delivery details for order delivery and
            payment information with the payment provider. We do not sell your
            personal information to third parties.
          </p>
        </Section>

        <Section title="7. Cookies and Local Storage">
          <p>
            The website may use cookies, browser storage and similar
            technologies for authentication, shopping-cart persistence,
            preferences and normal website functionality.
          </p>
        </Section>

        <Section title="8. Data Security and Retention">
          <p>
            We use reasonable technical and access controls intended to protect
            customer accounts, orders, prescriptions and personal information.
            Information may be retained for operational, accounting, pharmacy
            record, legal or regulatory purposes for as long as reasonably
            necessary.
          </p>
        </Section>

        <Section title="9. Your Choices">
          <p>
            You may sign out of your account and update information available
            through your customer profile. You may contact Dhiman Medicos
            regarding account, order or privacy-related questions. Certain
            records may need to be retained where required by law or for
            legitimate business purposes.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            <strong>Dhiman Medicos</strong>
            <br />
            Adda Jhungian, Binewal
            <br />
            Punjab 144523, India
          </p>
          <p>
            Please use the contact details published on the website for
            privacy-related enquiries.
          </p>
        </Section>

        <div style={styles.notice}>
          This privacy notice may be updated when our services, data practices,
          or applicable legal requirements change. The latest version
          published on this website will apply.
        </div>
      </article>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>{title}</h2>
      {children}
    </section>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "28px 16px 60px",
    background: "#f3f8f5",
    fontFamily: "system-ui, sans-serif",
    color: "#17211d",
  },
  card: {
    maxWidth: 860,
    margin: "0 auto",
    background: "#fff",
    border: "1px solid #dfe8e2",
    borderRadius: 24,
    padding: "28px clamp(18px, 5vw, 42px)",
    boxShadow: "0 12px 40px rgba(25,60,45,.08)",
    lineHeight: 1.7,
  },
  back: {
    color: "#087f5b",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 14,
  },
  kicker: {
    marginTop: 24,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: 900,
    color: "#087f5b",
  },
  title: {
    fontSize: "clamp(2rem, 5vw, 3rem)",
    margin: "6px 0",
  },
  updated: {
    color: "#6d7b73",
    fontSize: 13,
  },
  section: {
    marginTop: 26,
  },
  h2: {
    fontSize: 18,
    margin: "0 0 8px",
  },
  notice: {
    marginTop: 28,
    padding: 14,
    borderRadius: 12,
    background: "#f1f7f3",
    border: "1px solid #d7e3db",
    color: "#315b48",
    fontSize: 13,
  },
};
