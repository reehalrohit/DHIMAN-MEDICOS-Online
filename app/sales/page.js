"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const STORE = {
  name: "DHIMAN MEDICOS",
  tagline: "YOUR TRUSTED MEDICAL STORE",
  address: "HOSHIARPUR, PUNJAB - 144523",
  contact: "9478509980",
  email: "DHIMANMEDICOS@PROTON.ME",
  drugLicence: "179327, 179328",
  pos: "03 - PUNJAB",
  remarks: "Good once sold will not be taken back",
};

const PAPER_OPTIONS = {
  "80": { label: "80 mm Thermal", widthMm: 80, cssWidth: 640 },
  a4: { label: "A4 Landscape", widthMm: 297, cssWidth: 1120 },
};

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

const text = (value, fallback = "-") => {
  const result = String(value ?? "").trim();
  return result || fallback;
};

const num = (value, fallback = 0) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function paymentLabel(method) {
  const value = String(method || "").toLowerCase();
  const map = {
    razorpay: "RAZORPAY",
    upi: "UPI",
    card: "CARD",
    cash: "CASH",
    credit: "CREDIT",
    mixed: "MIXED",
  };
  return map[value] || text(method, "N/A").toUpperCase();
}

function normaliseItem(item, index) {
  const qty = num(item?.quantity, 0);
  const rate = num(
    item?.unit_price ?? item?.selling_price ?? item?.rate ?? item?.price,
    0
  );
  const mrp = num(item?.mrp ?? item?.max_retail_price, 0);
  const amount = num(
    item?.total ?? item?.line_total,
    qty * rate
  );

  return {
    key: item?.id ?? `${item?.medicine_id || "item"}-${index}`,
    sr: index + 1,
    description: text(item?.medicine_name ?? item?.name, "Medicine"),
    pack: text(item?.pack ?? item?.pack_size ?? item?.packaging),
    company: text(item?.company ?? item?.manufacturer ?? item?.comp),
    schedule: text(item?.schedule ?? item?.sch),
    rack: text(item?.rack),
    hsn: text(item?.hsn ?? item?.hsn_code),
    batch: text(item?.batch_no ?? item?.batch_number ?? item?.batch),
    expiry: text(item?.expiry_date ?? item?.expiry ?? item?.exp),
    qty,
    omrp: num(item?.omrp ?? item?.original_mrp, 0),
    mrp,
    rate,
    discountPercent: num(item?.discount_percent, num(item?.discount, 0)),
    amount,
  };
}

