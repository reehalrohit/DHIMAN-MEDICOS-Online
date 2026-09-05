import Link from "next/link";

export const metadata = {
  title: "Terms & Conditions | Dhiman Medicos",
  description:
    "Terms and Conditions for ordering medicines online from Dhiman Medicos.",
};

export default function TermsPage() {
  return (
    <main style={styles.page}>
      <article style={styles.card}>
        <Link href="/online-order" style={styles.back}>
          ← Back to online ordering
        </Link>

        <div style={styles.kicker}>DHIMAN MEDICOS</div>
        <h1 style={styles.title}>Terms & Conditions</h1>
        <p style={styles.updated}>Last updated: 5 September 2026</p>

        <Section title="1. About These Terms">
          <p>
            These Terms & Conditions govern the use of the Dhiman Medicos
            online ordering service. By creating an account, placing an order,
            or using this website, you agree to these terms.
          </p>
        </Section>

        <Section title="2. Customer Account">
          <p>
            You may need to create an account to place an online order. You are
            responsible for providing accurate information and keeping your
            login credentials secure.
          </p>
          <p>
            You must not use another person's account or provide false
            information when placing an order.
          </p>
        </Section>

        <Section title="3. Medicine Orders">
          <p>
            Adding a medicine to your cart does not guarantee that the item
            will ultimately be supplied. Orders are subject to stock
            availability, pharmacy review, applicable prescription
            requirements, and confirmation by Dhiman Medicos.
          </p>
          <p>
            The pharmacy may contact you if clarification, a valid
            prescription, substitution approval, or other information is
            required before an order can be fulfilled.
          </p>
        </Section>

        <Section title="4. Prescription Medicines">
          <p>
            Certain medicines may require a valid prescription. Where
            applicable, you must provide a valid prescription issued by an
            appropriately qualified healthcare professional.
          </p>
          <p>
            Dhiman Medicos may reject or hold an order if the prescription is
            missing, invalid, unclear, expired, or does not support the
            requested medicine.
          </p>
        </Section>

        <Section title="5. Prices and Availability">
          <p>
            Product prices and availability displayed on the website may
            change. We make reasonable efforts to keep catalog information
            accurate, but an item may become unavailable before an order is
            confirmed.
          </p>
          <p>
            The final amount payable is the amount confirmed by Dhiman Medicos
            for the order.
          </p>
        </Section>

        <Section title="6. Payment">
          <p>
            Available payment methods depend on the selected fulfillment
            method and the options displayed at checkout.
          </p>
          <p>
            Online payments are processed through Razorpay. Dhiman Medicos
            does not receive or store your complete card or banking credentials
            through the ordering application.
          </p>
        </Section>

        <Section title="7. Home Delivery">
          <p>
            Home delivery is currently subject to the delivery area and
            serviceability rules displayed at checkout.
          </p>
          <p>
            The customer may be asked to provide their current GPS location to
            verify delivery eligibility. The delivery location should be
            accurate and should identify the intended delivery entrance or
            location.
          </p>
          <p>
            The website currently requires a minimum order value of ₹199 for
            home delivery and may require online advance payment as displayed
            during checkout.
          </p>
        </Section>

        <Section title="8. Store Pickup">
          <p>
            Customers selecting store pickup must collect the confirmed order
            from Dhiman Medicos during the applicable business hours.
          </p>
          <p>
            Where payment on pickup is offered, payment must be completed at
            the store before the medicines are handed over.
          </p>
        </Section>

        <Section title="9. Order Confirmation and Cancellation">
          <p>
            An order submitted through the website is a request for supply and
            may require pharmacy confirmation. Dhiman Medicos may cancel or
            decline an order where stock, prescription, payment, service-area,
            legal, or other fulfillment requirements cannot be satisfied.
          </p>
          <p>
            If an eligible prepaid order is cancelled by Dhiman Medicos,
            applicable refunds will be processed through the relevant payment
            mechanism, subject to the circumstances of the cancellation.
          </p>
        </Section>

        <Section title="10. Delivery Accuracy">
          <p>
            Customers are responsible for providing a correct name, mobile
            number, address, PIN code and delivery location. Delays or failed
            delivery caused by incorrect or incomplete information may require
            additional coordination before delivery can be completed.
          </p>
        </Section>

        <Section title="11. Health and Medical Disclaimer">
          <p>
            The online ordering service is not a substitute for consultation
            with a doctor, pharmacist, or other qualified healthcare
            professional.
          </p>
          <p>
            Do not start, stop, or change medication solely based on information
            displayed on this website. Follow the instructions of your
            healthcare professional and the medicine's approved labeling.
          </p>
        </Section>

        <Section title="12. Prohibited Use">
          <p>
            You must not misuse the website, attempt unauthorized access,
            interfere with its operation, submit fraudulent orders, upload
            unlawful content, or use the service for any unlawful purpose.
          </p>
        </Section>

        <Section title="13. Website Availability">
          <p>
            We aim to keep the service available and accurate, but temporary
            interruptions may occur because of maintenance, technical issues,
            network problems, payment-provider issues, or circumstances beyond
            our reasonable control.
          </p>
        </Section>

        <Section title="14. Privacy">
          <p>
            Your use of the website is also subject to our Privacy Policy,
            which explains how customer information, order information,
            prescriptions, and delivery information are handled.
          </p>

          <Link href="/privacy" style={styles.inlineLink}>
            Read our Privacy Policy →
          </Link>
        </Section>

        <Section title="15. Changes to These Terms">
          <p>
            We may update these Terms & Conditions when our services,
            operational practices, or applicable requirements change. The
            latest version published on this website will apply to future use
            of the service.
          </p>
        </Section>

        <Section title="16. Contact">
          <p>
            <strong>Dhiman Medicos</strong>
            <br />
            Adda Jhungian, Binewal
            <br />
            Punjab 144523, India
          </p>
          <p>
            Please use the contact details published on the website for
            questions about orders, payments, delivery, or these terms.
          </p>
        </Section>

        <div style={styles.notice}>
          By continuing to use the online ordering service, you acknowledge
          that you have read and understood these Terms & Conditions.
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
  inlineLink: {
    display: "inline-block",
    marginTop: 4,
    color: "#087f5b",
    fontWeight: 800,
    textDecoration: "none",
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
