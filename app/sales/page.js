"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const STORE = {
  name: "DHIMAN MEDICOS",
  address: "HOSHIARPUR, PUNJAB - 144523",
  contact: "9478509980",
  email: "DHIMANMEDICOS@PROTON.ME",
  drugLic: "179327, 179328",
  pos: "03 - PUNJAB",
  remarks: "Good once sold will not be taken back",
};

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const text = (value, fallback = "-") => {
  const s = String(value ?? "").trim();
  return s || fallback;
};

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatExpiry(value) {
  const raw = text(value, "");
  if (!raw) return "-";

  // Preserve the pharmacy's stored MM/YY or DD-MM-YY display when present.
  if (/^\d{2}\/\d{2}$/.test(raw)) return raw;
  if (/^\d{2}-\d{2}-\d{2}$/.test(raw)) return raw;

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("en-IN", {
      month: "2-digit",
      year: "2-digit",
    });
  }

  return raw;
}

function getLineRate(item) {
  return num(
    item.unit_price ??
      item.rate ??
      item.selling_price ??
      item.price ??
      item.mrp
  );
}

function getLineMrp(item) {
  return num(item.mrp ?? item.max_retail_price ?? item.price);
}

function getLineAmount(item) {
  const qty = num(item.quantity);
  return num(
    item.line_total ??
      item.total ??
      qty * getLineRate(item)
  );
}

function getDiscountPercent(item) {
  const explicit = item.discount_percent ?? item.dis_percent;

  if (explicit !== undefined && explicit !== null && explicit !== "") {
    return num(explicit);
  }

  const mrp = getLineMrp(item);
  const rate = getLineRate(item);

  if (mrp > 0 && rate < mrp) {
    return ((mrp - rate) / mrp) * 100;
  }

  return 0;
}

function getOriginalMrp(item) {
  return num(item.omrp ?? item.original_mrp ?? item.originalMrp);
}

function invoiceRow(item, index) {
  const qty = num(item.quantity);
  const mrp = getLineMrp(item);
  const rate = getLineRate(item);
  const explicitOmrp = getOriginalMrp(item);

  return {
    sr: index + 1,
    description: text(item.medicine_name ?? item.name),
    pack: text(item.pack ?? item.pack_size ?? item.packaging),
    comp: text(item.company ?? item.manufacturer ?? item.comp),
    sch: text(item.schedule ?? item.sch),
    rack: text(item.rack),
    hsn: text(item.hsn ?? item.hsn_code),
    batch: text(
      item.batch_no ??
        item.batch_number ??
        item.batch ??
        item.batchNo
    ),
    exp: formatExpiry(
      item.expiry_date ??
        item.expiry ??
        item.exp
    ),
    qty,
    omrp: explicitOmrp > 0 ? explicitOmrp : null,
    mrp,
    rate,
    dis: getDiscountPercent(item),
    amt: getLineAmount(item),
  };
}