function InvoiceDocument({ sale, paper }) {
  const rows = (sale?.items || []).map(normaliseItem);
  const itemCount = rows.length;
  const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
  const subtotal = num(sale?.subtotal);
  const discount = num(sale?.discount);
  const total = num(sale?.total);
  const amountPaid = num(sale?.amount_paid);
  const balance = Math.max(0, num(sale?.balance));
  const totalSaved = Math.max(0, discount);
  const discountPercent = subtotal > 0 ? (totalSaved / subtotal) * 100 : 0;
  const isPaid = balance <= 0;
  const isA4 = paper === "a4";

  const customerName = text(
    sale?.customer_name,
    "Walk-in Customer"
  );
  const customerPhone = text(sale?.customer_phone);
  const customerAddress = text(
    sale?.customer_address ??
      sale?.address ??
      sale?.address_line1
  );
  const patient = text(
    sale?.patient_name ?? sale?.customer_name,
    customerName
  );
  const doctor = text(sale?.doctor);

  return (
    <article className={`invoice-doc ${isA4 ? "doc-a4" : "doc-thermal"}`}>
      <div className="invoice-card">
        <header className="invoice-header">
          <div className="brand-panel">
            <div className="brand-mark" aria-hidden="true">DM</div>
            <div>
              <div className="brand-name">{STORE.name}</div>
              <div className="brand-tagline">{STORE.tagline}</div>
              <div className="brand-detail">{STORE.address}</div>
              <div className="brand-detail">Mob. {STORE.contact} · {STORE.email}</div>
              <div className="brand-detail">Drug Licence No. {STORE.drugLicence}</div>
            </div>
          </div>

          <div className="invoice-meta-panel">
            <div className="document-kicker">BILL OF SUPPLY</div>
            <div className="invoice-heading-row">
              <div>
                <div className="invoice-no">{text(sale?.invoice_number, "Invoice")}</div>
                <div className="issued">Issued {formatShortDate(sale?.created_at)}</div>
              </div>
              <span className={`status-chip ${isPaid ? "paid" : "due"}`}>
                {isPaid ? "PAID" : "AMOUNT DUE"}
              </span>
            </div>
          </div>
        </header>

        <section className="customer-grid">
          <div className="customer-card">
            <div className="section-kicker">CUSTOMER</div>
            <div className="customer-name">{customerName}</div>
            <div className="customer-line">{customerPhone}</div>
            <div className="customer-line">{customerAddress}</div>
          </div>

          <div className="customer-card">
            <div className="section-kicker">PATIENT / CLINICAL</div>
            <div className="clinical-row"><span>PATIENT</span><strong>{patient}</strong></div>
            <div className="clinical-row"><span>DOCTOR</span><strong>{doctor}</strong></div>
            <div className="clinical-row"><span>POS</span><strong>{STORE.pos}</strong></div>
          </div>

          <div className="customer-card payment-card">
            <div className="section-kicker">PAYMENT</div>
            <div className="payment-method">{paymentLabel(sale?.payment_method)}</div>
            <div className="payment-line"><span>Paid</span><strong>{money(amountPaid)}</strong></div>
            <div className="payment-line"><span>Due</span><strong>{money(balance)}</strong></div>
          </div>
        </section>

        <section className="items-section">
          <div className="table-caption">
            <div>
              <div className="section-kicker">ITEMS</div>
              <strong>{itemCount} product{itemCount === 1 ? "" : "s"} · {totalQty} unit{totalQty === 1 ? "" : "s"}</strong>
            </div>
            <span>Batch & expiry shown from the recorded sale</span>
          </div>

          <div className="table-scroll">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="left">DESCRIPTION</th>
                  <th>PACK</th>
                  <th>COMP</th>
                  <th>SCH</th>
                  <th>RACK</th>
                  <th>HSN</th>
                  <th>BATCH</th>
                  <th>EXP</th>
                  <th>QTY</th>
                  <th>MRP</th>
                  <th>RATE</th>
                  <th>AMT</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.sr}</td>
                    <td className="left description-cell">{row.description}</td>
                    <td>{row.pack}</td>
                    <td>{row.company}</td>
                    <td>{row.schedule}</td>
                    <td>{row.rack}</td>
                    <td>{row.hsn}</td>
                    <td>{row.batch}</td>
                    <td>{row.expiry}</td>
                    <td>{row.qty}</td>
                    <td>{row.mrp > 0 ? row.mrp.toFixed(2) : "-"}</td>
                    <td>{row.rate.toFixed(2)}</td>
                    <td className="amount-cell">{row.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bottom-grid">
          <div className="remarks-panel">
            <div className="section-kicker">REMARKS</div>
            <p>{STORE.remarks}</p>
            <p>E&amp;OE</p>
            <div className="legal-note">
              This invoice reflects the sale and batch details recorded by DHIMAN MEDICOS.
            </div>
          </div>

          <div className="summary-panel">
            <div className="summary-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
            <div className="summary-row"><span>Discount</span><strong>{discountPercent.toFixed(2)}% {discount > 0 ? `(- ${money(discount)})` : ""}</strong></div>
            <div className="summary-row"><span>Total Saved</span><strong>{money(totalSaved)}</strong></div>
            <div className="grand-total-row">
              <span>TO PAY</span>
              <strong>{money(total)}</strong>
            </div>
            <div className="summary-row paid-due-row"><span>PAID / DUE</span><strong>{money(amountPaid)} / {money(balance)}</strong></div>
          </div>
        </section>

        <footer className="invoice-footer">
          <span>Thank you for choosing DHIMAN MEDICOS.</span>
          <span>Keep this invoice for your records.</span>
          <strong>GET WELL SOON</strong>
        </footer>
      </div>
    </article>
  );
}

