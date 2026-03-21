


"use client";

import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

type BillItem = {
  Code?: string;
  MMScode?: string;
  Title?: string;
  Type?: string;
  qty?: number;
  Saleprice?: number;
};

type Bill = {
  _id?: string;
  date?: string;
  items?: BillItem[];
  total?: number;
};

type DeleteItemState = {
  billIndex: number;
  itemIndex: number;
} | null;

type PendingQtyState = {
  billIndex: number;
  itemIndex: number;
  current: number;
  next: number;
} | null;

type ReportProps = {
  onSalesChanged?: () => void;
};

export default function Report({ onSalesChanged }: ReportProps) {
  const [bills, setBills] = useState<Bill[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);

  const [search, setSearch] = useState("");
  const [showRangeConfirm, setShowRangeConfirm] = useState(false);
  const [rangeStart, setRangeStart] = useState(today);
  const [rangeEnd, setRangeEnd] = useState(today);
  const [rangeError, setRangeError] = useState("");

  const [exportStart, setExportStart] = useState(today);
  const [exportEnd, setExportEnd] = useState(today);

  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [deleteItem, setDeleteItem] = useState<DeleteItemState>(null);
  const [pendingQty, setPendingQty] = useState<PendingQtyState>(null);

  const [alertMsg, setAlertMsg] = useState("");

  const inInclusiveRange = (
    dateStr?: string,
    startStr?: string,
    endStr?: string
  ) => {
    if (!dateStr || !startStr || !endStr) return false;
    const d = new Date(dateStr);
    const s = new Date(startStr);
    const e = new Date(endStr);
    d.setHours(0, 0, 0, 0);
    s.setHours(0, 0, 0, 0);
    e.setHours(0, 0, 0, 0);
    return d >= s && d <= e;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const url = selectedDate
          ? `/api/bills?date=${encodeURIComponent(selectedDate)}`
          : `/api/bills`;

        const res = await fetch(url, { credentials: "include" });
        const data = await res.json();
        setBills(Array.isArray(data) ? data : []);
      } catch {
        setAlertMsg("❌ Failed to load bills from server");
      }
    };

    load();
  }, [selectedDate]);

  useEffect(() => {
    if (!alertMsg) return;
    const t = setTimeout(() => setAlertMsg(""), 2800);
    return () => clearTimeout(t);
  }, [alertMsg]);

  const refresh = async () => {
    const url = selectedDate
      ? `/api/bills?date=${encodeURIComponent(selectedDate)}`
      : `/api/bills`;

    const res = await fetch(url, { credentials: "include" });
    const data = await res.json();
    setBills(Array.isArray(data) ? data : []);
  };

  const validateRange = () => {
    if (!rangeStart || !rangeEnd) {
      setRangeError("Please select both start and end dates.");
      return false;
    }
    if (rangeStart > rangeEnd) {
      setRangeError("Start date cannot be after end date.");
      return false;
    }
    setRangeError("");
    return true;
  };

  const clearRange = async () => {
    if (!validateRange()) return;

    try {
      const listUrl = `/api/bills?start=${encodeURIComponent(
        rangeStart
      )}&end=${encodeURIComponent(rangeEnd)}`;

      const listRes = await fetch(listUrl, { credentials: "include" });
      let list: Bill[] = [];

      if (listRes.ok) {
        const body = await listRes.json();
        list = Array.isArray(body) ? body : [];
      } else {
        const allRes = await fetch(`/api/bills`, { credentials: "include" });
        const all = await allRes.json();
        list = Array.isArray(all)
          ? all.filter((b: Bill) =>
              inInclusiveRange(b?.date, rangeStart, rangeEnd)
            )
          : [];
      }

      const toDelete = list.filter((b) =>
        inInclusiveRange(b?.date, rangeStart, rangeEnd)
      );

      if (toDelete.length === 0) {
        setShowRangeConfirm(false);
        await refresh();
        setAlertMsg(`⚠️ No bills found from ${rangeStart} to ${rangeEnd}`);
        return;
      }

      const results = await Promise.allSettled(
        toDelete.map((b) =>
          fetch(`/api/bills/${b._id}`, {
            method: "DELETE",
            credentials: "include",
          })
        )
      );

      const deleted = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - deleted;

      setShowRangeConfirm(false);
      await refresh();

      if (failed === 0) {
        setAlertMsg(
          `✅ Deleted ${deleted} bill(s) from ${rangeStart} to ${rangeEnd}`
        );
      } else {
        setAlertMsg(`⚠️ Deleted ${deleted} bill(s); ${failed} failed`);
      }

      if (typeof onSalesChanged === "function") onSalesChanged();
    } catch (err) {
      console.error(err);
      setAlertMsg("❌ Failed to delete bills in range");
    }
  };

  const billNoOfIndex = (idx: number) => bills.length - idx;

  const idxInAll = (bill: Bill) =>
    bills.findIndex((b) =>
      b?._id && bill?._id ? b._id === bill._id : b === bill
    );

  const billNoOf = (bill: Bill) => {
    const i = idxInAll(bill);
    return i >= 0 ? billNoOfIndex(i) : "?";
  };

  const patchQty = async (billId: string, itemIndex: number, qty: number) => {
    if (qty <= 0) {
      await fetch(`/api/bills/${billId}/items/${itemIndex}`, {
        method: "PATCH",
        credentials: "include",
      });
      return;
    }

    const res = await fetch(`/api/bills/${billId}/items/${itemIndex}/qty`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ qty }),
    });

    if (!res.ok) {
      throw new Error(`Failed to update quantity (${res.status})`);
    }
  };

  const proposeQtyChange = (
    billIndex: number,
    itemIndex: number,
    nextQty: number
  ) => {
    const current = Number(bills[billIndex]?.items?.[itemIndex]?.qty || 0);
    if (Number(nextQty) === current) return;

    setPendingQty({
      billIndex,
      itemIndex,
      current,
      next: Math.max(0, Math.floor(Number(nextQty))),
    });
  };

  const applyQtyChange = async () => {
    if (!pendingQty) return;

    const { billIndex, itemIndex, next } = pendingQty;
    const bill = bills[billIndex];
    if (!bill?._id) return;

    try {
      await patchQty(bill._id, itemIndex, next);
      await refresh();
      setAlertMsg(
        next <= 0
          ? `🗑️ Removed item from Bill #${billNoOfIndex(billIndex)}`
          : `✅ Updated qty to ${next} on Bill #${billNoOfIndex(billIndex)}`
      );
      if (typeof onSalesChanged === "function") onSalesChanged();
    } catch (e) {
      console.error(e);
      setAlertMsg("❌ Failed to update quantity");
    } finally {
      setPendingQty(null);
    }
  };

  const changeQty = (billIndex: number, itemIndex: number, delta: number) => {
    const current = Number(bills[billIndex]?.items?.[itemIndex]?.qty || 0);
    proposeQtyChange(billIndex, itemIndex, current + delta);
  };

  const setExactQty = (
    billIndex: number,
    itemIndex: number,
    qtyStr: string
  ) => {
    const n = Math.max(0, Math.floor(Number(qtyStr || 0)));
    proposeQtyChange(billIndex, itemIndex, n);
  };

  const deleteBill = async (index: number) => {
    try {
      const id = bills[index]?._id;
      if (!id) return;

      await fetch(`/api/bills/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      setDeleteIndex(null);
      await refresh();
      setAlertMsg(`✅ Deleted Bill #${billNoOfIndex(index)}`);
      if (typeof onSalesChanged === "function") onSalesChanged();
    } catch {
      setAlertMsg("❌ Failed to delete bill");
    }
  };

  const deleteBillItem = async (billIndex: number, itemIndex: number) => {
    try {
      const id = bills[billIndex]?._id;
      if (!id) return;

      await fetch(`/api/bills/${id}/items/${itemIndex}`, {
        method: "PATCH",
        credentials: "include",
      });

      setDeleteItem(null);
      await refresh();
      setAlertMsg(`✅ Deleted item from Bill #${billNoOfIndex(billIndex)}`);
      if (typeof onSalesChanged === "function") onSalesChanged();
    } catch {
      setAlertMsg("❌ Failed to delete bill item");
    }
  };

  const matchesQuery = (bill: Bill) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    if (String(billNoOf(bill)).includes(q)) return true;
    if ((bill.date || "").toLowerCase().includes(q)) return true;

    return (bill.items || []).some((it) =>
      [it?.Code, it?.MMScode, it?.Title, it?.Type]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  };

  const filtered = bills.filter(matchesQuery);
  const totalSales = filtered.reduce((sum, b) => sum + (b.total || 0), 0);

  const exportToExcel = () => {
    if (filtered.length === 0) {
      setAlertMsg("⚠️ No data to export for the selected date/search.");
      return;
    }

    const rows: Record<string, string | number>[] = [];

    filtered.forEach((bill) => {
      (bill.items || []).forEach((item) => {
        rows.push({
          BillNo: String(billNoOf(bill)),
          Date: bill.date || "",
          Code: item.Code || "",
          MMScode: item.MMScode || "",
          Title: item.Title || "",
          Type: item.Type || "",
          Quantity: Number(item.qty || 0),
          Price: Number(item.Saleprice || 0),
          Subtotal: Number(item.Saleprice || 0) * Number(item.qty || 0),
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");

    const fileName = selectedDate
      ? `Report_${selectedDate}${search ? `_q-${search}` : ""}.xlsx`
      : `Report_All${search ? `_q-${search}` : ""}.xlsx`;

    XLSX.writeFile(wb, fileName);
  };

  const exportRangeToExcel = async () => {
    if (!exportStart || !exportEnd) {
      setAlertMsg("⚠️ Please select both start and end dates for export.");
      return;
    }
    if (exportStart > exportEnd) {
      setAlertMsg("⚠️ Start date cannot be after end date.");
      return;
    }

    try {
      const url = `/api/bills?start=${encodeURIComponent(
        exportStart
      )}&end=${encodeURIComponent(exportEnd)}`;

      const res = await fetch(url, { credentials: "include" });

      let list: Bill[] = [];
      if (res.ok) {
        const data = await res.json();
        list = Array.isArray(data) ? data : [];
      } else {
        const allRes = await fetch(`/api/bills`, { credentials: "include" });
        const all = await allRes.json();
        list = Array.isArray(all) ? all : [];
      }

      const withinRange = list.filter((b) =>
        inInclusiveRange(b?.date, exportStart, exportEnd)
      );

      if (withinRange.length === 0) {
        setAlertMsg(`⚠️ No bills found from ${exportStart} to ${exportEnd}`);
        return;
      }

      const map = new Map<
        string,
        {
          MMScode: string;
          Code: string;
          Title: string;
          Type: string;
          __sumQty: number;
          __sumAmount: number;
        }
      >();

      withinRange.forEach((bill) => {
        (bill.items || []).forEach((it) => {
          const key = it.Code || "";
          const qty = Number(it.qty) || 0;
          const unitPrice = Number(it.Saleprice) || 0;
          const lineAmount = unitPrice * qty;

          const prev = map.get(key) || {
            MMScode: it.MMScode || "",
            Code: it.Code || "",
            Title: it.Title || "",
            Type: it.Type || "",
            __sumQty: 0,
            __sumAmount: 0,
          };

          prev.MMScode = it.MMScode || prev.MMScode;
          prev.Code = it.Code || prev.Code;
          prev.Title = it.Title || prev.Title;
          prev.Type = it.Type || prev.Type;
          prev.__sumQty += qty;
          prev.__sumAmount += lineAmount;

          map.set(key, prev);
        });
      });

      const groupedRows = Array.from(map.values())
        .filter((r) => r.__sumQty > 0)
        .map((r) => ({
          MMScode: r.MMScode,
          Code: r.Code,
          Title: r.Title,
          Type: r.Type,
          SalePrice: Number((r.__sumAmount / r.__sumQty).toFixed(2)),
          TotalQty: r.__sumQty,
          TotalAmount: Number(r.__sumAmount.toFixed(2)),
        }));

      if (groupedRows.length === 0) {
        setAlertMsg("⚠️ No items found to export in this range.");
        return;
      }

      const ws = XLSX.utils.json_to_sheet(groupedRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Items (Grouped)");
      XLSX.writeFile(wb, `Items_${exportStart}_to_${exportEnd}.xlsx`);
      setAlertMsg(`✅ Exported grouped items from ${exportStart} to ${exportEnd}`);
    } catch (e) {
      console.error(e);
      setAlertMsg("❌ Failed to export range to Excel");
    }
  };

  const normalizeBackupBill = (bill: Bill = {}) => {
    const items = Array.isArray(bill.items)
      ? bill.items.map((item) => ({
          Code: item?.Code || "",
          MMScode: item?.MMScode || "",
          Title: item?.Title || "",
          Type: item?.Type || "",
          qty: Number(item?.qty || 0),
          Saleprice: Number(item?.Saleprice || 0),
        }))
      : [];

    return {
      date: bill?.date || new Date().toISOString().split("T")[0],
      items,
      total:
        typeof bill?.total === "number"
          ? bill.total
          : items.reduce(
              (sum, item) =>
                sum + Number(item.Saleprice || 0) * Number(item.qty || 0),
              0
            ),
    };
  };

  const exportFullBackup = async () => {
    try {
      const res = await fetch(`/api/bills`, { credentials: "include" });
      const data = await res.json();
      const allBills = Array.isArray(data) ? data : [];

      if (allBills.length === 0) {
        setAlertMsg("⚠️ No bills found to back up.");
        return;
      }

      const backup = {
        backupVersion: 1,
        exportedAt: new Date().toISOString(),
        totalBills: allBills.length,
        bills: allBills.map(normalizeBackupBill),
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const todayStr = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `bills_backup_${todayStr}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setAlertMsg(`✅ Full backup exported (${allBills.length} bills)`);
    } catch (err) {
      console.error(err);
      setAlertMsg("❌ Failed to export full backup");
    }
  };

  const importFullBackup = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const backupBills = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.bills)
        ? parsed.bills
        : [];

      if (backupBills.length === 0) {
        setAlertMsg("⚠️ Selected file has no valid bill data.");
        event.target.value = "";
        return;
      }

      let success = 0;
      let failed = 0;

      for (const rawBill of backupBills) {
        try {
          const normalized = normalizeBackupBill(rawBill);
          const payload = { ...normalized };

          const res = await fetch(`/api/bills`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            success++;
          } else {
            failed++;
            const errText = await res.text().catch(() => "");
            console.error("Restore failed for bill:", payload, errText);
          }
        } catch (err) {
          failed++;
          console.error("Restore failed:", err);
        }
      }

      await refresh();

      if (typeof onSalesChanged === "function") onSalesChanged();

      if (failed === 0) {
        setAlertMsg(`✅ Backup restored successfully (${success} bills)`);
      } else {
        setAlertMsg(`⚠️ Restored ${success} bills, ${failed} failed`);
      }
    } catch (err) {
      console.error(err);
      setAlertMsg("❌ Failed to read backup file");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="container">
      {alertMsg && (
        <div
          style={{
            position: "fixed",
            top: "18%",
            left: "50%",
            transform: "translateX(-50%)",
            background: alertMsg.startsWith("✅") ? "#2e7d32" : "#c62828",
            color: "white",
            padding: "10px 16px",
            borderRadius: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
            zIndex: 1000,
            fontWeight: 600,
            minWidth: 240,
            textAlign: "center",
          }}
        >
          {alertMsg}
        </div>
      )}

      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <h2>Sales Report</h2>
        <button
          onClick={() => setShowRangeConfirm(true)}
          style={{ background: "red", color: "white", padding: "6px 12px", borderRadius: "5px" }}
        >
          Clear Bills By Date
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <label>Select Date: </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <button onClick={() => setSelectedDate("")}>Show All</button>
        </div>

        <button
          onClick={exportToExcel}
          style={{ background: "green", color: "white", padding: "6px 12px", borderRadius: 6 }}
        >
          Export Filtered
        </button>
      </div>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <strong>Export Range:</strong>
        <input
          type="date"
          value={exportStart}
          onChange={(e) => setExportStart(e.target.value)}
        />
        <span>to</span>
        <input
          type="date"
          value={exportEnd}
          onChange={(e) => setExportEnd(e.target.value)}
        />
        <button
          onClick={exportRangeToExcel}
          style={{ background: "#1976d2", color: "white", padding: "6px 12px", borderRadius: 6 }}
        >
          Export Range
        </button>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Search bill no, date, code, MMS, title, type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "6px 10px",
            minWidth: 280,
            border: "1px solid #ccc",
            borderRadius: 6,
          }}
        />
        {search && <button onClick={() => setSearch("")}>Clear</button>}
      </div>

      <h3 style={{ marginTop: "12px" }}>Total Sales: ₹{totalSales.toFixed(2)}</h3>

      {filtered.length === 0 ? (
        <p>No bills found for this selection/search.</p>
      ) : (
        filtered.map((bill) => {
          const billNo = billNoOf(bill);
          const globalIndex = idxInAll(bill);

          return (
            <div
              key={bill._id || globalIndex}
              style={{
                border: "1px solid gray",
                margin: 10,
                padding: 10,
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h4>
                  Bill #{billNo} — Date: {bill.date}
                </h4>
                <button
                  onClick={() => setDeleteIndex(globalIndex)}
                  style={{
                    background: "darkred",
                    color: "white",
                    padding: "4px 10px",
                    borderRadius: 5,
                  }}
                >
                  Delete Bill
                </button>
              </div>

              <table border={1} cellPadding="5" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Bill No</th>
                    <th>Date</th>
                    <th>Code</th>
                    <th>MMS Code</th>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Subtotal</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(bill.items || []).map((it, i) => {
                    const subtotal = (it.Saleprice || 0) * (it.qty || 0);
                    return (
                      <tr key={i}>
                        <td>{billNo}</td>
                        <td>{bill.date}</td>
                        <td>{it.Code}</td>
                        <td>{it.MMScode}</td>
                        <td>{it.Title}</td>
                        <td>{it.Type}</td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              justifyContent: "center",
                            }}
                          >
                            <button
                              onClick={() => changeQty(globalIndex, i, -1)}
                              style={{ padding: "2px 8px", borderRadius: 4 }}
                              title="Decrease"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={0}
                              value={it.qty ?? 0}
                              onChange={(e) => {
                                const v = e.target.value;
                                e.target.setAttribute("data-pending", v);
                              }}
                              onBlur={(e) => {
                                const v = e.target.getAttribute("data-pending");
                                if (v !== null) setExactQty(globalIndex, i, v);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const v =
                                    e.currentTarget.getAttribute("data-pending") ??
                                    e.currentTarget.value;
                                  setExactQty(globalIndex, i, v);
                                }
                              }}
                              style={{ width: 56, textAlign: "center" }}
                            />
                            <button
                              onClick={() => changeQty(globalIndex, i, +1)}
                              style={{ padding: "2px 8px", borderRadius: 4 }}
                              title="Increase"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td>₹{it.Saleprice}</td>
                        <td>₹{subtotal}</td>
                        <td>
                          <button
                            onClick={() =>
                              setDeleteItem({ billIndex: globalIndex, itemIndex: i })
                            }
                            style={{
                              background: "orange",
                              color: "white",
                              padding: "4px 8px",
                              borderRadius: 4,
                            }}
                          >
                            Delete Item
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ fontWeight: "bold" }}>
                    <td colSpan={9}>Bill Total</td>
                    <td>₹{(bill.total || 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })
      )}

      {pendingQty && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3>Confirm Quantity Change</h3>
            <p>
              Change quantity from <b>{pendingQty.current}</b> to <b>{pendingQty.next}</b>?
            </p>
            {pendingQty.next === 0 && (
              <p style={{ color: "crimson", fontWeight: 600 }}>
                This will remove the item from the bill.
              </p>
            )}
            <div style={btnRow}>
              <button onClick={applyQtyChange} style={dangerBtn}>
                Confirm
              </button>
              <button onClick={() => setPendingQty(null)} style={cancelBtn}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showRangeConfirm && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3>Delete Bills By Date Range</h3>
            <p>Select a start date and end date:</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <div>
                <label>Start Date</label>
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                />
              </div>
              <div>
                <label>End Date</label>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                />
              </div>
            </div>
            {rangeError && <p style={{ color: "red" }}>{rangeError}</p>}
            <div style={btnRow}>
              <button onClick={clearRange} style={dangerBtn}>
                Delete
              </button>
              <button onClick={() => setShowRangeConfirm(false)} style={cancelBtn}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteIndex !== null && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3>Confirm Delete</h3>
            <p>Are you sure you want to delete Bill #{billNoOfIndex(deleteIndex)}?</p>
            <div style={btnRow}>
              <button onClick={() => deleteBill(deleteIndex)} style={dangerBtn}>
                Yes, Delete
              </button>
              <button onClick={() => setDeleteIndex(null)} style={cancelBtn}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteItem && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3>Confirm Delete</h3>
            <p>
              Delete Item{" "}
              <b>
                {bills[deleteItem.billIndex]?.items?.[deleteItem.itemIndex]?.Title}
              </b>{" "}
              from Bill #{billNoOfIndex(deleteItem.billIndex)}?
            </p>
            <div style={btnRow}>
              <button
                onClick={() =>
                  deleteBillItem(deleteItem.billIndex, deleteItem.itemIndex)
                }
                style={dangerBtn}
              >
                Yes, Delete
              </button>
              <button onClick={() => setDeleteItem(null)} style={cancelBtn}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 24,
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={exportFullBackup}
          style={{
            background: "#455a64",
            color: "white",
            padding: "5px 10px",
            borderRadius: 5,
            fontSize: 12,
            border: "none",
            cursor: "pointer",
          }}
          title="Download full bills backup"
        >
          Backup Export
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: "#00897b",
            color: "white",
            padding: "5px 10px",
            borderRadius: 5,
            fontSize: 12,
            border: "none",
            cursor: "pointer",
          }}
          title="Upload bills backup file"
        >
          Backup Upload
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={importFullBackup}
        />
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: "white",
  padding: "20px",
  borderRadius: "10px",
  width: "380px",
  maxWidth: "95vw",
  textAlign: "center",
  boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
};

const btnRow: React.CSSProperties = {
  marginTop: "20px",
  display: "flex",
  justifyContent: "space-around",
};

const dangerBtn: React.CSSProperties = {
  background: "red",
  color: "white",
  padding: "8px 14px",
  borderRadius: "5px",
};

const cancelBtn: React.CSSProperties = {
  background: "gray",
  color: "white",
  padding: "8px 14px",
  borderRadius: "5px",
};