function InvoiceSheet({ sale }) {
  const rows = (sale?.items || []).map(invoiceRow);

  const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
  const grossMrp = rows.reduce(
    (sum, row) => sum + row.mrp * row.qty,
    0
  );
  const netLines = rows.reduce(
    (sum, row) => sum + row.amt,
    0
  );

  const discountFromSystem = num(sale?.discount);
  const netPayable = num(
    sale?.total,
    Math.max(0, netLines - discountFromSystem)
  );

  // This mirrors the reference invoice's presentation:
  // gross MRP value -> savings -> amount payable.
  const savings = Math.max(
    0,
    grossMrp - netPayable
  );

  const amountPaid = num(sale?.amount_paid);
  const due = Math.max(
    0,
    netPayable - amountPaid
  );

  const customerName = text(
    sale?.customer_name,
    "Walk-in Customer"
  );

  const customerPhone = text(
    sale?.customer_phone
  );

  const customerAddress = text(
    sale?.customer_address ??
      sale?.address ??
      sale?.address_line1
  );

  const patient = text(
    sale?.patient_name ??
      sale?.customer_name,
    customerName
  );

  const doctor = text(
    sale?.doctor
  );

  return (
    <div className="invoice-sheet">
      <div className="invoice-border">
        <div className="invoice-header">
          <div className="invoice-title-box">
            <strong>BILL OF SUPPLY</strong>
          </div>

          <div className="seller-block">
            <h1>{STORE.name}</h1>
            <p>{STORE.address}</p>
            <p>CONTACT&nbsp;&nbsp; {STORE.contact}</p>
            <p>EMAIL ID&nbsp;&nbsp; {STORE.email}</p>
            <p>DRUG LIC&nbsp;&nbsp; {STORE.drugLic}</p>
          </div>

          <div className="invoice-meta">
            <div>
              <strong>
                {text(sale?.invoice_number)}
              </strong>
              <span>
                {new Date(
                  sale?.created_at || Date.now()
                ).toLocaleDateString(
                  "en-IN",
                  {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }
                )}
              </span>
            </div>

            <div className="customer-meta">
              <p>
                <b>PATIENT</b>
                <span>{patient}</span>
              </p>
              <p>
                <b>CUSTOMER</b>
                <span>{customerName}</span>
              </p>
              <p>
                <b>ADDRESS</b>
                <span>{customerAddress}</span>
              </p>
              <p>
                <b>CONTACT</b>
                <span>{customerPhone}</span>
              </p>
              <p>
                <b>DOCTOR</b>
                <span>{doctor}</span>
              </p>
              <p className="pos-line">
                <b>POS</b>
                <span>{STORE.pos}</span>
              </p>
              <p className="due-line">
                <b>DUE RS.</b>
                <span>{due.toFixed(2)}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="invoice-table-wrap">
          <table className="invoice-table">
            <thead>
              <tr>
                <th>#</th>
                <th>DESCRIPTION</th>
                <th>PACK</th>
                <th>COMP</th>
                <th>SCH</th>
                <th>RACK</th>
                <th>HSN</th>
                <th>BATCH</th>
                <th>EXP</th>
                <th>QTY</th>
                <th>OMRP</th>
                <th>MRP</th>
                <th>RATE</th>
                <th>DIS %</th>
                <th>AMT</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={`${row.sr}-${row.batch}-${row.description}`}>
                  <td>{row.sr}</td>
                  <td className="left">{row.description}</td>
                  <td>{row.pack}</td>
                  <td>{row.comp}</td>
                  <td>{row.sch}</td>
                  <td>{row.rack}</td>
                  <td>{row.hsn}</td>
                  <td>{row.batch}</td>
                  <td>{row.exp}</td>
                  <td>{row.qty}</td>
                  <td>
                    {row.omrp === null
                      ? "-"
                      : row.omrp.toFixed(2)}
                  </td>
                  <td>{row.mrp.toFixed(2)}</td>
                  <td>{row.rate.toFixed(2)}</td>
                  <td>{row.dis.toFixed(2)}</td>
                  <td>{row.amt.toFixed(2)}</td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={15}>
                    No line items found.
                  </td>
                </tr>
              )}

              <tr className="blank-space-row">
                <td colSpan={15}></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="invoice-footer">
          <div className="remarks-block">
            <div className="footer-label">
              REMARKS
            </div>
            <p>{STORE.remarks}</p>
            <p>E&amp;OE</p>

            <div className="product-summary">
              <strong>
                PRODUCTS: {rows.length}, TOTAL QTY:{" "}
                {totalQty}
              </strong>
              <span>
                ORIGINAL / DUPLICATE / TRIPLICATE
              </span>
            </div>
          </div>

          <div className="auth-block">
            <div className="auth-box">
              <span>AUTH SIGN</span>
            </div>
          </div>

          <div className="totals-block">
            <div>
              <span>SUBTOTAL</span>
              <strong>
                {grossMrp.toFixed(2)}
              </strong>
            </div>

            <div>
              <span>SAVINGS</span>
              <strong>
                {savings.toFixed(2)}
              </strong>
            </div>

            <div className="to-pay">
              <span>TO PAY</span>
              <strong>
                Rs {netPayable.toFixed(2)}
              </strong>
            </div>

            <div>
              <span>PAID/DUE</span>
              <strong>
                {amountPaid.toFixed(2)}/
                {due.toFixed(2)}
              </strong>
            </div>
          </div>
        </div>

        <div className="invoice-signature-line">
          <span>
            MADE BY ROHIT at{" "}
            {formatDateTime(sale?.created_at)}
          </span>
          <span>
            PAYMENT:{" "}
            {text(
              sale?.payment_method,
              "-"
            ).toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SalesHistoryPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSale, setSelectedSale] =
    useState(null);

  const invoiceRef = useRef(null);

  useEffect(() => {
    loadSales();
  }, []);

  async function loadSales() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        "/api/pos/sales",
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Failed to load sales"
        );
      }

      setSales(data.sales || []);
    } catch (err) {
      console.error(err);
      setError(
        err?.message ||
          "Failed to load sales"
      );
    } finally {
      setLoading(false);
    }
  }

  function openInvoice(sale) {
    setSelectedSale(sale);
  }

  async function downloadPDF() {
    if (
      !invoiceRef.current ||
      !selectedSale
    ) {
      return;
    }

    const canvas = await html2canvas(
      invoiceRef.current,
      {
        scale: 2.5,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      }
    );

    const imgData =
      canvas.toDataURL("image/png");

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth =
      pdf.internal.pageSize.getWidth();
    const pageHeight =
      pdf.internal.pageSize.getHeight();

    const margin = 6;
    const width = pageWidth - margin * 2;
    const height =
      (canvas.height * width) /
      canvas.width;

    // The invoice is designed as one A4 landscape sheet.
    const finalHeight = Math.min(
      height,
      pageHeight - margin * 2
    );

    pdf.addImage(
      imgData,
      "PNG",
      margin,
      margin,
      width,
      finalHeight,
      undefined,
      "FAST"
    );

    pdf.save(
      `${selectedSale.invoice_number || "invoice"}.pdf`
    );
  }

  function printInvoice() {
    window.print();
  }

  return (
    <>
      <main className="sales-page">
        <div className="page-header">
          <div>
            <p className="eyebrow">
              DHIMAN MEDICOS
            </p>
            <h1>Sales History</h1>
            <p className="muted">
              {sales.length} invoice
              {sales.length !== 1
                ? "s"
                : ""}
            </p>
          </div>

          <div className="header-actions">
            <button
              type="button"
              onClick={loadSales}
              disabled={loading}
              className="secondary"
            >
              {loading
                ? "Refreshing…"
                : "↻ Refresh"}
            </button>

            <Link
              href="/"
              className="primary"
            >
              ← Back to POS
            </Link>
          </div>
        </div>

        {loading && (
          <div className="state-card">
            Loading sales…
          </div>
        )}

        {!loading && error && (
          <div className="state-card error">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          sales.length === 0 && (
            <div className="state-card">
              No sales found.
            </div>
          )}

        {!loading &&
          !error &&
          sales.length > 0 && (
            <div className="sales-list">
              {sales.map((sale) => (
                <article
                  key={sale.id}
                  className="sale-card"
                >
                  <div>
                    <p className="invoice-number">
                      {text(
                        sale.invoice_number
                      )}
                    </p>

                    <p className="muted">
                      {formatDateTime(
                        sale.created_at
                      )}
                    </p>

                    <p className="meta">
                      Payment:{" "}
                      <b>
                        {text(
                          sale.payment_method,
                          "-"
                        ).toUpperCase()}
                      </b>
                    </p>

                    <p className="meta">
                      Items:{" "}
                      <b>
                        {sale.items
                          ?.length || 0}
                      </b>
                    </p>
                  </div>

                  <div className="sale-right">
                    <strong className="sale-total">
                      {money(
                        sale.total
                      )}
                    </strong>

                    <span className="muted">
                      Paid{" "}
                      {money(
                        sale.amount_paid
                      )}
                    </span>

                    <span className="muted">
                      Due{" "}
                      {money(
                        Math.max(
                          0,
                          num(
                            sale.total
                          ) -
                            num(
                              sale.amount_paid
                            )
                        )
                      )}
                    </span>

                    <button
                      type="button"
                      className="view-button"
                      onClick={() =>
                        openInvoice(
                          sale
                        )
                      }
                    >
                      🧾 View Invoice
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
      </main>

      {selectedSale && (
        <div
          className="modal-overlay"
          onClick={() =>
            setSelectedSale(null)
          }
          role="dialog"
          aria-modal="true"
          aria-label="Invoice preview"
        >
          <div
            className="modal-shell"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-toolbar">
              <strong>
                {text(
                  selectedSale.invoice_number
                )}
              </strong>

              <div className="toolbar-actions">
                <button
                  type="button"
                  className="print-button"
                  onClick={printInvoice}
                >
                  🖨 Print
                </button>

                <button
                  type="button"
                  className="pdf-button"
                  onClick={downloadPDF}
                >
                  ⬇ PDF
                </button>

                <button
                  type="button"
                  className="close-button"
                  onClick={() =>
                    setSelectedSale(
                      null
                    )
                  }
                >
                  ✕
                </button>
              </div>
            </div>

            <div
              ref={invoiceRef}
              className="invoice-print-area"
            >
              <InvoiceSheet
                sale={selectedSale}
              />
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #f4f3ee;
          color: #111;
          font-family:
            Arial, Helvetica, sans-serif;
        }

        button,
        a {
          font: inherit;
        }

        .sales-page {
          max-width: 1280px;
          margin: 0 auto;
          padding: 24px;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-end;
          margin-bottom: 20px;
        }

        .eyebrow {
          margin: 0 0 5px;
          color: #106746;
          font-weight: 800;
          letter-spacing: 0.12em;
          font-size: 12px;
        }

        .page-header h1 {
          margin: 0;
          font-size: 34px;
        }

        .muted {
          color: #69716c;
          margin: 5px 0 0;
        }

        .header-actions,
        .toolbar-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .primary,
        .secondary,
        .view-button,
        .print-button,
        .pdf-button,
        .close-button {
          border-radius: 10px;
          padding: 10px 14px;
          border: 1px solid #ccd4cf;
          text-decoration: none;
          cursor: pointer;
          font-weight: 800;
        }

        .primary,
        .view-button,
        .print-button,
        .pdf-button {
          background: #106746;
          color: #fff;
          border-color: #106746;
        }

        .secondary,
        .close-button {
          background: #fff;
          color: #163229;
        }

        .close-button {
          font-size: 18px;
          width: 42px;
          height: 42px;
          padding: 0;
        }

        .state-card {
          padding: 32px;
          text-align: center;
          background: #fff;
          border: 1px solid #ddd;
          border-radius: 15px;
        }

        .state-card.error {
          color: #8b2222;
          background: #fff1f0;
        }

        .sales-list {
          display: grid;
          gap: 12px;
        }

        .sale-card {
          background: #fff;
          border: 1px solid #ddd;
          border-radius: 16px;
          padding: 16px;
          display: flex;
          justify-content: space-between;
          gap: 20px;
        }

        .invoice-number {
          margin: 0;
          font-weight: 900;
          font-size: 18px;
        }

        .meta {
          margin: 9px 0 0;
          color: #4f5953;
        }

        .sale-right {
          display: grid;
          justify-items: end;
          gap: 4px;
        }

        .sale-total {
          font-size: 24px;
          color: #106746;
        }

        .view-button {
          margin-top: 8px;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.68);
          padding: 12px;
          display: grid;
          place-items: center;
        }

        .modal-shell {
          width: min(1600px, 100%);
          max-height: 96vh;
          background: #fff;
          border-radius: 14px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 70px rgba(0, 0, 0, 0.28);
        }

        .modal-toolbar {
          padding: 10px 12px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          border-bottom: 1px solid #ddd;
          background: #fafafa;
        }

        .invoice-print-area {
          overflow: auto;
          background: #d8d8d8;
          padding: 18px;
        }

        .invoice-sheet {
          width: 1120px;
          margin: 0 auto;
          background: #fff;
          color: #111;
        }

        .invoice-border {
          border: 1px solid #111;
          background: #fff;
        }

        .invoice-header {
          display: grid;
          grid-template-columns: 15% 48% 37%;
          min-height: 150px;
          border-bottom: 1px solid #111;
        }

        .invoice-title-box {
          border-right: 1px solid #111;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding-top: 13px;
          font-size: 17px;
        }

        .seller-block {
          border-right: 1px solid #111;
          padding: 11px 12px;
          font-size: 11px;
          line-height: 1.5;
        }

        .seller-block h1 {
          font-size: 19px;
          margin: 0 0 5px;
        }

        .seller-block p {
          margin: 3px 0;
        }

        .invoice-meta {
          padding: 10px;
          font-size: 10px;
        }

        .invoice-meta > div:first-child {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          font-size: 14px;
        }

        .customer-meta {
          margin-top: 9px;
        }

        .customer-meta p {
          display: grid;
          grid-template-columns: 80px 1fr;
          gap: 6px;
          margin: 4px 0;
        }

        .customer-meta b {
          font-size: 9px;
        }

        .pos-line span,
        .due-line span {
          font-weight: 800;
        }

        .invoice-table-wrap {
          overflow: hidden;
        }

        .invoice-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 9px;
        }

        .invoice-table th,
        .invoice-table td {
          border-right: 1px solid #111;
          border-bottom: 1px solid #111;
          padding: 5px 3px;
          text-align: center;
          vertical-align: middle;
          line-height: 1.15;
          overflow: hidden;
          word-break: break-word;
        }

        .invoice-table th:last-child,
        .invoice-table td:last-child {
          border-right: 0;
        }

        .invoice-table th {
          font-weight: 900;
          background: #f5f5f5;
          white-space: nowrap;
        }

        .invoice-table .left {
          text-align: left;
        }

        .invoice-table th:nth-child(1),
        .invoice-table td:nth-child(1) { width: 3%; }
        .invoice-table th:nth-child(2),
        .invoice-table td:nth-child(2) { width: 15%; }
        .invoice-table th:nth-child(3),
        .invoice-table td:nth-child(3) { width: 6%; }
        .invoice-table th:nth-child(4),
        .invoice-table td:nth-child(4) { width: 8%; }
        .invoice-table th:nth-child(5),
        .invoice-table td:nth-child(5) { width: 4%; }
        .invoice-table th:nth-child(6),
        .invoice-table td:nth-child(6) { width: 4%; }
        .invoice-table th:nth-child(7),
        .invoice-table td:nth-child(7) { width: 7%; }
        .invoice-table th:nth-child(8),
        .invoice-table td:nth-child(8) { width: 9%; }
        .invoice-table th:nth-child(9),
        .invoice-table td:nth-child(9) { width: 6%; }
        .invoice-table th:nth-child(10),
        .invoice-table td:nth-child(10) { width: 4%; }
        .invoice-table th:nth-child(11),
        .invoice-table td:nth-child(11) { width: 6%; }
        .invoice-table th:nth-child(12),
        .invoice-table td:nth-child(12) { width: 6%; }
        .invoice-table th:nth-child(13),
        .invoice-table td:nth-child(13) { width: 6%; }
        .invoice-table th:nth-child(14),
        .invoice-table td:nth-child(14) { width: 6%; }
        .invoice-table th:nth-child(15),
        .invoice-table td:nth-child(15) { width: 8%; }

        .blank-space-row td {
          height: 240px;
          border-bottom: 0;
        }

        .invoice-footer {
          display: grid;
          grid-template-columns: 62% 10% 28%;
          min-height: 150px;
          border-top: 1px solid #111;
        }

        .remarks-block {
          border-right: 1px solid #111;
          padding: 9px;
          display: flex;
          flex-direction: column;
        }

        .footer-label {
          font-weight: 900;
          font-size: 9px;
          margin-bottom: 6px;
        }

        .remarks-block p {
          margin: 2px 0;
          font-size: 9px;
        }

        .product-summary {
          margin-top: auto;
          display: grid;
          gap: 6px;
          font-size: 9px;
        }

        .auth-block {
          border-right: 1px solid #111;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 7px;
        }

        .auth-box {
          width: 100%;
          min-height: 30px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          font-size: 8px;
          font-weight: 900;
        }

        .totals-block {
          display: grid;
          align-content: start;
          font-size: 10px;
        }

        .totals-block > div {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          padding: 8px 10px;
          border-bottom: 1px solid #111;
        }

        .totals-block > div:last-child {
          border-bottom: 0;
        }

        .totals-block .to-pay {
          font-size: 13px;
          font-weight: 900;
        }

        .invoice-signature-line {
          border-top: 1px solid #111;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 5px 10px;
          font-size: 8px;
        }

        @media (max-width: 800px) {
          .sales-page {
            padding: 14px;
          }

          .page-header,
          .sale-card {
            flex-direction: column;
            align-items: stretch;
          }

          .header-actions {
            flex-wrap: wrap;
          }

          .sale-right {
            justify-items: start;
          }

          .invoice-sheet {
            margin: 0;
          }
        }

        @media print {
          @page {
            size: A4 landscape;
            margin: 0;
          }

          body {
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .invoice-print-area,
          .invoice-print-area * {
            visibility: visible !important;
          }

          .modal-overlay {
            position: static !important;
            inset: auto !important;
            background: white !important;
            padding: 0 !important;
          }

          .modal-shell {
            max-height: none !important;
            width: 100% !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }

          .modal-toolbar {
            display: none !important;
          }

          .invoice-print-area {
            overflow: visible !important;
            padding: 0 !important;
            background: white !important;
          }

          .invoice-sheet {
            width: 100% !important;
            margin: 0 !important;
          }

          .blank-space-row td {
            height: 220px;
          }
        }
      `}</style>
    </>
  );
}
