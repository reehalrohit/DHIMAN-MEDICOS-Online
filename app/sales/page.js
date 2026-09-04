"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const PAPER_OPTIONS = {
  auto: { label: "Auto • 80 mm", width: 80, cssWidth: 302 },
  "58": { label: "58 mm Thermal", width: 58, cssWidth: 219 },
  "80": { label: "80 mm Thermal", width: 80, cssWidth: 302 },
  a4: { label: "A4 Invoice", width: 210, cssWidth: 794 },
};

function money(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return value;
  }
}

function paymentLabel(method) {
  const value = String(method || "").toLowerCase();
  if (value === "razorpay") return "RAZORPAY";
  if (value === "upi") return "UPI";
  if (value === "card") return "CARD";
  if (value === "cash") return "CASH";
  if (value === "credit") return "CREDIT";
  if (value === "mixed") return "MIXED";
  return String(method || "-").toUpperCase();
}

function isOnlinePayment(method) {
  return ["razorpay", "upi", "card"].includes(String(method || "").toLowerCase());
}

export default function SalesHistoryPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paperSize, setPaperSize] = useState("auto");
  const [selectedSale, setSelectedSale] = useState(null);
  const [busy, setBusy] = useState(false);

  const receiptRef = useRef(null);

  useEffect(() => {
    loadSales();
    try {
      const saved = localStorage.getItem("dhiman-medicos-paper-size");
      if (saved && PAPER_OPTIONS[saved]) setPaperSize(saved);
    } catch (_) {}
  }, []);

  async function loadSales() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/pos/sales", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load sales");
      setSales(data.sales || []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load sales");
    } finally {
      setLoading(false);
    }
  }

  function changePaperSize(value) {
    if (!PAPER_OPTIONS[value]) return;
    setPaperSize(value);
    try {
      localStorage.setItem("dhiman-medicos-paper-size", value);
    } catch (_) {}
  }

  async function makeReceiptCanvas() {
    if (!receiptRef.current || !selectedSale) return null;
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch (_) {}
    }

    const source = receiptRef.current;
    const clone = source.cloneNode(true);
    clone.querySelectorAll(".receipt-actions, .invoice-toolbar, button, select").forEach((el) => el.remove());

    const option = PAPER_OPTIONS[paperSize] || PAPER_OPTIONS.auto;
    clone.classList.add("pdf-render-copy");
    clone.style.width = `${option.cssWidth}px`;
    clone.style.maxWidth = "none";
    clone.style.maxHeight = "none";
    clone.style.height = "auto";
    clone.style.overflow = "visible";
    clone.style.position = "absolute";
    clone.style.left = "-100000px";
    clone.style.top = "0";
    clone.style.background = "#fff";
    clone.style.color = "#111827";
    clone.style.boxShadow = "none";
    clone.style.borderRadius = "0";
    clone.style.margin = "0";

    document.body.appendChild(clone);
    try {
      return await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
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
      const canvas = await makeReceiptCanvas();
      if (!canvas) return;

      const imgData = canvas.toDataURL("image/png", 1.0);
      const option = PAPER_OPTIONS[paperSize] || PAPER_OPTIONS.auto;
      const isA4 = paperSize === "a4";
      const margin = isA4 ? 8 : paperSize === "58" ? 2 : 3;
      const contentWidth = option.width - margin * 2;
      const contentHeight = (canvas.height * contentWidth) / canvas.width;

      const pdf = new jsPDF(
        isA4
          ? { orientation: "portrait", unit: "mm", format: "a4" }
          : {
              orientation: "portrait",
              unit: "mm",
              format: [option.width, Math.max(40, contentHeight + margin * 2)],
            }
      );

      if (isA4) {
        const maxHeight = 297 - margin * 2;
        const ratio = Math.min(1, maxHeight / contentHeight);
        const drawWidth = contentWidth * ratio;
        const drawHeight = contentHeight * ratio;
        pdf.addImage(imgData, "PNG", (210 - drawWidth) / 2, margin, drawWidth, drawHeight);
      } else {
        pdf.addImage(imgData, "PNG", margin, margin, contentWidth, contentHeight);
      }

      const filename = `${selectedSale.invoice_number || "invoice"}.pdf`;
      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      console.error("Invoice PDF download failed:", err);
      alert("Could not create the invoice PDF. Please try Print and choose Save as PDF.");
    } finally {
      setBusy(false);
    }
  }

  function printReceipt() {
    if (!selectedSale || !receiptRef.current) return;
    const root = document.documentElement;
    root.classList.remove("printing-invoice-58", "printing-invoice-80", "printing-invoice-a4");
    root.classList.add(
      paperSize === "58" ? "printing-invoice-58" : paperSize === "a4" ? "printing-invoice-a4" : "printing-invoice-80"
    );

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        setTimeout(() => {
          root.classList.remove("printing-invoice-58", "printing-invoice-80", "printing-invoice-a4");
        }, 1000);
      });
    });
  }

  const selectedPayment = paymentLabel(selectedSale?.payment_method);
  const selectedIsPaid = Number(selectedSale?.balance || 0) <= 0;

  return (
    <>
      <main className="sales-page mx-auto max-w-6xl p-4 md:p-6">
        <header className="sales-header mb-6">
          <div>
            <div className="sales-eyebrow">DHIMAN MEDICOS • POS</div>
            <h1>Sales History</h1>
            <p>{sales.length} invoice{sales.length !== 1 ? "s" : ""} recorded</p>
          </div>
          <div className="sales-header-actions">
            <button onClick={loadSales} className="secondary-btn" disabled={loading}>↻ Refresh</button>
            <Link href="/" className="primary-btn">← Back to POS</Link>
          </div>
        </header>

        {loading && <div className="state-card">Loading sales…</div>}

        {!loading && error && <div className="state-card error-state">{error}</div>}

        {!loading && !error && sales.length === 0 && (
          <div className="state-card">
            <div className="empty-icon">🧾</div>
            <h2>No sales yet</h2>
            <p>Complete a POS sale to see invoices here.</p>
          </div>
        )}

        {!loading && !error && sales.length > 0 && (
          <section className="sales-list">
            {sales.map((sale) => {
              const paid = Number(sale.balance || 0) <= 0;
              return (
                <article key={sale.id} className="sale-card">
                  <div className="sale-card-main">
                    <div className="invoice-mini-icon">🧾</div>
                    <div className="sale-info">
                      <div className="sale-invoice-number">{sale.invoice_number || "Invoice"}</div>
                      <div className="sale-date">{formatDate(sale.created_at)}</div>
                      <div className="sale-meta">
                        <span>{sale.items?.length || 0} item{(sale.items?.length || 0) !== 1 ? "s" : ""}</span>
                        <span>•</span>
                        <span>{paymentLabel(sale.payment_method)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="sale-card-right">
                    <div className="sale-total">{money(sale.total)}</div>
                    <div className={`paid-pill ${paid ? "paid" : "due"}`}>{paid ? "✓ PAID" : "AMOUNT DUE"}</div>
                    <button onClick={() => setSelectedSale(sale)} className="view-btn">View invoice →</button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      {selectedSale && (
        <div className="invoice-overlay">
          <div className="invoice-shell">
            <div className="invoice-toolbar">
              <div>
                <div className="toolbar-title">Invoice preview</div>
                <div className="toolbar-subtitle">Choose the output format before printing or saving.</div>
              </div>
              <button className="close-btn" onClick={() => setSelectedSale(null)} aria-label="Close invoice">×</button>
            </div>

            <div className="paper-selector-row">
              <div className="format-tabs" role="group" aria-label="Invoice format">
                {Object.entries(PAPER_OPTIONS).map(([key, option]) => (
                  <button
                    key={key}
                    onClick={() => changePaperSize(key)}
                    className={paperSize === key ? "format-tab active" : "format-tab"}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="invoice-scroll">
              <div
                ref={receiptRef}
                className={`invoice-paper print-area ${paperSize === "58" ? "paper-58" : paperSize === "a4" ? "paper-a4" : "paper-80"}`}
              >
                <div className="invoice-brand-row">
                  <div className="brand-mark">DM</div>
                  <div className="brand-copy">
                    <div className="brand-name">DHIMAN MEDICOS</div>
                    <div className="brand-tagline">YOUR TRUSTED MEDICAL STORE</div>
                    <div className="brand-address">Binewal, Hoshiarpur, Punjab</div>
                <div className="brand-license">
  Drug Licence No.: 179327, 179328
</div>
                  </div>
                  <div className={`invoice-status ${selectedIsPaid ? "paid" : "due"}`}>
                    <strong>{selectedIsPaid ? "✓ PAID" : "DUE"}</strong>
                    <span>{selectedPayment}</span>
                  </div>
                </div>

                <div className="invoice-title-block">
                  <div>
                    <div className="invoice-caption">TAX / SALES INVOICE</div>
                    <div className="invoice-number">{selectedSale.invoice_number || "—"}</div>
                  </div>
                  <div className="invoice-date-block">
                    <span>ISSUED</span>
                    <strong>{formatDate(selectedSale.created_at)}</strong>
                  </div>
                </div>

                {(selectedSale.customer_name || selectedSale.customer_phone) && (
                  <div className="customer-block">
                    <div className="section-label">CUSTOMER</div>
                    <div className="customer-details">
                      {selectedSale.customer_name && <strong>{selectedSale.customer_name}</strong>}
                      {selectedSale.customer_phone && <span>{selectedSale.customer_phone}</span>}
                    </div>
                  </div>
                )}

                <div className="items-box">
                  <div className="items-head">
                    <span>MEDICINE</span>
                    <span className="qty-col">QTY</span>
                    <span>RATE</span>
                    <span>AMOUNT</span>
                  </div>
                  <div className="items-body">
                    {selectedSale.items?.map((item, index) => {
                      const amount = item.total ?? (Number(item.unit_price || 0) * Number(item.quantity || 0));
                      return (
                        <div className="invoice-item" key={item.id || index}>
                          <div className="medicine-cell">
                            <strong>{item.medicine_name || "Medicine"}</strong>
                            {(item.batch_no || item.expiry_date) && (
                              <small>
                                {item.batch_no ? `Batch ${item.batch_no}` : ""}
                                {item.batch_no && item.expiry_date ? " • " : ""}
                                {item.expiry_date ? `Exp ${item.expiry_date}` : ""}
                              </small>
                            )}
                          </div>
                          <span className="qty-col">{item.quantity || 0}</span>
                          <span>{money(item.unit_price)}</span>
                          <strong>{money(amount)}</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="totals-layout">
                  <div className="payment-note">
                    <div className="payment-note-icon">{selectedIsPaid ? "✓" : "!"}</div>
                    <div>
                      <strong>{selectedIsPaid ? "Payment received" : "Payment pending"}</strong>
                      <span>{selectedPayment}{isOnlinePayment(selectedSale.payment_method) ? " • Online payment" : ""}</span>
                    </div>
                  </div>
                  <div className="totals-box">
                    <div><span>Subtotal</span><strong>{money(selectedSale.subtotal)}</strong></div>
                    <div><span>Discount</span><strong>{money(selectedSale.discount)}</strong></div>
                    <div className="grand-total"><span>Grand Total</span><strong>{money(selectedSale.total)}</strong></div>
                    <div><span>Amount Paid</span><strong>{money(selectedSale.amount_paid)}</strong></div>
                    <div className="balance-row"><span>Balance</span><strong>{money(selectedSale.balance)}</strong></div>
                  </div>
                </div>

                {String(selectedSale.payment_method || "").toLowerCase() === "razorpay" && (
                  <div className="razorpay-proof">
                    <div className="rp-icon">↗</div>
                    <div>
                      <strong>Razorpay payment verified</strong>
                      <span>Payment captured successfully • {money(selectedSale.amount_paid)}</span>
                    </div>
                    <div className="rp-badge">SECURE</div>
                  </div>
                )}

                <div className="invoice-footer">
                  <div>
                    <strong>Thank you for choosing DHIMAN MEDICOS.</strong>
                    <span>Please keep this invoice for your records.</span>
                  </div>
                  <div className="footer-right">GET WELL SOON ♥</div>
                </div>
              </div>
            </div>

            <div className="receipt-actions">
              <button onClick={printReceipt} className="action-print">🖨 Print</button>
              <button onClick={downloadPDF} className="action-pdf" disabled={busy}>{busy ? "Creating…" : "↓ Download PDF"}</button>
              <button onClick={() => setSelectedSale(null)} className="action-close">Close</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        * { box-sizing: border-box; }
        .sales-page { min-height: 100vh; color: #17211d; }
        .sales-header { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; }
        .sales-eyebrow { font-size:11px; font-weight:900; letter-spacing:1.8px; color:#087f5b; margin-bottom:6px; }
        .sales-header h1 { margin:0; font-size:32px; line-height:1.1; font-weight:900; letter-spacing:-.8px; }
        .sales-header p { margin:7px 0 0; color:#6b7772; font-size:14px; }
        .sales-header-actions { display:flex; gap:10px; }
        .primary-btn,.secondary-btn,.view-btn { border:0; cursor:pointer; text-decoration:none; font-weight:800; border-radius:11px; padding:11px 15px; }
        .primary-btn { background:#075f46; color:#fff; }
        .secondary-btn { background:#eef3f1; color:#1c3028; }
        .secondary-btn:disabled { opacity:.55; cursor:not-allowed; }
        .state-card { margin-top:25px; border:1px solid #e0e8e4; border-radius:18px; background:#fff; padding:45px 20px; text-align:center; box-shadow:0 8px 28px rgba(22,43,34,.06); }
        .state-card h2 { margin:8px 0 0; font-size:20px; }
        .state-card p { margin:6px 0 0; color:#71807a; }
        .error-state { color:#9b1c1c; background:#fff8f8; border-color:#f0cccc; }
        .empty-icon { font-size:35px; }
        .sales-list { display:grid; gap:12px; }
        .sale-card { display:flex; align-items:center; justify-content:space-between; gap:18px; padding:18px; border:1px solid #e1e8e5; border-radius:18px; background:#fff; box-shadow:0 8px 25px rgba(22,43,34,.05); }
        .sale-card-main { display:flex; align-items:center; min-width:0; gap:14px; }
        .invoice-mini-icon { width:46px; height:46px; flex:0 0 46px; display:grid; place-items:center; border-radius:13px; background:#eaf6f1; font-size:20px; }
        .sale-info { min-width:0; }
        .sale-invoice-number { font-size:16px; font-weight:900; }
        .sale-date { margin-top:3px; color:#69756f; font-size:12px; }
        .sale-meta { display:flex; gap:7px; margin-top:7px; color:#53615b; font-size:11px; font-weight:700; }
        .sale-card-right { display:flex; align-items:center; gap:12px; flex-shrink:0; }
        .sale-total { font-size:21px; font-weight:900; }
        .paid-pill { border-radius:999px; padding:6px 9px; font-size:9px; font-weight:900; letter-spacing:.7px; }
        .paid-pill.paid { background:#e6f7ef; color:#087f5b; }
        .paid-pill.due { background:#fff2df; color:#a45c00; }
        .view-btn { background:#075f46; color:#fff; }

        .invoice-overlay { position:fixed; inset:0; z-index:50; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(11,22,18,.62); backdrop-filter:blur(5px); }
        .invoice-shell { width:min(100%,960px); max-height:94vh; display:flex; flex-direction:column; overflow:hidden; background:#f4f7f5; border:1px solid rgba(255,255,255,.45); border-radius:22px; box-shadow:0 35px 100px rgba(0,0,0,.32); }
        .invoice-toolbar { display:flex; align-items:center; justify-content:space-between; gap:15px; padding:17px 20px; background:#fff; border-bottom:1px solid #e2e9e5; }
        .toolbar-title { font-size:17px; font-weight:900; }
        .toolbar-subtitle { margin-top:3px; font-size:11px; color:#738079; }
        .close-btn { width:38px; height:38px; border:0; border-radius:12px; background:#eef2f0; color:#25342e; font-size:25px; cursor:pointer; line-height:1; }
        .paper-selector-row { padding:10px 14px; background:#fff; border-bottom:1px solid #e2e9e5; overflow-x:auto; }
        .format-tabs { display:flex; gap:7px; min-width:max-content; }
        .format-tab { border:1px solid #dce5e1; background:#f8faf9; color:#53615b; border-radius:9px; padding:8px 11px; font-size:11px; font-weight:800; cursor:pointer; }
        .format-tab.active { background:#075f46; border-color:#075f46; color:#fff; }
        .invoice-scroll { overflow:auto; padding:24px; }
        .invoice-paper { width:760px; max-width:100%; margin:0 auto; background:#fff; color:#17211d; box-shadow:0 15px 45px rgba(25,45,36,.14); padding:30px; }
        .paper-58 { width:219px; padding:13px; font-size:10px; }
        .paper-80 { width:302px; padding:16px; font-size:10.5px; }
        .paper-a4 { width:794px; padding:38px; font-size:13px; }
        .invoice-brand-row { display:flex; align-items:flex-start; gap:11px; padding-bottom:18px; border-bottom:2px solid #075f46; }
        .brand-mark { width:46px; height:46px; flex:0 0 46px; display:grid; place-items:center; border-radius:12px; background:#075f46; color:#fff; font-size:15px; font-weight:950; letter-spacing:-.5px; }
        .brand-copy { min-width:0; flex:1; }
        .brand-name { font-size:21px; line-height:1.05; font-weight:950; letter-spacing:.3px; }
        .brand-tagline { margin-top:3px; font-size:8px; letter-spacing:1.4px; color:#087f5b; font-weight:900; }
        .brand-address { margin-top:4px; color:#68756f; font-size:9px; }
        .brand-license {font-size: 9px;font-weight: 600;margin-top: 3px;color: #475569;}
        .invoice-status { min-width:72px; padding:7px 8px; text-align:center; border-radius:9px; }
        .invoice-status.paid { background:#e8f7f0; color:#087f5b; }
        .invoice-status.due { background:#fff1dd; color:#9a5a08; }
        .invoice-status strong,.invoice-status span { display:block; }
        .invoice-status strong { font-size:10px; letter-spacing:.6px; }
        .invoice-status span { margin-top:2px; font-size:7px; font-weight:800; }
        .invoice-title-block { display:flex; justify-content:space-between; gap:15px; align-items:flex-end; padding:18px 0 14px; }
        .invoice-caption,.section-label { font-size:8px; letter-spacing:1.4px; color:#718079; font-weight:900; }
        .invoice-number { margin-top:3px; font-size:17px; font-weight:950; }
        .invoice-date-block { text-align:right; }
        .invoice-date-block span,.invoice-date-block strong { display:block; }
        .invoice-date-block span { font-size:7px; color:#718079; letter-spacing:1px; font-weight:900; }
        .invoice-date-block strong { margin-top:3px; font-size:9px; }
        .customer-block { margin-bottom:14px; padding:9px 11px; border-radius:9px; background:#f5f8f6; }
        .customer-details { display:flex; gap:9px; flex-wrap:wrap; margin-top:4px; font-size:10px; }
        .customer-details span { color:#69766f; }
        .items-box { overflow:hidden; border:1px solid #dfe7e3; border-radius:10px; }
        .items-head,.invoice-item { display:grid; grid-template-columns:minmax(0,1fr) 42px 67px 72px; gap:6px; align-items:center; }
        .items-head { padding:9px 10px; background:#f1f6f3; color:#69766f; font-size:7px; letter-spacing:1px; font-weight:950; }
        .invoice-item { padding:9px 10px; border-top:1px solid #edf1ef; font-size:9px; }
        .invoice-item > span,.invoice-item > strong { text-align:right; }
        .items-head > .qty-col,.invoice-item > .qty-col { text-align:center; font-weight:800; }
        .medicine-cell { min-width:0; }
        .medicine-cell strong { display:block; font-size:9px; line-height:1.2; overflow-wrap:anywhere; }
        .medicine-cell small { display:block; margin-top:3px; color:#77847e; font-size:6.8px; line-height:1.2; }
        .totals-layout { display:grid; grid-template-columns:minmax(0,1fr) 240px; gap:20px; align-items:start; margin-top:16px; }
        .payment-note { display:flex; align-items:center; gap:8px; padding:10px; border:1px solid #dfe8e3; border-radius:9px; background:#fbfdfc; }
        .payment-note-icon { width:25px; height:25px; display:grid; place-items:center; border-radius:50%; background:#e6f7ef; color:#087f5b; font-weight:950; }
        .payment-note strong,.payment-note span { display:block; }
        .payment-note strong { font-size:9px; }
        .payment-note span { margin-top:2px; color:#748079; font-size:7px; }
        .totals-box { display:grid; gap:6px; font-size:9px; }
        .totals-box > div { display:flex; justify-content:space-between; gap:10px; }
        .grand-total { margin-top:3px; padding:10px 0; border-top:1px solid #17211d; border-bottom:1px solid #17211d; font-size:13px; }
        .balance-row { color:#087f5b; }
        .razorpay-proof { display:flex; align-items:center; gap:9px; margin-top:14px; padding:10px; border:1px solid #cfe9de; border-radius:9px; background:#f1fbf6; }
        .rp-icon { width:27px; height:27px; display:grid; place-items:center; border-radius:50%; background:#087f5b; color:#fff; font-weight:900; }
        .razorpay-proof > div:nth-child(2) { flex:1; }
        .razorpay-proof strong,.razorpay-proof span { display:block; }
        .razorpay-proof strong { font-size:9px; color:#075f46; }
        .razorpay-proof span { margin-top:2px; color:#66756e; font-size:7px; }
        .rp-badge { font-size:6px; letter-spacing:.8px; font-weight:900; color:#087f5b; }
        .invoice-footer { display:flex; justify-content:space-between; gap:15px; margin-top:20px; padding-top:13px; border-top:1px dashed #cfd9d4; color:#68756f; }
        .invoice-footer strong,.invoice-footer span { display:block; }
        .invoice-footer strong { font-size:8px; color:#34443d; }
        .invoice-footer span { margin-top:3px; font-size:7px; }
        .footer-right { align-self:flex-end; color:#087f5b; font-size:7px; font-weight:950; letter-spacing:1px; white-space:nowrap; }
        .receipt-actions { display:flex; gap:9px; padding:13px 16px; background:#fff; border-top:1px solid #e2e9e5; }
        .receipt-actions button { flex:1; border:0; border-radius:10px; padding:12px 13px; font-size:12px; font-weight:900; cursor:pointer; }
        .action-print { background:#075f46; color:#fff; }
        .action-pdf { background:#eaf1ee; color:#17382d; }
        .action-pdf:disabled { opacity:.55; cursor:not-allowed; }
        .action-close { background:#f1f3f2; color:#4d5954; }

        .paper-58 .invoice-brand-row { gap:6px; padding-bottom:9px; }
        .paper-58 .brand-mark { width:29px; height:29px; flex-basis:29px; border-radius:7px; font-size:9px; }
        .paper-58 .brand-name { font-size:11px; }
        .paper-58 .brand-tagline { font-size:4.5px; letter-spacing:.8px; }
        .paper-58 .brand-address { font-size:5.5px; }
        .paper-58 .brand-license { font-size:5.2px; }
        .paper-58 .invoice-status { min-width:42px; padding:4px; border-radius:5px; }
        .paper-58 .invoice-status strong { font-size:6px; }
        .paper-58 .invoice-status span { font-size:4.5px; }
        .paper-58 .invoice-title-block { padding:9px 0 7px; }
        .paper-58 .invoice-caption,.paper-58 .section-label { font-size:5px; letter-spacing:.7px; }
        .paper-58 .invoice-number { font-size:9px; }
        .paper-58 .invoice-date-block span { font-size:4.5px; }
        .paper-58 .invoice-date-block strong { font-size:5.5px; }
        .paper-58 .items-head,.paper-58 .invoice-item { grid-template-columns:minmax(0,1fr) 24px 43px 48px; gap:3px; }
        .paper-58 .items-head { padding:6px 5px; font-size:4.5px; }
        .paper-58 .invoice-item { padding:6px 5px; font-size:6.5px; }
        .paper-58 .qty-col { font-size:7px; }
        .paper-58 .medicine-cell strong { font-size:6.5px; }
        .paper-58 .medicine-cell small { font-size:4.7px; }
        .paper-58 .totals-layout { grid-template-columns:1fr; gap:8px; margin-top:9px; }
        .paper-58 .payment-note { padding:6px; }
        .paper-58 .payment-note-icon { width:17px; height:17px; }
        .paper-58 .payment-note strong { font-size:6px; }
        .paper-58 .payment-note span { font-size:4.8px; }
        .paper-58 .totals-box { font-size:6px; }
        .paper-58 .grand-total { padding:7px 0; font-size:9px; }
        .paper-58 .razorpay-proof { padding:6px; }
        .paper-58 .rp-icon { width:17px; height:17px; }
        .paper-58 .razorpay-proof strong { font-size:6px; }
        .paper-58 .razorpay-proof span { font-size:4.6px; }
        .paper-58 .rp-badge { font-size:4px; }
        .paper-58 .invoice-footer { margin-top:10px; padding-top:7px; }
        .paper-58 .invoice-footer strong { font-size:5.3px; }
        .paper-58 .invoice-footer span,.paper-58 .footer-right { font-size:4.5px; }

        .paper-80 .invoice-brand-row { padding-bottom:12px; }
        .paper-80 .brand-mark { width:34px; height:34px; flex-basis:34px; border-radius:8px; font-size:11px; }
        .paper-80 .brand-name { font-size:14px; }
        .paper-80 .brand-tagline { font-size:5.5px; }
        .paper-80 .brand-address { font-size:6.5px; }
        .paper-80 .brand-license { font-size:6.2px; }
        .paper-80 .invoice-status { min-width:52px; padding:5px; }
        .paper-80 .invoice-status strong { font-size:7px; }
        .paper-80 .invoice-status span { font-size:5px; }
        .paper-80 .invoice-title-block { padding:12px 0 10px; }
        .paper-80 .invoice-caption,.paper-80 .section-label { font-size:6px; }
        .paper-80 .invoice-number { font-size:12px; }
        .paper-80 .invoice-date-block span { font-size:5.5px; }
        .paper-80 .invoice-date-block strong { font-size:7px; }
        .paper-80 .items-head,.paper-80 .invoice-item { grid-template-columns:minmax(0,1fr) 30px 52px 57px; gap:4px; }
        .paper-80 .items-head { padding:7px; font-size:5.5px; }
        .paper-80 .invoice-item { padding:7px; font-size:7.5px; }
        .paper-80 .qty-col { font-size:8px; }
        .paper-80 .medicine-cell strong { font-size:7.5px; }
        .paper-80 .medicine-cell small { font-size:5.5px; }
        .paper-80 .totals-layout { grid-template-columns:1fr; gap:9px; margin-top:11px; }
        .paper-80 .payment-note { padding:7px; }
        .paper-80 .payment-note-icon { width:19px; height:19px; }
        .paper-80 .payment-note strong { font-size:7px; }
        .paper-80 .payment-note span { font-size:5.5px; }
        .paper-80 .totals-box { font-size:7px; }
        .paper-80 .grand-total { padding:8px 0; font-size:10px; }
        .paper-80 .razorpay-proof { padding:7px; }
        .paper-80 .rp-icon { width:20px; height:20px; }
        .paper-80 .razorpay-proof strong { font-size:7px; }
        .paper-80 .razorpay-proof span { font-size:5.5px; }
        .paper-80 .rp-badge { font-size:4.5px; }
        .paper-80 .invoice-footer { margin-top:12px; padding-top:8px; }
        .paper-80 .invoice-footer strong { font-size:6px; }
        .paper-80 .invoice-footer span,.paper-80 .footer-right { font-size:5px; }

        .paper-a4 .brand-name { font-size:27px; }
        .paper-a4 .brand-mark { width:60px; height:60px; flex-basis:60px; font-size:19px; }
        .paper-a4 .brand-tagline { font-size:10px; }
        .paper-a4 .brand-address { font-size:11px; }
        .paper-a4 .brand-license { font-size:11px; }
        .paper-a4 .invoice-status { min-width:100px; padding:10px; }
        .paper-a4 .invoice-status strong { font-size:13px; }
        .paper-a4 .invoice-status span { font-size:9px; }
        .paper-a4 .invoice-caption,.paper-a4 .section-label { font-size:10px; }
        .paper-a4 .invoice-number { font-size:24px; }
        .paper-a4 .invoice-date-block span { font-size:9px; }
        .paper-a4 .invoice-date-block strong { font-size:11px; }
        .paper-a4 .items-head,.paper-a4 .invoice-item { grid-template-columns:minmax(0,1fr) 65px 105px 115px; gap:10px; }
        .paper-a4 .items-head { padding:12px; font-size:9px; }
        .paper-a4 .invoice-item { padding:12px; font-size:12px; }
        .paper-a4 .qty-col { font-size:13px; }
        .paper-a4 .medicine-cell strong { font-size:12px; }
        .paper-a4 .medicine-cell small { font-size:9px; }
        .paper-a4 .totals-layout { grid-template-columns:minmax(0,1fr) 300px; margin-top:22px; }
        .paper-a4 .payment-note { padding:12px; }
        .paper-a4 .payment-note-icon { width:30px; height:30px; }
        .paper-a4 .payment-note strong { font-size:11px; }
        .paper-a4 .payment-note span { font-size:9px; }
        .paper-a4 .totals-box { font-size:12px; }
        .paper-a4 .grand-total { padding:14px 0; font-size:18px; }
        .paper-a4 .razorpay-proof { padding:12px; }
        .paper-a4 .rp-icon { width:32px; height:32px; }
        .paper-a4 .razorpay-proof strong { font-size:11px; }
        .paper-a4 .razorpay-proof span { font-size:9px; }
        .paper-a4 .rp-badge { font-size:8px; }
        .paper-a4 .invoice-footer { margin-top:28px; padding-top:16px; }
        .paper-a4 .invoice-footer strong { font-size:10px; }
        .paper-a4 .invoice-footer span,.paper-a4 .footer-right { font-size:9px; }

        @media (max-width:700px) {
          .sales-header { align-items:flex-start; flex-direction:column; }
          .sales-header-actions { width:100%; }
          .sales-header-actions > * { flex:1; text-align:center; }
          .sales-header h1 { font-size:27px; }
          .sale-card { align-items:flex-start; flex-direction:column; }
          .sale-card-right { width:100%; flex-wrap:wrap; }
          .sale-total { margin-right:auto; }
          .invoice-overlay { padding:0; align-items:stretch; }
          .invoice-shell { width:100%; max-height:100vh; border-radius:0; }
          .invoice-scroll { padding:14px; }
          .invoice-paper { box-shadow:0 8px 25px rgba(25,45,36,.12); }
          .receipt-actions { padding-bottom:calc(13px + env(safe-area-inset-bottom)); }
        }

        @media print {
          html.printing-invoice-58 @page { size:58mm auto; margin:0; }
          html.printing-invoice-80 @page { size:80mm auto; margin:0; }
          html.printing-invoice-a4 @page { size:A4 portrait; margin:0; }
          html.printing-invoice-58 body,html.printing-invoice-80 body,html.printing-invoice-a4 body { background:#fff !important; }
          html.printing-invoice-58 body *,html.printing-invoice-80 body *,html.printing-invoice-a4 body * { visibility:hidden !important; }
          html.printing-invoice-58 .print-area,html.printing-invoice-58 .print-area *,html.printing-invoice-80 .print-area,html.printing-invoice-80 .print-area *,html.printing-invoice-a4 .print-area,html.printing-invoice-a4 .print-area * { visibility:visible !important; }
          html.printing-invoice-58 .invoice-overlay,html.printing-invoice-80 .invoice-overlay,html.printing-invoice-a4 .invoice-overlay { position:absolute !important; inset:0 !important; display:block !important; padding:0 !important; background:#fff !important; }
          html.printing-invoice-58 .invoice-shell,html.printing-invoice-80 .invoice-shell,html.printing-invoice-a4 .invoice-shell { width:auto !important; max-height:none !important; display:block !important; overflow:visible !important; background:#fff !important; border:0 !important; border-radius:0 !important; box-shadow:none !important; }
          html.printing-invoice-58 .invoice-toolbar,html.printing-invoice-58 .paper-selector-row,html.printing-invoice-58 .receipt-actions,html.printing-invoice-80 .invoice-toolbar,html.printing-invoice-80 .paper-selector-row,html.printing-invoice-80 .receipt-actions,html.printing-invoice-a4 .invoice-toolbar,html.printing-invoice-a4 .paper-selector-row,html.printing-invoice-a4 .receipt-actions { display:none !important; }
          html.printing-invoice-58 .invoice-scroll,html.printing-invoice-80 .invoice-scroll,html.printing-invoice-a4 .invoice-scroll { padding:0 !important; overflow:visible !important; }
          html.printing-invoice-58 .print-area { width:58mm !important; max-width:none !important; margin:0 !important; padding:3mm !important; box-shadow:none !important; }
          html.printing-invoice-80 .print-area { width:80mm !important; max-width:none !important; margin:0 !important; padding:4mm !important; box-shadow:none !important; }
          html.printing-invoice-a4 .print-area { width:210mm !important; max-width:none !important; margin:0 !important; padding:12mm !important; box-shadow:none !important; }
          html.printing-invoice-58 .paper-a4,html.printing-invoice-80 .paper-a4 { display:none !important; }
          html.printing-invoice-a4 .paper-58,html.printing-invoice-a4 .paper-80 { display:none !important; }
          html.printing-invoice-58 .paper-80,html.printing-invoice-58 .paper-a4 { display:none !important; }
          html.printing-invoice-80 .paper-58,html.printing-invoice-80 .paper-a4 { display:none !important; }
          html.printing-invoice-a4 .paper-58,html.printing-invoice-a4 .paper-80 { display:none !important; }
          html.printing-invoice-58 .invoice-paper.paper-58,html.printing-invoice-80 .invoice-paper.paper-80,html.printing-invoice-a4 .invoice-paper.paper-a4 { display:block !important; }
          html.printing-invoice-58 .invoice-item,html.printing-invoice-80 .invoice-item,html.printing-invoice-a4 .invoice-item { break-inside:avoid; page-break-inside:avoid; }
          html.printing-invoice-58 .items-box,html.printing-invoice-80 .items-box,html.printing-invoice-a4 .items-box { overflow:visible !important; }
        }
      `}</style>
    </>
  );
}
