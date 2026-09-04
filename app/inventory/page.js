"use client";

import { useEffect, useMemo, useState } from "react";
import { CATALOG } from "../../lib/medicines";
import {
  medicineKey,
  getStockStatus,
} from "../../lib/inventory";

export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [movingId, setMovingId] = useState(null);

  // Direct stock quantity used by "Save Stock".
  const [quantities, setQuantities] = useState({});

  // Quantity used by Stock In / Stock Out.
  const [movementQuantities, setMovementQuantities] =
    useState({});

  // Batch/expiry fields used when saving inventory metadata.
  const [batchDetails, setBatchDetails] = useState({});

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  /*
   * Convert existing medicine catalogue into a flat list.
   * The catalogue remains the source for medicine name,
   * MRP and category.
   */
  const medicines = useMemo(() => {
    const map = new Map();

    for (const category of CATALOG || []) {
      for (const item of category.items || []) {
        if (!item?.name) continue;

        const medicineId = medicineKey(item.name);

        if (!map.has(medicineId)) {
          map.set(medicineId, {
            medicineId,
            name: item.name,
            mrp: Number(item.mrp || 0),
            category: category.name || "",
          });
        }
      }
    }

    return Array.from(map.values());
  }, []);

  /*
   * Load inventory from Supabase through our API.
   */
  async function loadInventory(showLoader = true) {
    try {
      if (showLoader) {
        setLoading(true);
      }

      const response = await fetch("/api/inventory", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Failed to load inventory"
        );
      }

      setInventory(result.inventory || []);
    } catch (error) {
      console.error("Inventory load error:", error);

      setMessageType("error");
      setMessage(
        error?.message || "Failed to load inventory"
      );
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadInventory();
  }, []);

  /*
   * Fast medicine_id -> inventory record lookup.
   */
  const inventoryMap = useMemo(() => {
    const map = new Map();

    for (const item of inventory) {
      map.set(String(item.medicine_id), item);
    }

    return map;
  }, [inventory]);

  /*
   * Search existing catalogue.
   */
  const filteredMedicines = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return medicines;
    }

    return medicines.filter((medicine) => {
      return (
        medicine.name.toLowerCase().includes(value) ||
        medicine.category.toLowerCase().includes(value)
      );
    });
  }, [medicines, search]);

  function getInventoryRecord(medicineId) {
    return inventoryMap.get(medicineId);
  }

  function getQuantity(medicineId) {
    const record = getInventoryRecord(medicineId);

    return Number(record?.quantity || 0);
  }

  function getExpiryDate(record) {
    if (!record?.expiry_date) return null;
    const date = new Date(`${record.expiry_date}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysUntil(date) {
    if (!date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((date.getTime() - today.getTime()) / 86400000);
  }

  const inventoryAlerts = useMemo(() => {
    const rows = inventory.map((row) => {
      const expiryDate = getExpiryDate(row);
      const days = daysUntil(expiryDate);

      return {
        ...row,
        expiryDate,
        expiryDays: days,
        isExpired: days !== null && days < 0,
        isExpiring30: days !== null && days >= 0 && days <= 30,
        isExpiring90: days !== null && days >= 0 && days <= 90,
        isLowStock: Number(row.quantity || 0) > 0 &&
          Number(row.quantity || 0) <= Number(row.low_stock_at ?? 5),
        isOutOfStock: Number(row.quantity || 0) === 0,
      };
    });

    return {
      rows,
      outOfStock: rows.filter((row) => row.isOutOfStock),
      lowStock: rows.filter((row) => row.isLowStock),
      expired: rows.filter((row) => row.isExpired),
      expiring30: rows.filter((row) => row.isExpiring30),
      expiring90: rows.filter((row) => row.isExpiring90),
      missingExpiry: rows.filter((row) => !row.expiryDate),
    };
  }, [inventory]);

  function formatExpiry(dateString) {
    if (!dateString) return "Not set";
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "Invalid date";
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function expiryLabel(row) {
    if (row.isExpired) return `Expired ${Math.abs(row.expiryDays)} day(s) ago`;
    if (row.expiryDays === 0) return "Expires today";
    if (row.expiryDays === 1) return "Expires tomorrow";
    if (row.expiryDays !== null && row.expiryDays <= 30) {
      return `${row.expiryDays} day(s) left`;
    }
    if (row.expiryDays !== null && row.expiryDays <= 90) {
      return `${row.expiryDays} day(s) left`;
    }
    return "";
  }

  function showSuccess(text) {
    setMessageType("success");
    setMessage(text);
  }

  function showError(text) {
    setMessageType("error");
    setMessage(text);
  }

  /*
   * Direct stock setting.
   *
   * Keep this because it is useful for:
   * - opening inventory
   * - correcting inventory
   * - initial setup
   *
   * Normal stock movement should use Stock In / Stock Out.
   */
  async function saveStock(medicine) {
    try {
      setMessage("");
      setSavingId(medicine.medicineId);

      const rawQuantity =
        quantities[medicine.medicineId] ??
        getQuantity(medicine.medicineId);

      const quantity = Number(rawQuantity);

      if (!Number.isInteger(quantity) || quantity < 0) {
        throw new Error(
          "Stock quantity must be a whole number of 0 or more"
        );
      }

      const existing = getInventoryRecord(medicine.medicineId);
      const details = batchDetails[medicine.medicineId] || {};

      const batchNo =
        details.batchNo !== undefined
          ? String(details.batchNo).trim()
          : String(existing?.batch_no || "").trim();

      const expiryDate =
        details.expiryDate !== undefined
          ? String(details.expiryDate).trim()
          : String(existing?.expiry_date || "").trim();

      const response = await fetch("/api/inventory", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          medicineId: medicine.medicineId,
          name: medicine.name,
          quantity,
          lowStockAt: 5,
          batchNo: batchNo || null,
          expiryDate: expiryDate || null,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Failed to save stock"
        );
      }

      setQuantities((current) => {
        const copy = { ...current };

        delete copy[medicine.medicineId];

        return copy;
      });

      setBatchDetails((current) => {
        const copy = { ...current };
        delete copy[medicine.medicineId];
        return copy;
      });

      showSuccess(
        `${medicine.name}: stock set to ${quantity}`
      );

      await loadInventory(false);
    } catch (error) {
      console.error("Save stock error:", error);

      showError(
        error?.message || "Failed to save stock"
      );
    } finally {
      setSavingId(null);
    }
  }

  /*
   * Stock In / Stock Out.
   *
   * Stock In uses PURCHASE.
   * Stock Out uses PURCHASE_RETURN for now because it is a
   * manual inventory removal.
   *
   * POS will later use SALE.
   */
  async function moveStock(medicine, direction) {
    try {
      setMessage("");
      setMovingId(
        `${medicine.medicineId}-${direction}`
      );

      const rawQuantity =
        movementQuantities[medicine.medicineId];

      const quantity = Number(rawQuantity);

      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error(
          "Enter a positive whole-number quantity"
        );
      }

      const currentStock = getQuantity(
        medicine.medicineId
      );

      if (
        direction === "out" &&
        quantity > currentStock
      ) {
        throw new Error(
          `Insufficient stock. Available: ${currentStock}`
        );
      }

      const type =
        direction === "in"
          ? "purchase"
          : "purchase_return";

      const note =
        direction === "in"
          ? "Manual stock in"
          : "Manual stock out";

      const response = await fetch(
        "/api/inventory/movement",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            medicineId: medicine.medicineId,
            type,
            quantity,
            note,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
            "Failed to process stock movement"
        );
      }

      setMovementQuantities((current) => {
        const copy = { ...current };

        delete copy[medicine.medicineId];

        return copy;
      });

      if (direction === "in") {
        showSuccess(
          `${medicine.name}: +${quantity} added. Stock is now ${result.quantity}.`
        );
      } else {
        showSuccess(
          `${medicine.name}: -${quantity} removed. Stock is now ${result.quantity}.`
        );
      }

      await loadInventory(false);
    } catch (error) {
      console.error("Stock movement error:", error);

      showError(
        error?.message ||
          "Failed to process stock movement"
      );
    } finally {
      setMovingId(null);
    }
  }

  return (
    <main
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "24px 16px 60px",
      }}
    >
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "28px",
            fontWeight: 800,
          }}
        >
          Inventory Management
        </h1>

        <p
          style={{
            marginTop: "8px",
            opacity: 0.7,
          }}
        >
          Manage medicine stock for Dhiman Medicos.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "10px",
          marginBottom: "18px",
        }}
      >
        {[
          ["Out of stock", inventoryAlerts.outOfStock.length, "#b91c1c"],
          ["Low stock", inventoryAlerts.lowStock.length, "#c2410c"],
          ["Expired", inventoryAlerts.expired.length, "#991b1b"],
          ["Expiring ≤30d", inventoryAlerts.expiring30.length, "#a16207"],
          ["Expiring ≤90d", inventoryAlerts.expiring90.length, "#ca8a04"],
        ].map(([label, value, borderColor]) => (
          <div
            key={label}
            style={{
              border: `1px solid ${borderColor}`,
              borderRadius: "12px",
              padding: "13px",
              background: "rgba(255,255,255,0.75)",
            }}
          >
            <div style={{ fontSize: "12px", opacity: 0.72 }}>{label}</div>
            <div style={{ fontSize: "25px", fontWeight: 800, marginTop: "3px" }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {(inventoryAlerts.expired.length > 0 ||
        inventoryAlerts.expiring30.length > 0 ||
        inventoryAlerts.lowStock.length > 0 ||
        inventoryAlerts.outOfStock.length > 0) && (
        <div
          style={{
            border: "1px solid #f0c36d",
            borderRadius: "14px",
            padding: "15px",
            marginBottom: "18px",
            background: "rgba(255, 248, 220, 0.7)",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: "10px" }}>
            Inventory alerts
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            {inventoryAlerts.expired.slice(0, 5).map((row) => (
              <div key={`expired-${row.medicine_id}`} style={{ fontSize: "14px" }}>
                <strong>🔴 {row.medicine_name}</strong> — expired on {formatExpiry(row.expiry_date)}
                {row.quantity ? ` · ${row.quantity} in stock` : ""}
              </div>
            ))}

            {inventoryAlerts.expiring30
              .filter((row) => !row.isExpired)
              .slice(0, 5)
              .map((row) => (
                <div key={`expiry30-${row.medicine_id}`} style={{ fontSize: "14px" }}>
                  <strong>🟠 {row.medicine_name}</strong> — {expiryLabel(row)}
                  {" · "}expiry {formatExpiry(row.expiry_date)}
                </div>
              ))}

            {inventoryAlerts.outOfStock.slice(0, 5).map((row) => (
              <div key={`out-${row.medicine_id}`} style={{ fontSize: "14px" }}>
                <strong>⚫ {row.medicine_name}</strong> — out of stock
              </div>
            ))}

            {inventoryAlerts.lowStock.slice(0, 5).map((row) => (
              <div key={`low-${row.medicine_id}`} style={{ fontSize: "14px" }}>
                <strong>🟡 {row.medicine_name}</strong> — low stock ({row.quantity} left)
              </div>
            ))}
          </div>
        </div>
      )}

      {inventoryAlerts.missingExpiry.length > 0 && (
        <div
          style={{
            marginBottom: "18px",
            fontSize: "13px",
            opacity: 0.72,
          }}
        >
          {inventoryAlerts.missingExpiry.length} medicine(s) have no expiry date recorded.
          Use “Batch & Expiry” below to complete their inventory data.
        </div>
      )}

      <input
        type="search"
        value={search}
        onChange={(event) =>
          setSearch(event.target.value)
        }
        placeholder="Search medicine or category..."
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "14px 16px",
          borderRadius: "12px",
          border: "1px solid #ccc",
          fontSize: "16px",
          marginBottom: "18px",
        }}
      />

      {message && (
        <div
          style={{
            padding: "13px 14px",
            borderRadius: "10px",
            marginBottom: "18px",

            border:
              messageType === "error"
                ? "1px solid #d33"
                : "1px solid #299c55",

            background:
              messageType === "error"
                ? "rgba(220, 50, 50, 0.08)"
                : "rgba(40, 170, 90, 0.08)",
          }}
        >
          {message}
        </div>
      )}

      {loading ? (
        <p>Loading inventory...</p>
      ) : (
        <>
          <div
            style={{
              marginBottom: "14px",
              fontSize: "14px",
              opacity: 0.7,
            }}
          >
            Showing {filteredMedicines.length} medicines
          </div>

          <div
            style={{
              display: "grid",
              gap: "14px",
            }}
          >
            {filteredMedicines.map((medicine) => {
              const currentStock = getQuantity(
                medicine.medicineId
              );

              const stockInput =
                quantities[medicine.medicineId] ??
                currentStock;

              const movementInput =
                movementQuantities[
                  medicine.medicineId
                ] ?? "";

              const status =
                getStockStatus(currentStock);

              const saving =
                savingId === medicine.medicineId;

              const stockInLoading =
                movingId ===
                `${medicine.medicineId}-in`;

              const stockOutLoading =
                movingId ===
                `${medicine.medicineId}-out`;

              return (
                <div
                  key={medicine.medicineId}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "14px",
                    padding: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: "16px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        flex: "1 1 250px",
                      }}
                    >
                      <strong
                        style={{
                          display: "block",
                          fontSize: "17px",
                        }}
                      >
                        {medicine.name}
                      </strong>

                      <div
                        style={{
                          marginTop: "6px",
                          fontSize: "14px",
                          opacity: 0.7,
                        }}
                      >
                        {medicine.category}
                      </div>

                      <div
                        style={{
                          marginTop: "8px",
                          fontWeight: 700,
                        }}
                      >
                        MRP ₹
                        {medicine.mrp.toFixed(2)}
                      </div>
                    </div>

                    <div
                      style={{
                        minWidth: "130px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "13px",
                          opacity: 0.7,
                        }}
                      >
                        Current Stock
                      </div>

                      <div
                        style={{
                          fontSize: "28px",
                          fontWeight: 800,
                          marginTop: "3px",
                        }}
                      >
                        {currentStock}
                      </div>

                      <div
                        style={{
                          marginTop: "3px",
                          fontSize: "14px",
                          fontWeight: 700,
                        }}
                      >
                        {status}
                      </div>
                    </div>
                  </div>

                  {/* BATCH / EXPIRY */}

                  <details style={{ marginTop: "15px" }}>
                    <summary
                      style={{
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      Batch & Expiry
                    </summary>

                    <div
                      style={{
                        marginTop: "11px",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "10px",
                      }}
                    >
                      <label style={{ fontSize: "13px", fontWeight: 600 }}>
                        Batch No.
                        <input
                          type="text"
                          value={
                            batchDetails[medicine.medicineId]?.batchNo ??
                            getInventoryRecord(medicine.medicineId)?.batch_no ??
                            ""
                          }
                          onChange={(event) =>
                            setBatchDetails((current) => ({
                              ...current,
                              [medicine.medicineId]: {
                                ...(current[medicine.medicineId] || {}),
                                batchNo: event.target.value,
                              },
                            }))
                          }
                          placeholder="e.g. ABC123"
                          style={{
                            display: "block",
                            width: "100%",
                            boxSizing: "border-box",
                            marginTop: "5px",
                            padding: "10px 11px",
                            border: "1px solid #ccc",
                            borderRadius: "9px",
                            fontSize: "15px",
                          }}
                        />
                      </label>

                      <label style={{ fontSize: "13px", fontWeight: 600 }}>
                        Expiry Date
                        <input
                          type="date"
                          value={
                            batchDetails[medicine.medicineId]?.expiryDate ??
                            getInventoryRecord(medicine.medicineId)?.expiry_date ??
                            ""
                          }
                          onChange={(event) =>
                            setBatchDetails((current) => ({
                              ...current,
                              [medicine.medicineId]: {
                                ...(current[medicine.medicineId] || {}),
                                expiryDate: event.target.value,
                              },
                            }))
                          }
                          style={{
                            display: "block",
                            width: "100%",
                            boxSizing: "border-box",
                            marginTop: "5px",
                            padding: "10px 11px",
                            border: "1px solid #ccc",
                            borderRadius: "9px",
                            fontSize: "15px",
                          }}
                        />
                      </label>
                    </div>

                    <div style={{ marginTop: "9px", fontSize: "13px", opacity: 0.75 }}>
                      Current expiry: {formatExpiry(getInventoryRecord(medicine.medicineId)?.expiry_date)}
                    </div>
                  </details>

                  {/* STOCK MOVEMENT */}

                  <div
                    style={{
                      marginTop: "18px",
                      paddingTop: "16px",
                      borderTop:
                        "1px solid #e5e5e5",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        marginBottom: "9px",
                      }}
                    >
                      Stock Movement
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Qty"
                        value={movementInput}
                        onChange={(event) =>
                          setMovementQuantities(
                            (current) => ({
                              ...current,

                              [medicine.medicineId]:
                                event.target.value,
                            })
                          )
                        }
                        style={{
                          width: "90px",
                          boxSizing: "border-box",
                          padding: "11px 10px",
                          border:
                            "1px solid #ccc",
                          borderRadius: "9px",
                          fontSize: "16px",
                        }}
                      />

                      <button
                        type="button"
                        disabled={
                          stockInLoading ||
                          stockOutLoading
                        }
                        onClick={() =>
                          moveStock(
                            medicine,
                            "in"
                          )
                        }
                        style={{
                          padding: "11px 15px",
                          border: 0,
                          borderRadius: "9px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {stockInLoading
                          ? "Adding..."
                          : "+ Stock In"}
                      </button>

                      <button
                        type="button"
                        disabled={
                          stockInLoading ||
                          stockOutLoading ||
                          currentStock === 0
                        }
                        onClick={() =>
                          moveStock(
                            medicine,
                            "out"
                          )
                        }
                        style={{
                          padding: "11px 15px",
                          border: 0,
                          borderRadius: "9px",
                          fontWeight: 700,
                          cursor:
                            currentStock === 0
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        {stockOutLoading
                          ? "Removing..."
                          : "− Stock Out"}
                      </button>
                    </div>
                  </div>

                  {/* DIRECT STOCK CORRECTION */}

                  <details
                    style={{
                      marginTop: "16px",
                    }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Set / Correct Stock
                    </summary>

                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        marginTop: "12px",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={stockInput}
                        onChange={(event) =>
                          setQuantities(
                            (current) => ({
                              ...current,

                              [medicine.medicineId]:
                                event.target.value,
                            })
                          )
                        }
                        style={{
                          width: "120px",
                          padding: "10px 12px",
                          border:
                            "1px solid #ccc",
                          borderRadius: "9px",
                          fontSize: "16px",
                        }}
                      />

                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          saveStock(medicine)
                        }
                        style={{
                          padding: "11px 18px",
                          border: 0,
                          borderRadius: "9px",
                          cursor: saving
                            ? "not-allowed"
                            : "pointer",
                          fontWeight: 700,
                        }}
                      >
                        {saving
                          ? "Saving..."
                          : "Save Stock"}
                      </button>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>

          {filteredMedicines.length === 0 && (
            <p>No medicines found.</p>
          )}
        </>
      )}
    </main>
  );
    }