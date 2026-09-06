use client";

import { useEffect, useState } from "react";

export default function DiscountAdminPage() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  useEffect(() => {
    fetch("/api/admin/discounts", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || "Unable to load discounts.");
        setRows(d.offers || []);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function save(row) {
    setSaving(row.medicine_id);
    setMessage("");
    setError("");

    try {
      const r = await fetch("/api/admin/discounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });

      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || "Unable to save.");

      setRows((old) =>
        old.map((x) => (x.medicine_id === row.medicine_id ? d.offer : x))
      );
      setMessage(`${row.medicine_id} saved.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving("");
    }
  }

  const shown = rows.filter((row) =>
    row.medicine_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main style={s.page}>
      <div style={s.shell}>
        <div style={s.kicker}>DHIMAN MEDICOS · ADMIN</div>
        <h1>Generic Discounts</h1>
        <p style={s.muted}>
          Only medicines explicitly marked as generic can receive product discounts.
        </p>

        <div style={s.notice}>
          <strong>WELCOME50</strong> — ₹50 OFF on orders of ₹499+, first order only.
        </div>

        <input
          style={s.input}
          placeholder="Search medicine ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {message && <div style={s.success}>{message}</div>}
        {error && <div style={s.error}>{error}</div>}

        <div style={s.list}>
          {shown.map((row) => (
            <article key={row.medicine_id} style={s.card}>
              <strong>{row.medicine_id}</strong>

              <label>
                <input
                  type="checkbox"
                  checked={Boolean(row.is_generic)}
                  onChange={(e) =>
                    setRows((old) =>
                      old.map((x) =>
                        x.medicine_id === row.medicine_id
                          ? { ...x, is_generic: e.target.checked }
                          : x
                      )
                    )
                  }
                />
                Generic — discount eligible
              </label>

              <div style={s.grid}>
                <select
                  style={s.input}
                  value={row.discount_type || "percent"}
                  disabled={!row.is_generic}
                  onChange={(e) =>
                    setRows((old) =>
                      old.map((x) =>
                        x.medicine_id === row.medicine_id
                          ? { ...x, discount_type: e.target.value }
                          : x
                      )
                    )
                  }
                >
                  <option value="percent">Percentage</option>
                  <option value="flat">Flat ₹</option>
                </select>

                <input
                  style={s.input}
                  type="number"
                  min="0"
                  max={row.discount_type === "percent" ? 100 : undefined}
                  disabled={!row.is_generic}
                  value={row.discount_value ?? 0}
                  onChange={(e) =>
                    setRows((old) =>
                      old.map((x) =>
                        x.medicine_id === row.medicine_id
                          ? { ...x, discount_value: Number(e.target.value) }
                          : x
                      )
                    )
                  }
                />

                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(row.active)}
                    disabled={!row.is_generic}
                    onChange={(e) =>
                      setRows((old) =>
                        old.map((x) =>
                          x.medicine_id === row.medicine_id
                            ? { ...x, active: e.target.checked }
                            : x
                        )
                      )
                    }
                  />
                  Active
                </label>

                <button
                  style={s.save}
                  disabled={saving === row.medicine_id}
                  onClick={() => save(row)}
                >
                  {saving === row.medicine_id ? "Saving…" : "Save"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#f4f7f5", padding: 20, fontFamily: "system-ui,sans-serif" },
  shell: { maxWidth: 1000, margin: "0 auto" },
  kicker: { fontSize: 11, fontWeight: 900, letterSpacing: 2, color: "#087f5b" },
  muted: { color: "#68766e" },
  notice: { background: "#edf8f1", border: "1px solid #cfe5d8", padding: 14, borderRadius: 12, margin: "14px 0" },
  success: { background: "#edf8f1", padding: 12, borderRadius: 10, margin: "10px 0", color: "#16633f" },
  error: { background: "#fff0ee", padding: 12, borderRadius: 10, margin: "10px 0", color: "#963930" },
  input: { width: "100%", boxSizing: "border-box", padding: 11, border: "1px solid #d7e1dc", borderRadius: 10, background: "#fff", marginBottom: 8 },
  list: { display: "grid", gap: 10, marginTop: 16 },
  card: { background: "#fff", border: "1px solid #dfe8e2", borderRadius: 15, padding: 14 },
  grid: { display: "grid", gridTemplateColumns: "150px 120px 130px 90px", gap: 8, alignItems: "center", marginTop: 10 },
  save: { padding: 10, border: 0, borderRadius: 10, background: "#087f5b", color: "#fff", fontWeight: 900 },
};
