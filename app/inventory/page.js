"use client";

import { useEffect, useMemo, useState } from "react";
import { CATALOG } from "../../lib/medicines";
import { medicineKey, getStockStatus } from "../../lib/inventory";

const FILTERS = [
  ["all", "All"],
  ["in_stock", "In Stock"],
  ["low_stock", "Low Stock"],
  ["out_of_stock", "Out of Stock"],
  ["expired", "Expired"],
  ["expiring_30", "Expiring ≤30d"],
  ["no_category", "No Category"],
];

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n)
    ? `₹${n.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : "₹0.00";
}

function getExpiryDays(dateString) {
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil(
    (date.getTime() - today.getTime()) / 86400000
  );
}

function formatExpiry(dateString) {
  if (!dateString) return "Not set";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Invalid";
  return date.toLocaleDateString("en-IN", {
    month: "2-digit",
    year: "2-digit",
  });
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [movingId, setMovingId] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const [edit, setEdit] = useState({});
  const [movementQty, setMovementQty] = useState({});

  const medicines = useMemo(() => {
    const map = new Map();

    for (const category of CATALOG || []) {
      for (const item of category?.items || []) {
        if (!item?.name) continue;

        const id = medicineKey(item.name);

        if (!map.has(id)) {
          map.set(id, {
            medicineId: id,
            name: item.name,
            catalogMrp: Number(item.mrp || 0),
            category: category?.name || "",
            prescription: Boolean(item.prescription),
          });
        }
      }
    }

    return [...map.values()];
  }, []);

  async function loadInventory(showLoader = true) {
    try {
      if (showLoader) setLoading(true);

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
      if (showLoader) setLoading(false);
    }
  }

  useEffect(() => {
    loadInventory();
  }, []);

  const inventoryMap = useMemo(() => {
    const map = new Map();

    for (const row of inventory) {
      map.set(String(row.medicine_id), row);
    }

    return map;
  }, [inventory]);

  const rows = useMemo(() => {
    return medicines.map((medicine) => {
      const record =
        inventoryMap.get(medicine.medicineId) || null;

      const quantity = Number(record?.quantity || 0);

      const mrp =
        Number(record?.mrp || 0) > 0
          ? Number(record.mrp)
          : medicine.catalogMrp;

      const purchaseRate = Number(
        record?.purchase_rate ??
          record?.purchase_price ??
          0
      );

      const netRate = Number(
        record?.net_rate ??
          purchaseRate ??
          0
      );

      const saleRate = Number(
        record?.sale_rate ??
          record?.selling_price ??
          mrp ??
          0
      );

      const expiryDays = getExpiryDays(
        record?.expiry_date
      );

      const status = getStockStatus(
        quantity,
        Number(record?.low_stock_at ?? 5)
      );

      return {
        medicine,
        record,
        quantity,
        mrp,
        purchaseRate,
        netRate,
        saleRate,
        expiryDays,
        status,
        isExpired:
          expiryDays !== null && expiryDays < 0,
        isExpiring30:
          expiryDays !== null &&
          expiryDays >= 0 &&
          expiryDays <= 30,
        hasCategory:
          Boolean(
            record?.category ||
              medicine.category
          ),
      };
    });
  }, [medicines, inventoryMap]);

  const stats = useMemo(() => {
    const totalValue = rows.reduce(
      (sum, row) =>
        sum +
        Number(row.netRate || 0) *
          Number(row.quantity || 0),
      0
    );

    return {
      total: rows.length,
      inStock: rows.filter(
        (row) => row.quantity > 0
      ).length,
      lowStock: rows.filter(
        (row) =>
          row.quantity > 0 &&
          row.quantity <=
            Number(
              row.record?.low_stock_at ?? 5
            )
      ).length,
      outOfStock: rows.filter(
        (row) => row.quantity === 0
      ).length,
      expired: rows.filter(
        (row) => row.isExpired
      ).length,
      expiring30: rows.filter(
        (row) => row.isExpiring30
      ).length,
      noCategory: rows.filter(
        (row) => !row.hasCategory
      ).length,
      totalValue,
    };
  }, [rows]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (query) {
        const haystack = [
          row.medicine.name,
          row.medicine.category,
          row.record?.batch_no || "",
          row.record?.medicine_id || "",
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(query)) {
          return false;
        }
      }

      if (filter === "in_stock") {
        return row.quantity > 0;
      }

      if (filter === "low_stock") {
        return (
          row.quantity > 0 &&
          row.quantity <=
            Number(
              row.record?.low_stock_at ?? 5
            )
        );
      }

      if (filter === "out_of_stock") {
        return row.quantity === 0;
      }

      if (filter === "expired") {
        return row.isExpired;
      }

      if (filter === "expiring_30") {
        return row.isExpiring30;
      }

      if (filter === "no_category") {
        return !row.hasCategory;
      }

      return true;
    });
  }, [rows, search, filter]);

  function showSuccess(text) {
    setMessageType("success");
    setMessage(text);
  }

  function showError(text) {
    setMessageType("error");
    setMessage(text);
  }

  function getEditValue(row, key) {
    const record = row.record || {};

    if (edit[row.medicine.medicineId]?.[key] !== undefined) {
      return edit[row.medicine.medicineId][key];
    }

    if (key === "mrp") return row.mrp;
    if (key === "purchasePrice") {
      return record.purchase_price ?? row.purchaseRate;
    }
    if (key === "netRate") {
      return record.net_rate ?? row.netRate;
    }
    if (key === "sellingPrice") {
      return record.selling_price ?? row.saleRate;
    }
    if (key === "quantity") return row.quantity;
    if (key === "batchNo") return record.batch_no ?? "";
    if (key === "expiryDate") {
      return record.expiry_date ?? "";
    }

    return "";
  }

  function setEditValue(
    medicineId,
    key,
    value
  ) {
    setEdit((current) => ({
      ...current,
      [medicineId]: {
        ...(current[medicineId] || {}),
        [key]: value,
      },
    }));
  }

  async function saveInventory(row) {
    const medicineId =
      row.medicine.medicineId;

    try {
      setSavingId(medicineId);
      setMessage("");

      const payload = {
        medicineId,
        name: row.medicine.name,
        quantity: Number(
          getEditValue(
            row,
            "quantity"
          )
        ),
        lowStockAt: Number(
          row.record?.low_stock_at ?? 5
        ),
        mrp: Number(
          getEditValue(row, "mrp")
        ),
        purchasePrice: Number(
          getEditValue(
            row,
            "purchasePrice"
          )
        ),
        netRate: Number(
          getEditValue(row, "netRate")
        ),
        sellingPrice: Number(
          getEditValue(
            row,
            "sellingPrice"
          )
        ),
        batchNo:
          String(
            getEditValue(
              row,
              "batchNo"
            ) || ""
          ).trim() || null,
        expiryDate:
          String(
            getEditValue(
              row,
              "expiryDate"
            ) || ""
          ).trim() || null,
      };

      if (
        !Number.isInteger(payload.quantity) ||
        payload.quantity < 0
      ) {
        throw new Error(
          "Quantity must be a whole number of 0 or more."
        );
      }

      const response = await fetch(
        "/api/inventory",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            payload
          ),
        }
      );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ||
            "Failed to save inventory."
        );
      }

      setEdit((current) => {
        const copy = { ...current };
        delete copy[medicineId];
        return copy;
      });

      showSuccess(
        `${row.medicine.name} updated successfully.`
      );

      await loadInventory(false);
    } catch (error) {
      console.error(
        "Save inventory error:",
        error
      );
      showError(
        error?.message ||
          "Failed to save inventory."
      );
    } finally {
      setSavingId(null);
    }
  }

  async function moveStock(row, direction) {
    const medicineId =
      row.medicine.medicineId;

    const quantity = Number(
      movementQty[medicineId]
    );

    try {
      if (
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        throw new Error(
          "Enter a positive whole-number quantity."
        );
      }

      if (
        direction === "out" &&
        quantity > row.quantity
      ) {
        throw new Error(
          `Insufficient stock. Available: ${row.quantity}.`
        );
      }

      const type =
        direction === "in"
          ? "purchase"
          : "purchase_return";

      setMovingId(
        `${medicineId}-${direction}`
      );

      const response = await fetch(
        "/api/inventory/movement",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            medicineId,
            type,
            quantity,
            note:
              direction === "in"
                ? "Manual stock in"
                : "Manual stock out",
          }),
        }
      );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ||
            "Failed to update stock."
        );
      }

      setMovementQty((current) => ({
        ...current,
        [medicineId]: "",
      }));

      showSuccess(
        `${row.medicine.name}: ${
          direction === "in" ? "+" : "-"
        }${quantity} units. New stock: ${
          result.quantity
        }.`
      );

      await loadInventory(false);
    } catch (error) {
      console.error(
        "Stock movement error:",
        error
      );
      showError(
        error?.message ||
          "Failed to update stock."
      );
    } finally {
      setMovingId(null);
    }
  }

  return (
    <main
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "22px 14px 60px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            View Stocks
          </h1>

          <div
            style={{
              marginTop: 6,
              color: "#555",
              fontSize: 15,
            }}
          >
            {stats.total.toLocaleString("en-IN")} Items
            {" | "}
            {money(stats.totalValue)} Net Stock Value
          </div>
        </div>
      </div>

      {stats.noCategory > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 16px",
            borderRadius: 12,
            marginBottom: 14,
            background: "#fff7ed",
            border: "1px solid #fdba74",
            color: "#9a3412",
          }}
        >
          <div>
            No Category for{" "}
            <strong>
              {stats.noCategory.toLocaleString(
                "en-IN"
              )}
            </strong>{" "}
            Items
          </div>

          <button
            type="button"
            onClick={() => setFilter("no_category")}
            style={{
              border: 0,
              background: "transparent",
              color: "#7c2d12",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            View →
          </button>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(145px, 1fr))",
          gap: 9,
          marginBottom: 14,
        }}
      >
        {[
          ["In Stock", stats.inStock],
          ["Low Stock", stats.lowStock],
          ["Out of Stock", stats.outOfStock],
          ["Expired", stats.expired],
          ["Expiring ≤30d", stats.expiring30],
          ["No Category", stats.noCategory],
        ].map(([label, value]) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              const keyMap = {
                "In Stock": "in_stock",
                "Low Stock": "low_stock",
                "Out of Stock": "out_of_stock",
                Expired: "expired",
                "Expiring ≤30d": "expiring_30",
                "No Category": "no_category",
              };
              setFilter(keyMap[label]);
            }}
            style={{
              textAlign: "left",
              border:
                filter ===
                ({
                  "In Stock": "in_stock",
                  "Low Stock": "low_stock",
                  "Out of Stock": "out_of_stock",
                  Expired: "expired",
                  "Expiring ≤30d": "expiring_30",
                  "No Category": "no_category",
                }[label])
                  ? "2px solid #5b1b73"
                  : "1px solid #ddd",
              borderRadius: 12,
              background: "#fff",
              padding: 12,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "#666",
              }}
            >
              {label}
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              {value.toLocaleString(
                "en-IN"
              )}
            </div>
          </button>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <input
          type="search"
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          placeholder="Search medicine, batch or category..."
          style={{
            flex: "1 1 320px",
            minWidth: 0,
            padding: "13px 15px",
            border:
              "1px solid #ccc",
            borderRadius: 11,
            fontSize: 16,
          }}
        />

        <select
          value={filter}
          onChange={(event) =>
            setFilter(event.target.value)
          }
          style={{
            flex: "0 1 190px",
            padding: "13px 12px",
            border:
              "1px solid #ccc",
            borderRadius: 11,
            background: "#fff",
            fontSize: 15,
          }}
        >
          {FILTERS.map(
            ([value, label]) => (
              <option
                key={value}
                value={value}
              >
                {label}
              </option>
            )
          )}
        </select>
      </div>

      {message && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            marginBottom: 14,
            border:
              messageType === "error"
                ? "1px solid #ef4444"
                : "1px solid #22c55e",
            background:
              messageType === "error"
                ? "#fef2f2"
                : "#f0fdf4",
            color:
              messageType === "error"
                ? "#b91c1c"
                : "#166534",
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
              marginBottom: 10,
              color: "#666",
              fontSize: 13,
            }}
          >
            Showing{" "}
            {visibleRows.length.toLocaleString(
              "en-IN"
            )}{" "}
            of{" "}
            {rows.length.toLocaleString(
              "en-IN"
            )}{" "}
            medicines
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            {visibleRows.map((row) => {
              const medicineId =
                row.medicine.medicineId;

              const saving =
                savingId === medicineId;

              const stockInLoading =
                movingId ===
                `${medicineId}-in`;

              const stockOutLoading =
                movingId ===
                `${medicineId}-out`;

              const status =
                row.isExpired
                  ? "Expired"
                  : row.status;

              return (
                <article
                  key={medicineId}
                  style={{
                    background: "#fff",
                    border:
                      "1px solid #ddd",
                    borderRadius: 16,
                    padding: 16,
                    boxShadow:
                      "0 2px 8px rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 14,
                      justifyContent:
                        "space-between",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        flex: "1 1 300px",
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <h2
                          style={{
                            margin: 0,
                            fontSize: 20,
                          }}
                        >
                          {row.medicine.name}
                        </h2>

                        {row.medicine.prescription && (
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color: "#92400e",
                              background:
                                "#fef3c7",
                              border:
                                "1px solid #f59e0b",
                              padding:
                                "3px 7px",
                              borderRadius: 999,
                            }}
                          >
                            Rx
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: 5,
                          color: "#666",
                          fontSize: 14,
                        }}
                      >
                        {row.medicine.category ||
                          "No Category"}
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          display: "inline-block",
                          padding:
                            "7px 11px",
                          borderRadius: 9,
                          background:
                            status === "In Stock"
                              ? "#e8f7ed"
                              : status ===
                                "Low Stock"
                              ? "#fff7d6"
                              : status ===
                                "Expired"
                              ? "#fee2e2"
                              : "#f3f4f6",
                          color:
                            status === "In Stock"
                              ? "#15803d"
                              : status ===
                                "Low Stock"
                              ? "#a16207"
                              : status ===
                                "Expired"
                              ? "#b91c1c"
                              : "#374151",
                          fontWeight: 800,
                          fontSize: 13,
                        }}
                      >
                        {status}
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign:
                          "right",
                        minWidth: 150,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "#666",
                        }}
                      >
                        Current Stock
                      </div>

                      <div
                        style={{
                          fontSize: 30,
                          fontWeight: 800,
                        }}
                      >
                        {row.quantity.toLocaleString(
                          "en-IN"
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: 13,
                          color: "#666",
                        }}
                      >
                        units
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      padding:
                        "14px 12px",
                      borderRadius: 12,
                      background:
                        "#fafafa",
                      border:
                        "1px solid #eee",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(4, minmax(0, 1fr))",
                        gap: 8,
                      }}
                    >
                      {[
                        ["MRP Rate", row.mrp],
                        [
                          "Purc Rate",
                          row.purchaseRate,
                        ],
                        [
                          "Net Rate",
                          row.netRate,
                        ],
                        [
                          "Sale Rate",
                          row.saleRate,
                        ],
                      ].map(
                        ([label, value]) => (
                          <div
                            key={label}
                            style={{
                              minWidth: 0,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                color: "#707070",
                              }}
                            >
                              {label}
                            </div>
                            <div
                              style={{
                                marginTop: 3,
                                fontSize: 17,
                                fontWeight: 800,
                                wordBreak:
                                  "break-word",
                              }}
                            >
                              {money(value)}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 10,
                      marginTop: 12,
                    }}
                  >
                    <div
                      style={{
                        padding: 11,
                        border:
                          "1px solid #eee",
                        borderRadius: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "#777",
                        }}
                      >
                        Batch
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontWeight: 700,
                        }}
                      >
                        {row.record?.batch_no ||
                          "Not set"}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 11,
                        border:
                          row.isExpired
                            ? "1px solid #ef4444"
                            : row.isExpiring30
                            ? "1px solid #f59e0b"
                            : "1px solid #eee",
                        borderRadius: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "#777",
                        }}
                      >
                        Expiry
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontWeight: 700,
                          color:
                            row.isExpired
                              ? "#b91c1c"
                              : row.isExpiring30
                              ? "#b45309"
                              : "#222",
                        }}
                      >
                        {formatExpiry(
                          row.record?.expiry_date
                        )}
                        {row.expiryDays !==
                          null &&
                          row.expiryDays >=
                            0 && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 12,
                              }}
                            >
                              ({row.expiryDays}d)
                            </span>
                          )}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 11,
                        border:
                          "1px solid #eee",
                        borderRadius: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "#777",
                        }}
                      >
                        Net Stock Value
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontWeight: 800,
                        }}
                      >
                        {money(
                          row.netRate *
                            row.quantity
                        )}
                      </div>
                    </div>
                  </div>

                  <details
                    style={{
                      marginTop: 12,
                    }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        fontWeight: 800,
                        color: "#5b1b73",
                      }}
                    >
                      Edit stock & rates
                    </summary>

                    <div
                      style={{
                        marginTop: 12,
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: 9,
                      }}
                    >
                      {[
                        ["mrp", "MRP Rate"],
                        [
                          "purchasePrice",
                          "Purc Rate",
                        ],
                        [
                          "netRate",
                          "Net Rate",
                        ],
                        [
                          "sellingPrice",
                          "Sale Rate",
                        ],
                        [
                          "quantity",
                          "Quantity",
                        ],
                      ].map(
                        ([key, label]) => (
                          <label
                            key={key}
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {label}
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={getEditValue(
                                row,
                                key
                              )}
                              onChange={(event) =>
                                setEditValue(
                                  medicineId,
                                  key,
                                  event.target.value
                                )
                              }
                              style={{
                                display: "block",
                                width: "100%",
                                boxSizing:
                                  "border-box",
                                marginTop: 5,
                                padding:
                                  "10px 11px",
                                border:
                                  "1px solid #ccc",
                                borderRadius: 9,
                                fontSize: 14,
                              }}
                            />
                          </label>
                        )
                      )}

                      <label
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Batch No.
                        <input
                          type="text"
                          value={getEditValue(
                            row,
                            "batchNo"
                          )}
                          onChange={(event) =>
                            setEditValue(
                              medicineId,
                              "batchNo",
                              event.target.value
                            )
                          }
                          style={{
                            display:
                              "block",
                            width: "100%",
                            boxSizing:
                              "border-box",
                            marginTop: 5,
                            padding:
                              "10px 11px",
                            border:
                              "1px solid #ccc",
                            borderRadius: 9,
                            fontSize: 14,
                          }}
                        />
                      </label>

                      <label
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Expiry Date
                        <input
                          type="date"
                          value={getEditValue(
                            row,
                            "expiryDate"
                          )}
                          onChange={(event) =>
                            setEditValue(
                              medicineId,
                              "expiryDate",
                              event.target.value
                            )
                          }
                          style={{
                            display:
                              "block",
                            width: "100%",
                            boxSizing:
                              "border-box",
                            marginTop: 5,
                            padding:
                              "10px 11px",
                            border:
                              "1px solid #ccc",
                            borderRadius: 9,
                            fontSize: 14,
                          }}
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        saveInventory(
                          row
                        )
                      }
                      disabled={saving}
                      style={{
                        marginTop: 11,
                        padding:
                          "11px 17px",
                        border: 0,
                        borderRadius: 9,
                        background:
                          "#5b1b73",
                        color: "#fff",
                        fontWeight: 800,
                        cursor: saving
                          ? "not-allowed"
                          : "pointer",
                      }}
                    >
                      {saving
                        ? "Saving..."
                        : "Save Inventory"}
                    </button>
                  </details>

                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop:
                        "1px solid #eee",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        marginBottom: 7,
                      }}
                    >
                      Stock Movement
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Qty"
                        value={
                          movementQty[
                            medicineId
                          ] ?? ""
                        }
                        onChange={(event) =>
                          setMovementQty(
                            (current) => ({
                              ...current,
                              [medicineId]:
                                event.target
                                  .value,
                            })
                          )
                        }
                        style={{
                          width: 90,
                          padding:
                            "10px 11px",
                          border:
                            "1px solid #ccc",
                          borderRadius: 9,
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
                            row,
                            "in"
                          )
                        }
                        style={{
                          padding:
                            "10px 13px",
                          border: 0,
                          borderRadius: 9,
                          fontWeight: 800,
                          cursor:
                            "pointer",
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
                          row.quantity === 0
                        }
                        onClick={() =>
                          moveStock(
                            row,
                            "out"
                          )
                        }
                        style={{
                          padding:
                            "10px 13px",
                          border: 0,
                          borderRadius: 9,
                          fontWeight: 800,
                          cursor:
                            row.quantity === 0
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
                </article>
              );
            })}
          </div>

          {visibleRows.length === 0 && (
            <div
              style={{
                padding: 30,
                textAlign: "center",
                color: "#666",
              }}
            >
              No medicines match the current
              search/filter.
            </div>
          )}
        </>
      )}
    </main>
  );
}
