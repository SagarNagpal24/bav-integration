"use client";

import React, { useMemo, useState, useEffect } from "react";
import * as XLSX from "xlsx";

type Item = {
  Code?: string;
  MMScode?: string;
  Title?: string;
  Saleprice?: number | string | null;
  Type?: string;
};

type StoreProps = {
  items?: Item[];
  onRefresh?: () => void;
  handleFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCreateItem?: (payload: Item) => Promise<void>;
  onUpdateItem?: (code: string, payload: Item) => Promise<void>;
  onDeleteItem?: (code: string) => Promise<void>;
};

const TYPE_OPTIONS = ["Book", "Audio", "Photo"];

export default function Store({
  items = [],
  onRefresh,
  handleFileUpload,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
}: StoreProps) {
  const [query, setQuery] = useState("");

  const emptyForm = { Code: "", MMScode: "", Title: "", Saleprice: "", Type: "" };
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCode, setConfirmCode] = useState<string | null>(null);

  const codeSet = useMemo(
    () => new Set(items.map((it) => String(it.Code ?? ""))),
    [items]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((it) => {
      const code = String(it.Code ?? "").toLowerCase();
      const mms = String(it.MMScode ?? "").toLowerCase();
      const title = String(it.Title ?? "").toLowerCase();
      const type = String(it.Type ?? "").toLowerCase();

      return (
        code.includes(q) ||
        mms.includes(q) ||
        title.includes(q) ||
        type.includes(q)
      );
    });
  }, [items, query]);

  const parseMoney = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = parseFloat(String(v).replace(/[^\d.-]/g, "").trim());
    return Number.isFinite(n) ? n : null;
  };

  const downloadExcel = () => {
  const headers: Array<"Code" | "MMScode" | "Title" | "Saleprice" | "Type"> = [
    "Code",
    "MMScode",
    "Title",
    "Saleprice",
    "Type",
  ];

  const rows: Array<{
    Code: string;
    MMScode: string;
    Title: string;
    Saleprice: number | null;
    Type: string;
  }> = items.map((it) => ({
    Code: it.Code ?? "",
    MMScode: it.MMScode ?? "",
    Title: it.Title ?? "",
    Saleprice: parseMoney(it.Saleprice),
    Type: it.Type ?? "",
  }));

  const ws = XLSX.utils.aoa_to_sheet([headers]);

  XLSX.utils.sheet_add_json(ws, rows, {
    header: headers,
    skipHeader: true,
    origin: "A2",
  });

  if (ws["!ref"]) {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      const ref = XLSX.utils.encode_cell({ r: R, c: 3 });
      const rowIdx = R - 1;
      const v = rows[rowIdx]?.Saleprice;

      if (typeof v === "number" && Number.isFinite(v)) {
        ws[ref] = ws[ref] || {};
        ws[ref].v = v;
        ws[ref].t = "n";
        ws[ref].z = "#,##0.00";
      } else if (ws[ref]) {
        ws[ref].v = "";
        ws[ref].t = "s";
      }
    }
  }

  ws["!cols"] = headers.map((key) => ({
    wch:
      Math.min(
        60,
        Math.max(key.length, ...rows.map((r) => String(r[key] ?? "").length)) + 2
      ),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "StoreItems");

  const today = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `store-items-${today}.xlsx`);
};
  const createItemDefault = async (payload: Item) => {
    const res = await fetch(`/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Create failed (${res.status})`);
  };

  const updateItemDefault = async (code: string, payload: Item) => {
    const res = await fetch(`/api/items/${encodeURIComponent(code)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Update failed (${res.status})`);
  };

  const deleteItemDefault = async (code: string) => {
    const res = await fetch(`/api/items/${encodeURIComponent(code)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error(`Delete failed (${res.status})`);
  };

  const createItem = onCreateItem || createItemDefault;
  const updateItem = onUpdateItem || updateItemDefault;
  const deleteItem = onDeleteItem || deleteItemDefault;

  const openAdd = () => {
    setMode("add");
    setForm(emptyForm);
    setErr(null);
    setIsOpen(true);
  };

  const openEdit = (it: Item) => {
    setMode("edit");
    setForm({
      Code: it.Code ?? "",
      MMScode: it.MMScode ?? "",
      Title: it.Title ?? "",
      Saleprice: it.Saleprice ?? "",
      Type: it.Type ?? "",
    } as typeof emptyForm);
    setErr(null);
    setIsOpen(true);
  };

  const closeModal = () => {
    if (!busy) setIsOpen(false);
  };

  const onFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const validate = () => {
    if (!String(form.Code || "").trim()) return "Code is required.";
    if (mode === "add" && codeSet.has(String(form.Code))) {
      return `Code "${form.Code}" already exists.`;
    }
    if (
      String(form.Saleprice).trim() !== "" &&
      parseMoney(form.Saleprice) === null
    ) {
      return "Saleprice must be a number (or leave blank).";
    }
    return null;
  };

  const onSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const v = validate();
    if (v) {
      setErr(v);
      return;
    }

    setBusy(true);
    setErr(null);

    try {
      const payload: Item = {
        Code: String(form.Code).trim(),
        MMScode: String(form.MMScode || "").trim(),
        Title: String(form.Title || "").trim(),
        Saleprice:
          String(form.Saleprice).trim() === ""
            ? null
            : parseMoney(form.Saleprice),
        Type: String(form.Type || "").trim(),
      };

      if (mode === "add") {
        await createItem(payload);
      } else {
        await updateItem(payload.Code || "", payload);
      }

      setIsOpen(false);
      if (typeof onRefresh === "function") onRefresh();
    } catch (e: any) {
      setErr(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const openDeleteConfirm = (code?: string) => {
    if (!code) return;
    setConfirmCode(code);
    setConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    if (!busy) {
      setConfirmOpen(false);
      setConfirmCode(null);
    }
  };

  const confirmDelete = async () => {
    if (!confirmCode) return;
    setBusy(true);
    try {
      await deleteItem(confirmCode);
      if (typeof onRefresh === "function") onRefresh();
    } catch (e: any) {
      alert(e.message || "Delete failed.");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
      setConfirmCode(null);
    }
  };

  const onDelete = (code?: string) => {
    if (!code) return;
    openDeleteConfirm(code);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isOpen) closeModal();
        if (confirmOpen) closeDeleteConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, confirmOpen, busy]);

  return (
    <div className="container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0 }}>📦 Store</h3>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            title="Choose Excel file to import"
          />
          {typeof onRefresh === "function" && (
            <button onClick={onRefresh} className="primary">
              Refresh Items
            </button>
          )}
          <button
            onClick={downloadExcel}
            className="secondary"
            style={{ backgroundColor: "green", color: "white" }}
          >
            Download Items (Excel)
          </button>
          <button
            onClick={openAdd}
            className="secondary"
            style={{ backgroundColor: "#0d6efd", color: "white" }}
          >
            + Add Item
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by Code / MMS / Title / Type"
          style={{
            height: 36,
            padding: "0 10px",
            border: "1px solid #ccc",
            borderRadius: 6,
            minWidth: 260,
          }}
        />
        <button
          onClick={() => setQuery("")}
          className="secondary"
          style={{ backgroundColor: "red", color: "white" }}
        >
          Clear
        </button>
      </div>

      <div style={{ margin: "10px 0", fontWeight: 600 }}>
        Items in store: {items.length} | Showing: {filtered.length}
      </div>

      <div
        style={{
          overflow: "auto",
          maxHeight: "60vh",
          border: "1px solid #eee",
          borderRadius: 8,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead
            style={{
              position: "sticky",
              top: 0,
              textAlign: "center",
              zIndex: 1,
              background: "white",
            }}
          >
            <tr>
              <th style={th}>#</th>
              <th style={th}>Code</th>
              <th style={th}>MMS Code</th>
              <th style={th}>Title</th>
              <th style={th}>Sale Price</th>
              <th style={th}>Type</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it, idx) => (
              <tr
                key={`${it.Code ?? ""}${idx}`}
                style={{ borderTop: "1px solid #f1f1f1" }}
              >
                <td style={td}>{idx + 1}</td>
                <td style={tdMono}>{it.Code}</td>
                <td style={tdMono}>{it.MMScode}</td>
                <td style={td}>{it.Title}</td>
                <td style={td}>
                  {it.Saleprice !== undefined &&
                  it.Saleprice !== null &&
                  String(it.Saleprice) !== ""
                    ? `₹${Number(it.Saleprice).toFixed(2)}`
                    : ""}
                </td>
                <td style={td}>{it.Type}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <button
                    className="secondary"
                    onClick={() => openEdit(it)}
                    style={{ marginRight: 6 }}
                  >
                    Edit
                  </button>
                  <button
                    className="secondary"
                    onClick={() => onDelete(it.Code)}
                    style={{ backgroundColor: "#dc3545", color: "white" }}
                    disabled={busy}
                    title="Delete"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{ ...td, textAlign: "center", padding: 24 }}
                >
                  No items match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isOpen && (
        <div style={backdropStyle} onMouseDown={closeModal}>
          <div
            style={modalStyle}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h4 style={{ margin: 0 }}>
                {mode === "add" ? "Add Item" : "Edit Item"}
              </h4>
              <button onClick={closeModal} className="secondary">
                ✕
              </button>
            </div>

            {err && (
              <div style={{ marginTop: 8, color: "#b00020", fontSize: 13 }}>
                {err}
              </div>
            )}

            <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
              <div style={row}>
                <label style={label}>
                  Code<span style={{ color: "#b00020" }}> *</span>
                </label>
                <input
                  name="Code"
                  value={form.Code}
                  onChange={onFormChange}
                  placeholder="Unique code"
                  style={input}
                  disabled={mode === "edit"}
                />
              </div>

              <div style={row}>
                <label style={label}>MMS Code</label>
                <input
                  name="MMScode"
                  value={form.MMScode}
                  onChange={onFormChange}
                  placeholder="MMS code"
                  style={input}
                />
              </div>

              <div style={row}>
                <label style={label}>Title</label>
                <input
                  name="Title"
                  value={form.Title}
                  onChange={onFormChange}
                  placeholder="Item title"
                  style={input}
                />
              </div>

              <div style={row}>
                <label style={label}>Sale Price</label>
                <input
                  name="Saleprice"
                  value={form.Saleprice}
                  onChange={onFormChange}
                  placeholder="e.g. 199.99"
                  style={input}
                  inputMode="decimal"
                />
              </div>

              <div style={row}>
                <label style={label}>Type</label>
                <select
                  name="Type"
                  value={form.Type}
                  onChange={onFormChange}
                  style={{ ...input, height: 38 }}
                >
                  <option value="">— Select —</option>
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  {form.Type && !TYPE_OPTIONS.includes(form.Type) && (
                    <option value={form.Type}>{form.Type} (custom)</option>
                  )}
                </select>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 14,
                }}
              >
                <button
                  type="button"
                  className="secondary"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={busy}
                  style={{ backgroundColor: "#0d6efd", color: "white" }}
                >
                  {busy ? "Saving..." : mode === "add" ? "Add" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div style={backdropStyle} onMouseDown={closeDeleteConfirm}>
          <div
            style={confirmModalStyle}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-desc"
          >
            <h4 id="confirm-title" style={{ margin: 0 }}>
              Delete Item
            </h4>
            <p id="confirm-desc" style={confirmText}>
              Are you sure you want to delete item with Code{" "}
              <span
                style={{
                  fontFamily:
                    "ui-monospace, Menlo, Monaco, Consolas, monospace",
                }}
              >
                {confirmCode}
              </span>
              ? This action cannot be undone.
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 10,
              }}
            >
              <button
                type="button"
                className="secondary"
                onClick={closeDeleteConfirm}
                style={cancelBtn}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={confirmDelete}
                style={dangerBtn}
                disabled={busy}
              >
                {busy ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "center",
  padding: "10px 12px",
  borderBottom: "1px solid #eee",
  fontWeight: 700,
  fontSize: 14,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 14,
  verticalAlign: "top",
};

const tdMono: React.CSSProperties = {
  ...td,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  whiteSpace: "nowrap",
};

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.25)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 999,
};

const modalStyle: React.CSSProperties = {
  width: "min(520px, 100%)",
  background: "white",
  borderRadius: 12,
  padding: 16,
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};

const confirmModalStyle: React.CSSProperties = {
  width: "min(440px, 100%)",
  background: "white",
  borderRadius: 12,
  padding: 16,
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};

const confirmText: React.CSSProperties = {
  marginTop: 10,
  marginBottom: 0,
  lineHeight: 1.4,
  color: "#333",
  fontSize: 14,
};

const cancelBtn: React.CSSProperties = {
  backgroundColor: "#f1f1f1",
  color: "#333",
  border: "1px solid #ddd",
};

const dangerBtn: React.CSSProperties = {
  backgroundColor: "#dc3545",
  color: "white",
  border: "1px solid #dc3545",
};

const row: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginTop: 10,
};

const label: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
};

const input: React.CSSProperties = {
  height: 36,
  padding: "0 10px",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 14,
};