export default function SalesHistoryPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSale, setSelectedSale] = useState(null);
  const [paper, setPaper] = useState("a4");
  const [busy, setBusy] = useState(false);
  const invoiceRef = useRef(null);

  useEffect(() => {
    loadSales();
    try {
      const saved = localStorage.getItem("dhiman-medicos-invoice-paper");
      if (saved === "80" || saved === "a4") setPaper(saved);
    } catch (_) {}
  }, []);

  async function loadSales() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/pos/sales", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load sales");
      }
      setSales(data.sales || []);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load sales");
    } finally {
      setLoading(false);
    }
  }

  function selectPaper(value) {
    if (!PAPER_OPTIONS[value]) return;
    setPaper(value);
    try { localStorage.setItem("dhiman-medicos-invoice-paper", value); } catch (_) {}
  }

  async function renderInvoiceCanvas() {
    if (!invoiceRef.current || !selectedSale) return null;
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch (_) {}
    }

    const source = invoiceRef.current;
    const clone = source.cloneNode(true);
    clone.querySelectorAll(".invoice-toolbar, .screen-only").forEach((el) => el.remove());

    const option = PAPER_OPTIONS[paper] || PAPER_OPTIONS.a4;
    clone.style.width = `${option.cssWidth}px`;
    clone.style.maxWidth = "none";
    clone.style.position = "absolute";
    clone.style.left = "-100000px";
    clone.style.top = "0";
    clone.style.margin = "0";
    clone.style.background = "#fff";
    clone.style.boxShadow = "none";
    clone.style.borderRadius = "0";
    clone.style.overflow = "visible";

    document.body.appendChild(clone);
    try {
      return await html2canvas(clone, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: clone.scrollWidth,
        height: clone.scrollHeight,
        windowWidth: clone.scrollWidth,
        windowHeight: clone.scrollHeight,
      });
    } finally {
      clone.remove();
    }
  }

  async function downloadPDF() {
    if (!selectedSale) return;
    setBusy(true);
    try {
      const canvas = await renderInvoiceCanvas();
      if (!canvas) return;

      const option = PAPER_OPTIONS[paper] || PAPER_OPTIONS.a4;
      const img = canvas.toDataURL("image/png", 1);
      const isA4 = paper === "a4";
      const pdf = isA4
        ? new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
        : new jsPDF({ orientation: "portrait", unit: "mm", format: [80, Math.max(45, (canvas.height * 80) / canvas.width + 6)] });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = isA4 ? 6 : 2;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = (canvas.height * contentWidth) / canvas.width;

      if (isA4 && contentHeight > pageHeight - margin * 2) {
        const scale = (pageHeight - margin * 2) / contentHeight;
        const w = contentWidth * scale;
        const h = contentHeight * scale;
        pdf.addImage(img, "PNG", (pageWidth - w) / 2, margin, w, h, undefined, "FAST");
      } else {
        pdf.addImage(img, "PNG", margin, margin, contentWidth, contentHeight, undefined, "FAST");
      }

      pdf.save(`${selectedSale.invoice_number || "invoice"}.pdf`);
    } catch (err) {
      console.error("Invoice PDF failed", err);
      alert("Could not create the PDF. Please use Print and choose Save as PDF.");
    } finally {
      setBusy(false);
    }
  }

  function printInvoice() {
    if (!selectedSale) return;
    document.documentElement.classList.remove("print-invoice-a4", "print-invoice-80");
    document.documentElement.classList.add(paper === "80" ? "print-invoice-80" : "print-invoice-a4");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        setTimeout(() => {
          document.documentElement.classList.remove("print-invoice-a4", "print-invoice-80");
        }, 1000);
      });
    });
  }

  return (
    <>
      <main className="sales-page">
        <header className="sales-header">
          <div>
            <div className="eyebrow">DHIMAN MEDICOS · POS</div>
            <h1>Sales &amp; Invoices</h1>
            <p>{sales.length} invoice{sales.length === 1 ? "" : "s"} recorded</p>
          </div>
          <div className="header-actions">
            <button type="button" className="secondary" onClick={loadSales} disabled={loading}>
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
            <Link href="/" className="primary">← Back to POS</Link>
          </div>
        </header>

        {loading && <div className="state-card">Loading sales…</div>}
        {!loading && error && <div className="state-card error">{error}</div>}
        {!loading && !error && !sales.length && (
          <div className="state-card">
            <div className="empty-icon">🧾</div>
            <h2>No invoices yet</h2>
            <p>Complete a POS sale to create an invoice.</p>
          </div>
        )}

        {!loading && !error && sales.length > 0 && (
          <section className="sales-list">
            {sales.map((sale) => {
              const due = num(sale.balance) > 0;
              return (
                <article className="sale-card" key={sale.id}>
                  <div className="sale-left">
                    <div className="sale-icon">🧾</div>
                    <div>
                      <div className="invoice-id">{text(sale.invoice_number, "Invoice")}</div>
                      <div className="sale-date">{formatDate(sale.created_at)}</div>
                      <div className="sale-meta">
                        <span>{sale.items?.length || 0} item{(sale.items?.length || 0) === 1 ? "" : "s"}</span>
                        <span>·</span>
                        <span>{paymentLabel(sale.payment_method)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="sale-right">
                    <div className="sale-total">{money(sale.total)}</div>
                    <span className={`status-mini ${due ? "due" : "paid"}`}>{due ? "AMOUNT DUE" : "PAID"}</span>
                    <button type="button" className="view-button" onClick={() => setSelectedSale(sale)}>
                      View Invoice →
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      {selectedSale && (
        <div className="modal-overlay" onClick={() => setSelectedSale(null)}>
          <div className="modal-shell" onClick={(event) => event.stopPropagation()}>
            <div className="invoice-toolbar">
              <div>
                <div className="toolbar-title">Invoice preview</div>
                <div className="toolbar-subtitle">Professional print-ready format with recorded medicine, batch, expiry and payment data.</div>
              </div>
              <button type="button" className="close-btn" onClick={() => setSelectedSale(null)} aria-label="Close invoice">×</button>
            </div>

            <div className="format-bar screen-only">
              <div className="format-label">Output format</div>
              <div className="format-tabs">
                {Object.entries(PAPER_OPTIONS).map(([key, option]) => (
                  <button key={key} type="button" className={paper === key ? "format-tab active" : "format-tab"} onClick={() => selectPaper(key)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="invoice-viewport">
              <div ref={invoiceRef} className="invoice-stage">
                <InvoiceDocument sale={selectedSale} paper={paper} />
              </div>
            </div>

            <div className="modal-actions screen-only">
              <button type="button" className="action-primary" onClick={printInvoice}>🖨 Print Invoice</button>
              <button type="button" className="action-secondary" onClick={downloadPDF} disabled={busy}>{busy ? "Creating PDF…" : "↓ Download PDF"}</button>
              <button type="button" className="action-tertiary" onClick={() => setSelectedSale(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #f4f6f4; color: #15221c; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        button, input, select { font: inherit; }
        button { -webkit-tap-highlight-color: transparent; }

        .sales-page { min-height: 100vh; max-width: 1280px; margin: 0 auto; padding: 26px 20px 50px; }
        .sales-header { display:flex; justify-content:space-between; align-items:flex-end; gap:20px; margin-bottom:22px; }
        .eyebrow,.section-kicker,.document-kicker { font-size:11px; font-weight:900; letter-spacing:1.35px; color:#087e5a; }
        .sales-header h1 { margin:5px 0 0; font-size:34px; line-height:1.05; letter-spacing:-1px; }
        .sales-header p { margin:7px 0 0; color:#718078; font-size:14px; }
        .header-actions { display:flex; gap:9px; }
        .primary,.secondary,.view-button,.action-primary,.action-secondary,.action-tertiary,.format-tab { border:0; cursor:pointer; text-decoration:none; font-weight:800; border-radius:11px; }
        .primary { background:#076747; color:#fff; padding:11px 15px; }
        .secondary { background:#e9efeb; color:#173229; padding:11px 15px; }
        .secondary:disabled { opacity:.55; cursor:not-allowed; }
        .state-card { margin-top:18px; padding:45px 20px; background:#fff; border:1px solid #dfe7e2; border-radius:18px; text-align:center; box-shadow:0 10px 30px rgba(23,46,36,.05); }
        .state-card h2 { margin:8px 0 0; }
        .state-card p { color:#718078; }
        .state-card.error { color:#8f2924; background:#fff7f6; border-color:#f0ceca; }
        .empty-icon { font-size:34px; }
        .sales-list { display:grid; gap:12px; }
        .sale-card { display:flex; justify-content:space-between; align-items:center; gap:18px; padding:16px; background:#fff; border:1px solid #dfe7e2; border-radius:18px; box-shadow:0 8px 26px rgba(23,46,36,.05); }
        .sale-left { min-width:0; display:flex; align-items:center; gap:13px; }
        .sale-icon { width:46px; height:46px; border-radius:13px; display:grid; place-items:center; background:#edf7f2; font-size:20px; flex:0 0 46px; }
        .invoice-id { font-size:16px; font-weight:900; }
        .sale-date { margin-top:4px; color:#6e7a74; font-size:12px; }
        .sale-meta { display:flex; gap:7px; margin-top:7px; color:#53625a; font-size:11px; font-weight:700; }
        .sale-right { display:flex; align-items:center; gap:11px; flex-shrink:0; }
        .sale-total { font-size:21px; font-weight:900; }
        .status-mini,.status-chip { border-radius:999px; font-size:9px; font-weight:900; letter-spacing:.75px; padding:6px 9px; white-space:nowrap; }
        .status-mini.paid,.status-chip.paid { background:#e8f7f0; color:#087e5a; }
        .status-mini.due,.status-chip.due { background:#fff0db; color:#9b5a00; }
        .view-button { background:#076747; color:#fff; padding:10px 12px; }

        .modal-overlay { position:fixed; inset:0; z-index:100; padding:16px; display:flex; align-items:center; justify-content:center; background:rgba(10,20,16,.70); backdrop-filter:blur(6px); }
        .modal-shell { width:min(1500px,100%); max-height:96vh; display:flex; flex-direction:column; overflow:hidden; border-radius:18px; background:#fff; box-shadow:0 30px 90px rgba(0,0,0,.3); }
        .invoice-toolbar { display:flex; justify-content:space-between; align-items:center; gap:15px; padding:13px 16px; border-bottom:1px solid #e1e7e3; background:#fbfcfb; }
        .toolbar-title { font-size:14px; font-weight:900; }
        .toolbar-subtitle { margin-top:3px; color:#718078; font-size:10px; }
        .close-btn { width:38px; height:38px; border:1px solid #d7dfda; border-radius:10px; background:#fff; font-size:23px; cursor:pointer; color:#37443e; }
        .format-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 14px; border-bottom:1px solid #e5ebe7; background:#f6f8f6; }
        .format-label { font-size:11px; font-weight:900; color:#52605a; }
        .format-tabs { display:flex; gap:6px; }
        .format-tab { padding:8px 11px; color:#5a6761; background:#e7ece9; font-size:11px; }
        .format-tab.active { color:#fff; background:#076747; }
        .invoice-viewport { flex:1; min-height:0; overflow:auto; background:#dce2df; padding:22px; }
        .invoice-stage { width:max-content; min-width:100%; }

        .invoice-doc { color:#111a16; }
        .doc-a4 { width:1120px; margin:0 auto; }
        .doc-thermal { width:302px; margin:0 auto; }
        .invoice-card { background:#fff; border:1px solid #cfd8d3; box-shadow:0 12px 36px rgba(22,41,33,.10); }
        .invoice-header { display:grid; grid-template-columns:1.35fr .85fr; border-bottom:1px solid #101713; }
        .brand-panel { display:flex; align-items:center; gap:13px; padding:16px 18px; }
        .brand-mark { width:48px; height:48px; flex:0 0 48px; display:grid; place-items:center; border-radius:13px; background:linear-gradient(135deg,#075f46,#0f9b6a); color:#fff; font-weight:950; font-size:15px; letter-spacing:-.5px; }
        .brand-name { font-size:22px; line-height:1; font-weight:950; letter-spacing:-.55px; }
        .brand-tagline { margin-top:4px; font-size:7px; letter-spacing:1.7px; font-weight:900; color:#087e5a; }
        .brand-detail { margin-top:3px; font-size:7.5px; color:#617069; }
        .invoice-meta-panel { display:flex; flex-direction:column; justify-content:center; padding:15px 18px; border-left:1px solid #101713; }
        .document-kicker { color:#52615a; }
        .invoice-heading-row { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin-top:5px; }
        .invoice-no { font-size:18px; font-weight:950; letter-spacing:-.4px; }
        .issued { margin-top:3px; color:#68756e; font-size:8px; }
        .status-chip { padding:7px 10px; }

        .customer-grid { display:grid; grid-template-columns:1.2fr 1.2fr .7fr; border-bottom:1px solid #cfd8d3; }
        .customer-card { padding:11px 14px; border-right:1px solid #d7dfdb; min-height:91px; }
        .customer-card:last-child { border-right:0; }
        .section-kicker { font-size:8px; letter-spacing:1.1px; }
        .customer-name { margin-top:6px; font-size:12px; font-weight:950; }
        .customer-line { margin-top:3px; color:#63716a; font-size:8px; line-height:1.35; word-break:break-word; }
        .clinical-row { display:grid; grid-template-columns:52px 1fr; gap:8px; margin-top:6px; font-size:8px; }
        .clinical-row span { color:#7a857f; font-size:7px; font-weight:900; }
        .clinical-row strong { overflow-wrap:anywhere; }
        .payment-method { margin-top:6px; font-size:12px; font-weight:950; color:#087e5a; }
        .payment-line { display:flex; justify-content:space-between; gap:6px; margin-top:5px; font-size:8px; }
        .payment-line span { color:#728078; }

        .items-section { padding:13px 14px 0; }
        .table-caption { display:flex; justify-content:space-between; align-items:flex-end; gap:15px; margin-bottom:8px; }
        .table-caption strong { display:block; margin-top:2px; font-size:10px; }
        .table-caption > span { color:#78837e; font-size:7px; }
        .table-scroll { overflow:hidden; }
        .invoice-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:7px; }
        .invoice-table th,.invoice-table td { border:1px solid #cfd7d2; padding:5px 3px; text-align:center; vertical-align:middle; line-height:1.15; word-break:break-word; }
        .invoice-table th { background:#eef4f1; color:#3f4d46; font-size:6.4px; letter-spacing:.35px; font-weight:950; white-space:nowrap; }
        .invoice-table .left { text-align:left; }
        .description-cell { font-weight:850; }
        .amount-cell { font-weight:950; color:#075f46; }
        .invoice-table th:nth-child(1),.invoice-table td:nth-child(1){width:3%;}
        .invoice-table th:nth-child(2),.invoice-table td:nth-child(2){width:14%;}
        .invoice-table th:nth-child(3),.invoice-table td:nth-child(3){width:5.5%;}
        .invoice-table th:nth-child(4),.invoice-table td:nth-child(4){width:7%;}
        .invoice-table th:nth-child(5),.invoice-table td:nth-child(5){width:4%;}
        .invoice-table th:nth-child(6),.invoice-table td:nth-child(6){width:4%;}
        .invoice-table th:nth-child(7),.invoice-table td:nth-child(7){width:6.5%;}
        .invoice-table th:nth-child(8),.invoice-table td:nth-child(8){width:8%;}
        .invoice-table th:nth-child(9),.invoice-table td:nth-child(9){width:5%;}
        .invoice-table th:nth-child(10),.invoice-table td:nth-child(10){width:4%;}
        .invoice-table th:nth-child(11),.invoice-table td:nth-child(11){width:6.5%;}
        .invoice-table th:nth-child(12),.invoice-table td:nth-child(12){width:6.5%;}
        .invoice-table th:nth-child(13),.invoice-table td:nth-child(13){width:6.5%;}
        .invoice-table th:nth-child(14),.invoice-table td:nth-child(14){width:6%;}
        .invoice-table th:nth-child(15),.invoice-table td:nth-child(15){width:7.5%;}

        .bottom-grid { display:grid; grid-template-columns:1fr 310px; gap:20px; margin:13px 14px 0; border-top:1px solid #cfd8d3; }
        .remarks-panel { padding:12px 0 10px; }
        .remarks-panel p { margin:5px 0 0; font-size:8px; color:#53615b; }
        .legal-note { margin-top:17px; max-width:560px; color:#7b867f; font-size:7px; line-height:1.35; }
        .summary-panel { border-left:1px solid #d7dfdb; }
        .summary-row,.grand-total-row { display:flex; justify-content:space-between; align-items:center; gap:15px; padding:8px 10px; border-bottom:1px solid #d7dfdb; font-size:8px; }
        .summary-row span { color:#65726c; }
        .grand-total-row { margin-top:1px; background:#0a654a; color:#fff; font-size:12px; font-weight:950; border-bottom:0; }
        .paid-due-row { border-bottom:0; font-weight:800; }
        .invoice-footer { display:flex; justify-content:space-between; align-items:center; gap:15px; padding:9px 14px; margin-top:3px; border-top:1px solid #101713; color:#68756f; font-size:7px; }
        .invoice-footer strong { color:#087e5a; letter-spacing:1px; font-size:7px; }

        .doc-thermal .invoice-header { display:block; }
        .doc-thermal .brand-panel { padding:10px 10px 8px; }
        .doc-thermal .brand-mark { width:34px; height:34px; flex-basis:34px; border-radius:9px; font-size:10px; }
        .doc-thermal .brand-name { font-size:14px; }
        .doc-thermal .brand-tagline { font-size:5px; letter-spacing:1px; }
        .doc-thermal .brand-detail { font-size:5.4px; }
        .doc-thermal .invoice-meta-panel { border-left:0; border-top:1px solid #cfd8d3; padding:8px 10px; }
        .doc-thermal .invoice-no { font-size:11px; }
        .doc-thermal .issued { font-size:5.4px; }
        .doc-thermal .status-chip { font-size:5px; padding:5px 7px; }
        .doc-thermal .customer-grid { display:block; }
        .doc-thermal .customer-card { min-height:auto; padding:7px 9px; border-right:0; border-bottom:1px solid #d7dfdb; }
        .doc-thermal .customer-card:last-child { border-bottom:0; }
        .doc-thermal .section-kicker { font-size:5.6px; }
        .doc-thermal .customer-name { font-size:8px; }
        .doc-thermal .customer-line,.doc-thermal .clinical-row,.doc-thermal .payment-line { font-size:5.8px; }
        .doc-thermal .clinical-row { grid-template-columns:40px 1fr; margin-top:4px; }
        .doc-thermal .clinical-row span { font-size:5px; }
        .doc-thermal .payment-method { font-size:8px; }
        .doc-thermal .items-section { padding:8px 8px 0; }
        .doc-thermal .table-caption { margin-bottom:5px; }
        .doc-thermal .table-caption strong { font-size:7px; }
        .doc-thermal .table-caption > span { font-size:5px; }
        .doc-thermal .invoice-table { font-size:4.4px; }
        .doc-thermal .invoice-table th,.doc-thermal .invoice-table td { padding:3px 2px; }
        .doc-thermal .invoice-table th { font-size:3.9px; }
        .doc-thermal .bottom-grid { grid-template-columns:1fr; gap:0; margin:8px 8px 0; }
        .doc-thermal .remarks-panel { padding:7px 0; }
        .doc-thermal .remarks-panel p { font-size:5.5px; margin-top:3px; }
        .doc-thermal .legal-note { display:none; }
        .doc-thermal .summary-panel { border-left:0; border-top:1px solid #d7dfdb; }
        .doc-thermal .summary-row,.doc-thermal .grand-total-row { padding:6px 7px; font-size:5.8px; }
        .doc-thermal .grand-total-row { font-size:8px; }
        .doc-thermal .invoice-footer { margin-top:5px; padding:6px 8px; font-size:5px; }
        .doc-thermal .invoice-footer strong { font-size:5px; }

        .modal-actions { display:flex; gap:8px; padding:12px 14px; border-top:1px solid #e0e7e3; background:#fff; }
        .modal-actions button { flex:1; min-height:42px; }
        .action-primary { background:#076747; color:#fff; }
        .action-secondary { background:#e8efeb; color:#19362b; }
        .action-tertiary { background:#f0f2f1; color:#47534e; }
        .modal-actions button:disabled { opacity:.55; cursor:not-allowed; }

        @media (max-width:900px) {
          .sales-page { padding:16px 12px 35px; }
          .sales-header { align-items:stretch; flex-direction:column; }
          .header-actions { width:100%; }
          .header-actions > * { flex:1; text-align:center; }
          .sale-card { align-items:stretch; flex-direction:column; }
          .sale-right { justify-content:space-between; }
          .invoice-viewport { padding:10px; }
        }
        @media (max-width:640px) {
          .sale-right { flex-wrap:wrap; }
          .sale-total { margin-right:auto; }
          .invoice-toolbar { align-items:flex-start; }
          .format-bar { align-items:flex-start; flex-direction:column; }
          .format-tabs { width:100%; }
          .format-tab { flex:1; }
          .modal-actions { flex-direction:column; }
        }

        @media print {
          @page { margin:0; }
          body { background:#fff !important; }
          body * { visibility:hidden !important; }
          .print-invoice-a4 .invoice-doc.doc-a4,
          .print-invoice-a4 .invoice-doc.doc-a4 * { visibility:visible !important; }
          .print-invoice-80 .invoice-doc.doc-thermal,
          .print-invoice-80 .invoice-doc.doc-thermal * { visibility:visible !important; }
          .modal-overlay { position:static !important; background:#fff !important; padding:0 !important; }
          .modal-shell { width:100% !important; max-height:none !important; overflow:visible !important; box-shadow:none !important; border-radius:0 !important; }
          .invoice-toolbar,.format-bar,.modal-actions,.screen-only { display:none !important; }
          .invoice-viewport { overflow:visible !important; padding:0 !important; background:#fff !important; }
          .invoice-stage { width:auto !important; min-width:0 !important; }
          .invoice-doc { margin:0 !important; }
          .doc-a4 { width:100% !important; }
          .doc-thermal { width:80mm !important; }
          .invoice-card { box-shadow:none !important; border:0 !important; }
          .invoice-footer { break-inside:avoid; }
        }
      `}</style>
    </>
  );
}
