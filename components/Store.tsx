"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

type Item = {
  Code?: string;
  MMScode?: string;
  Title?: string;
  Saleprice?: number | string | null;
  Type?: string;
  Inventory?: number | string | null;
};

type StockRow = {
  MMScode: string;
  qty: number;
  Code?: string;
  Title?: string;
  Type?: string;
};

type StockUploadResult = {
  updated?: number;
  created?: number;
  needsPrice?: string[];
};

type CompareRow = {
  itemNo: string;
  name: string;
  fileQty: number;
  storeQty: number | null;
  diff: number;
  missing: boolean;
};

type StoreProps = {
  items?: Item[];
  onRefresh?: () => void;
  handleFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCreateItem?: (payload: Item) => Promise<void>;
  onUpdateItem?: (code: string, payload: Item) => Promise<void>;
  onUpdateInventory?: (code: string, inventory: number) => Promise<void>;
  onDeleteItem?: (code: string) => Promise<void>;
  onBulkCreateItems?: (payloads: Item[]) => Promise<void>;
  onUploadStock?: (rows: StockRow[]) => Promise<StockUploadResult>;
  readOnly?: boolean;
  refreshing?: boolean;
};

const TYPE_OPTIONS = ["Book", "Audio", "Photo", "Calendar"];

const toInventory = (v: unknown) => {
  const n = Math.floor(Number(String(v ?? "").replace(/[^\d.-]/g, "").trim()));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

// Item names look like: "<Type> <Code>, <Title>"
// e.g. "Photo CV-610-7-00-01, BJ-25 24x30 Baba Ji Canvas Photo"
const parseItemName = (name: unknown, fallbackCode: string) => {
  const raw = String(name ?? "").trim();
  if (!raw) return { Type: "", Code: fallbackCode, Title: "" };

  const commaIdx = raw.indexOf(",");
  const head = (commaIdx >= 0 ? raw.slice(0, commaIdx) : raw).trim();
  const title = commaIdx >= 0 ? raw.slice(commaIdx + 1).trim() : "";

  const parts = head.split(/\s+/).filter(Boolean);
  let type = "";
  let code = "";

  if (parts.length > 1) {
    type = parts[0];
    code = parts.slice(1).join(" ").trim();
  } else if (parts.length === 1) {
    code = parts[0];
  }

  return { Type: type, Code: code || fallbackCode, Title: title };
};

const needsPrice = (it: Item) =>
  it.Saleprice === undefined ||
  it.Saleprice === null ||
  String(it.Saleprice).trim() === "";

function StockCell({
  item,
  onSave,
}: {
  item: Item;
  onSave: (code: string, inventory: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<string>(String(item.Inventory ?? 0));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVal(String(item.Inventory ?? 0));
  }, [item.Inventory, item.Code, item.MMScode]);

  const startEdit = () => {
    setVal(String(item.Inventory ?? 0));
    setEditing(true);
  };

  const cancelEdit = () => {
    setVal(String(item.Inventory ?? 0));
    setEditing(false);
  };

  const commit = async () => {
    const next = toInventory(val);
    if (next === Number(item.Inventory ?? 0)) {
      cancelEdit();
      return;
    }

    setSaving(true);
    try {
      await onSave(String(item.Code ?? ""), next);
      setEditing(false);
    } catch (e: any) {
      alert(e?.message || "Failed to update inventory.");
      setVal(String(item.Inventory ?? 0));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {Number(item.Inventory ?? 0)}
        <button
          className="secondary"
          onClick={startEdit}
          style={{ padding: "2px 8px", fontSize: 12 }}
          title="Edit inventory"
        >
          Edit
        </button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        min={0}
        value={val}
        disabled={saving}
        autoFocus
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancelEdit();
        }}
        style={{
          width: 80,
          height: 32,
          padding: "0 8px",
          border: "1px solid #ccc",
          borderRadius: 6,
          fontSize: 14,
        }}
      />
      <button
        className="primary"
        onClick={commit}
        disabled={saving}
        style={{ padding: "4px 10px", fontSize: 12 }}
        title="Save inventory"
      >
        ✓
      </button>
      <button
        className="secondary"
        onClick={cancelEdit}
        disabled={saving}
        style={{ padding: "4px 10px", fontSize: 12 }}
        title="Cancel"
      >
        ✕
      </button>
    </span>
  );
}

export default function Store({
  items = [],
  onRefresh,
  handleFileUpload,
  onCreateItem,
  onUpdateItem,
  onUpdateInventory,
  onDeleteItem,
  onBulkCreateItems,
  onUploadStock,
  readOnly = false,
  refreshing = false,
}: StoreProps) {
  const [query, setQuery] = useState("");
  const [stockBusy, setStockBusy] = useState(false);
  const [stockNotice, setStockNotice] = useState<string | null>(null);

  const [compareBusy, setCompareBusy] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareRows, setCompareRows] = useState<CompareRow[]>([]);
  const [compareMessage, setCompareMessage] = useState<string | null>(null);
  const compareInputRef = useRef<HTMLInputElement | null>(null);

  const emptyForm = {
    Code: "",
    MMScode: "",
    Title: "",
    Saleprice: "",
    Type: "",
    Inventory: "",
  };

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCode, setConfirmCode] = useState<string | null>(null);

  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [newImportItems, setNewImportItems] = useState<Item[]>([]);
  const [existingImportItems, setExistingImportItems] = useState<Item[]>([]);
  const [importDuplicatesInFile, setImportDuplicatesInFile] = useState<Item[]>([]);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const parseMoney = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = parseFloat(String(v).replace(/[^\d.-]/g, "").trim());
    return Number.isFinite(n) ? n : null;
  };

  const normalizeKeyPart = (v: unknown) => String(v ?? "").trim().toLowerCase();

  const normalizeMms = (v: unknown) => normalizeKeyPart(v).replace(/\.0$/, "");

  const storeByMms = useMemo(() => {
    const map = new Map<string, Item>();
    for (const it of items) {
      const key = normalizeMms(it.MMScode);
      if (key && !map.has(key)) map.set(key, it);
    }
    return map;
  }, [items]);

  const getCompositeKey = (code: unknown, mms: unknown) =>
    `${normalizeKeyPart(mms)}|${normalizeKeyPart(code)}`;

  const itemKeySet = useMemo(
    () => new Set(items.map((it) => getCompositeKey(it.Code, it.MMScode))),
    [items]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const list = q
      ? items.filter((it) => {
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
        })
      : [...items];

    // Items still missing a sale price float to the top.
    return list.sort(
      (a, b) => (needsPrice(a) ? 0 : 1) - (needsPrice(b) ? 0 : 1)
    );
  }, [items, query]);

  const missingPriceItems = useMemo(
    () => items.filter((it) => needsPrice(it)),
    [items]
  );

  const downloadExcel = () => {
    const headers: Array<
      "Code" | "MMScode" | "Title" | "Saleprice" | "Type" | "Inventory"
    > = ["Code", "MMScode", "Title", "Saleprice", "Type", "Inventory"];

    const rows: Array<{
      Code: string;
      MMScode: string;
      Title: string;
      Saleprice: number | null;
      Type: string;
      Inventory: number;
    }> = items.map((it) => ({
      Code: it.Code ?? "",
      MMScode: it.MMScode ?? "",
      Title: it.Title ?? "",
      Saleprice: parseMoney(it.Saleprice),
      Type: it.Type ?? "",
      Inventory: toInventory(it.Inventory),
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

  const bulkCreateItemsDefault = async (payloads: Item[]) => {
    const res = await fetch(`/api/items/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ items: payloads }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.error || `Bulk import failed (${res.status})`);
    }
  };

  const updateInventoryDefault = async (code: string, inventory: number) => {
    const res = await fetch(`/api/items/${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ Inventory: inventory }),
    });
    if (!res.ok) throw new Error(`Inventory update failed (${res.status})`);
  };

  const uploadStockDefault = async (rows: StockRow[]) => {
    const res = await fetch(`/api/items/stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ rows }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || `Stock upload failed (${res.status})`);
    }
    return data as StockUploadResult;
  };

  const createItem = onCreateItem || createItemDefault;
  const updateItem = onUpdateItem || updateItemDefault;
  const updateInventory = onUpdateInventory || updateInventoryDefault;
  const deleteItem = onDeleteItem || deleteItemDefault;
  const bulkCreateItems = onBulkCreateItems || bulkCreateItemsDefault;
  const uploadStock = onUploadStock || uploadStockDefault;

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
      Inventory: it.Inventory ?? "",
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

    if (
      mode === "add" &&
      itemKeySet.has(getCompositeKey(form.Code, form.MMScode))
    ) {
      return `Item with MMS Code "${form.MMScode}" and Code "${form.Code}" already exists.`;
    }

    if (
      String(form.Saleprice).trim() !== "" &&
      parseMoney(form.Saleprice) === null
    ) {
      return "Saleprice must be a number (or leave blank).";
    }

    if (String(form.Inventory).trim() !== "") {
      const n = Number(String(form.Inventory).trim());
      if (!Number.isFinite(n) || n < 0) {
        return "Inventory must be a non-negative number (or leave blank).";
      }
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
        Inventory:
          String(form.Inventory).trim() === ""
            ? undefined
            : toInventory(form.Inventory),
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

  const handleImportWithComparison = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    try {
      setImportMessage(null);

      const file = e.target.files?.[0];
      if (!file) return;

      if (typeof handleFileUpload === "function") {
        try {
          handleFileUpload(e);
        } catch {
          // keep old prop optional and non-blocking
        }
      }

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, {
        defval: "",
      });

      if (!rawRows.length) {
        alert("The uploaded file is empty.");
        e.target.value = "";
        return;
      }

      const parsedRows: Item[] = rawRows.map((row) => ({
        Code: String(row.Code ?? "").trim(),
        MMScode: String(row.MMScode ?? row["MMS Code"] ?? "").trim(),
        Title: String(row.Title ?? "").trim(),
        Saleprice:
          String(row.Saleprice ?? "").trim() === ""
            ? null
            : parseMoney(row.Saleprice),
        Type: String(row.Type ?? "").trim(),
        Inventory: toInventory(row.Inventory ?? row.Stock ?? row.stock ?? 0),
      }));

      const existingKeySet = new Set(
        items.map((it) => getCompositeKey(it.Code, it.MMScode))
      );

      const seenUploadKeys = new Set<string>();
      const newItems: Item[] = [];
      const existingItems: Item[] = [];
      const duplicateItemsInFile: Item[] = [];

      for (const row of parsedRows) {
        const code = String(row.Code ?? "").trim();
        const mms = String(row.MMScode ?? "").trim();

        if (!code && !mms) continue;

        const key = getCompositeKey(code, mms);

        if (seenUploadKeys.has(key)) {
          duplicateItemsInFile.push(row);
          continue;
        }

        seenUploadKeys.add(key);

        if (existingKeySet.has(key)) {
          existingItems.push(row);
        } else {
          newItems.push(row);
        }
      }

      setExistingImportItems(existingItems);
      setNewImportItems(newItems);
      setImportDuplicatesInFile(duplicateItemsInFile);

      if (newItems.length === 0) {
        alert(
          `All uploaded items already exist in the database. Existing matches: ${existingItems.length}`
        );
        e.target.value = "";
        return;
      }

      setImportConfirmOpen(true);
    } catch (error: any) {
      alert(error?.message || "Failed to read uploaded file.");
    } finally {
      e.target.value = "";
    }
  };

  const closeImportConfirm = () => {
    if (!importBusy) {
      setImportConfirmOpen(false);
      setNewImportItems([]);
      setExistingImportItems([]);
      setImportDuplicatesInFile([]);
      setImportMessage(null);
    }
  };

  const confirmImportNewItems = async () => {
    if (!newImportItems.length) return;

    setImportBusy(true);
    setImportMessage(null);

    try {
      await bulkCreateItems(newImportItems);
      setImportConfirmOpen(false);
      setNewImportItems([]);
      setExistingImportItems([]);
      setImportDuplicatesInFile([]);
      if (typeof onRefresh === "function") onRefresh();
      alert(`${newImportItems.length} new item(s) added successfully.`);
    } catch (error: any) {
      setImportMessage(error?.message || "Import failed.");
    } finally {
      setImportBusy(false);
    }
  };

  const handleStockUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setStockBusy(true);
    setStockNotice(null);

    const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: true,
        defval: "",
        blankrows: false,
      });

      let headerIdx = -1;
      let colItemNo = -1;
      let colItemName = -1;
      let colQty = -1;

      for (let r = 0; r < grid.length; r++) {
        const row = (grid[r] || []).map(norm);
        const iNo = row.indexOf("item no");
        const iQty = row.indexOf("quantity");
        if (iNo >= 0 && iQty >= 0) {
          headerIdx = r;
          colItemNo = iNo;
          colQty = iQty;
          colItemName = row.indexOf("item name");
          break;
        }
      }

      if (headerIdx < 0) {
        throw new Error(
          "Could not find 'Item No' and 'Quantity' columns in the file."
        );
      }

      const rows: StockRow[] = [];

      for (let r = headerIdx + 1; r < grid.length; r++) {
        const row = grid[r] || [];
        const itemNo = String(row[colItemNo] ?? "").trim();
        const qty = Math.floor(
          Number(String(row[colQty] ?? "").replace(/[^\d.-]/g, "")) || 0
        );

        if (!itemNo || qty <= 0) continue;

        const itemName = colItemName >= 0 ? row[colItemName] : "";
        const parsed = parseItemName(itemName, itemNo);

        rows.push({
          MMScode: itemNo,
          qty,
          Code: parsed.Code,
          Title: parsed.Title,
          Type: parsed.Type,
        });
      }

      if (rows.length === 0) {
        throw new Error("No valid stock rows found in the file.");
      }

      const result = await uploadStock(rows);
      const updated = result?.updated ?? 0;
      const created = result?.created ?? 0;
      const needsPrice = result?.needsPrice ?? [];

      let msg = `✅ Stock updated: ${updated} item(s) increased`;
      if (created > 0) msg += `, ${created} new item(s) added`;
      msg += ".";
      if (needsPrice.length > 0) {
        msg += ` ⚠️ Please add sale price for: ${needsPrice.join(", ")}`;
      }

      setStockNotice(msg);
      alert(msg);
      if (typeof onRefresh === "function") onRefresh();
    } catch (error: any) {
      alert(error?.message || "Failed to upload stock file.");
    } finally {
      setStockBusy(false);
    }
  };

  const handleCompareUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setCompareBusy(true);
    setCompareMessage(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: true,
        defval: "",
        blankrows: false,
      });

      const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

      let headerIdx = -1;
      let colItemNo = -1;
      let colItemName = -1;
      let colQty = -1;

      for (let r = 0; r < grid.length; r++) {
        const row = (grid[r] || []).map(norm);
        const iNo = row.indexOf("item number");
        const iQty = row.indexOf("opening qty");
        if (iNo >= 0 && iQty >= 0) {
          headerIdx = r;
          colItemNo = iNo;
          colQty = iQty;
          colItemName = row.indexOf("item");
          break;
        }
      }

      if (headerIdx < 0) {
        throw new Error(
          "Could not find 'Item Number' and 'Opening Qty' columns in the file."
        );
      }

      const rows: CompareRow[] = [];

      for (let r = headerIdx + 1; r < grid.length; r++) {
        const row = grid[r] || [];
        const itemNo = String(row[colItemNo] ?? "").trim();
        if (!itemNo) continue;
        if (norm(itemNo).includes("summary")) continue;

        const name =
          colItemName >= 0 ? String(row[colItemName] ?? "").trim() : "";
        const fileQty = Math.max(
          0,
          Math.floor(
            Number(String(row[colQty] ?? "").replace(/[^\d.-]/g, "")) || 0
          )
        );

        const storeItem = storeByMms.get(normalizeMms(itemNo));

        if (!storeItem) {
          rows.push({
            itemNo,
            name,
            fileQty,
            storeQty: null,
            diff: fileQty,
            missing: true,
          });
        } else {
          const storeQty = Number(storeItem.Inventory ?? 0);
          const diff = fileQty - storeQty;
          if (diff !== 0) {
            rows.push({
              itemNo,
              name: String(storeItem.Title ?? "") || name,
              fileQty,
              storeQty,
              diff,
              missing: false,
            });
          }
        }
      }

      if (rows.length === 0) {
        setCompareMessage("✅ No discrepancies found — file matches the store.");
        setCompareRows([]);
        setCompareOpen(true);
        return;
      }

      setCompareRows(rows);
      setCompareOpen(true);
    } catch (error: any) {
      alert(error?.message || "Failed to read compare file.");
    } finally {
      setCompareBusy(false);
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
        if (importConfirmOpen) closeImportConfirm();
        if (compareOpen) setCompareOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, confirmOpen, importConfirmOpen, compareOpen, busy, importBusy]);

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
        <h3 style={{ margin: 0 }}>
          📦 Store{readOnly ? " — Read Only" : ""}
        </h3>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!readOnly && (
            <>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleImportWithComparison}
                title="Choose Excel file to import"
              />
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#0d6efd",
                  whiteSpace: "nowrap",
                }}
              >
                Stock In:
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleStockUpload}
                  disabled={stockBusy}
                  title="Upload stock receipt (Item No + Quantity)"
                />
              </label>
            </>
          )}
          {typeof onRefresh === "function" && (
            <button
              onClick={onRefresh}
              className="primary"
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh Items"}
            </button>
          )}
          <input
            ref={compareInputRef}
            type="file"
            accept=".csv, .xlsx, .xls"
            style={{ display: "none" }}
            onChange={handleCompareUpload}
          />
          <button
            onClick={() => compareInputRef.current?.click()}
            className="secondary"
            style={{ backgroundColor: "#7b1fa2", color: "white" }}
            disabled={compareBusy}
            title="Compare stock report (Item Number + Opening Qty) with store inventory"
          >
            {compareBusy ? "Comparing…" : "Compare File"}
          </button>
          <button
            onClick={downloadExcel}
            className="secondary"
            style={{ backgroundColor: "green", color: "white" }}
          >
            Download Items (Excel)
          </button>
          {!readOnly && (
            <button
              onClick={openAdd}
              className="secondary"
              style={{ backgroundColor: "#0d6efd", color: "white" }}
            >
              + Add Item
            </button>
          )}
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

      {missingPriceItems.length > 0 && (
        <div
          style={{
            margin: "0 0 10px",
            padding: "8px 12px",
            borderRadius: 8,
            background: "#fff3cd",
            border: "1px solid #ffe69c",
            color: "#664d03",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ⚠️ {missingPriceItems.length} item(s) need a sale price. Click “Set
          price” in the Sale Price column to add it.
        </div>
      )}

      {stockNotice && (
        <div
          style={{
            margin: "0 0 10px",
            padding: "10px 12px",
            borderRadius: 8,
            background: "#d1e7dd",
            border: "1px solid #badbcc",
            color: "#0f5132",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13 }}>{stockNotice}</span>
          <button
            className="secondary"
            style={{ padding: "2px 8px" }}
            onClick={() => setStockNotice(null)}
          >
            ✕
          </button>
        </div>
      )}

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
              color: "#000",
            }}
          >
            <tr>
              <th style={th}>#</th>
              <th style={th}>Code</th>
              <th style={th}>MMS Code</th>
              <th style={th}>Title</th>
              <th style={th}>Sale Price</th>
              <th style={th}>Inventory</th>
              <th style={th}>Type</th>
              {!readOnly && <th style={th}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((it, idx) => (
              <tr
                key={`${it.MMScode ?? ""}-${it.Code ?? ""}-${idx}`}
                style={{ borderTop: "1px solid #f1f1f1" }}
              >
                <td style={td}>{idx + 1}</td>
                <td style={tdMono}>{it.Code}</td>
                <td style={tdMono}>{it.MMScode}</td>
                <td style={td}>{it.Title}</td>
                <td style={td}>
                  {it.Saleprice !== undefined &&
                  it.Saleprice !== null &&
                  String(it.Saleprice) !== "" ? (
                    `₹${Number(it.Saleprice).toFixed(2)}`
                  ) : readOnly ? (
                    "—"
                  ) : (
                    <button
                      className="secondary"
                      onClick={() => openEdit(it)}
                      style={{
                        backgroundColor: "#ff9800",
                        color: "white",
                        padding: "4px 8px",
                        fontSize: 12,
                      }}
                      title="Add sale price"
                    >
                      Set price
                    </button>
                  )}
                </td>
                <td style={td}>
                  {readOnly ? (
                    Number(it.Inventory ?? 0)
                  ) : (
                    <StockCell
                      item={it}
                      onSave={async (code, inventory) => {
                        await updateInventory(code, inventory);
                        if (typeof onRefresh === "function") onRefresh();
                      }}
                    />
                  )}
                </td>
                <td style={td}>{it.Type}</td>
                {!readOnly && (
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
                )}
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={readOnly ? 7 : 8}
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
                  placeholder="Code"
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
                <label style={label}>Inventory (stock)</label>
                <input
                  name="Inventory"
                  value={form.Inventory}
                  onChange={onFormChange}
                  placeholder="e.g. 50"
                  style={input}
                  inputMode="numeric"
                  min={0}
                  type="number"
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

      {importConfirmOpen && (
        <div style={backdropStyle} onMouseDown={closeImportConfirm}>
          <div
            style={{ ...confirmModalStyle, width: "min(700px, 100%)" }}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h4 style={{ margin: 0 }}>Import Store Items</h4>

            <p style={{ ...confirmText, marginTop: 12 }}>
              <strong>{existingImportItems.length}</strong> item(s) already exist
              in the database based on <strong>MMScode + Code</strong>.
              <br />
              <strong>{newImportItems.length}</strong> item(s) are new.
              {importDuplicatesInFile.length > 0 && (
                <>
                  <br />
                  <strong>{importDuplicatesInFile.length}</strong> duplicate row(s)
                  were also found inside the uploaded file and will be skipped.
                </>
              )}
              <br />
              Do you want to add only the new items?
            </p>

            {existingImportItems.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  maxHeight: 160,
                  overflow: "auto",
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: 8,
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  Already existing items
                </div>
                {existingImportItems.map((it, idx) => (
                  <div key={`existing-${it.MMScode}-${it.Code}-${idx}`}>
                    {it.MMScode} | {it.Code} | {it.Title}
                  </div>
                ))}
              </div>
            )}

            {importDuplicatesInFile.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  maxHeight: 160,
                  overflow: "auto",
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: 8,
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  Duplicate rows inside uploaded file
                </div>
                {importDuplicatesInFile.map((it, idx) => (
                  <div key={`dup-${it.MMScode}-${it.Code}-${idx}`}>
                    {it.MMScode} | {it.Code} | {it.Title}
                  </div>
                ))}
              </div>
            )}

            {newImportItems.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  maxHeight: 180,
                  overflow: "auto",
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: 8,
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  New items to be added
                </div>
                {newImportItems.map((it, idx) => (
                  <div key={`new-${it.MMScode}-${it.Code}-${idx}`}>
                    {it.MMScode} | {it.Code} | {it.Title}
                  </div>
                ))}
              </div>
            )}

            {importMessage && (
              <div style={{ marginTop: 10, color: "#b00020", fontSize: 13 }}>
                {importMessage}
              </div>
            )}

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
                onClick={closeImportConfirm}
                disabled={importBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={confirmImportNewItems}
                disabled={importBusy || newImportItems.length === 0}
                style={{ backgroundColor: "#0d6efd", color: "white" }}
              >
                {importBusy
                  ? "Importing..."
                  : `Add ${newImportItems.length} New Item(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {compareOpen && (
        <div style={backdropStyle} onMouseDown={() => setCompareOpen(false)}>
          <div
            style={{ ...confirmModalStyle, width: "min(860px, 100%)" }}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h4 style={{ margin: 0 }}>Store vs File — Discrepancies</h4>

            {compareMessage && (
              <p style={{ ...confirmText, marginTop: 12 }}>{compareMessage}</p>
            )}

            <p style={{ ...confirmText, marginTop: 12 }}>
              Compared <strong>Item Number (file) ↔ MMS Code (store)</strong> and
              <strong> Opening Qty (file) ↔ Inventory (store)</strong>.
              {compareRows.length > 0 && (
                <>
                  <br />
                  <strong>{compareRows.length}</strong> discrepancy row(s)
                  found.
                </>
              )}
            </p>

            {compareRows.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  maxHeight: 420,
                  overflow: "auto",
                  border: "1px solid #eee",
                  borderRadius: 8,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th2}>Item No</th>
                      <th style={th2}>Name</th>
                      <th style={th2}>File Qty</th>
                      <th style={th2}>Store Qty</th>
                      <th style={th2}>Diff</th>
                      <th style={th2}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((r, idx) => (
                      <tr key={`${r.itemNo}-${idx}`}>
                        <td style={tdMono}>{r.itemNo}</td>
                        <td style={td}>{r.name}</td>
                        <td style={{ ...td, textAlign: "right" }}>{r.fileQty}</td>
                        <td style={{ ...td, textAlign: "right" }}>
                          {r.storeQty ?? "—"}
                        </td>
                        <td
                          style={{
                            ...td,
                            textAlign: "right",
                            fontWeight: 700,
                            color: r.missing ? "#b00020" : "#e65100",
                          }}
                        >
                          {r.missing ? "—" : r.diff > 0 ? `+${r.diff}` : r.diff}
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          {r.missing ? (
                            <span style={{ color: "#b00020", fontWeight: 600 }}>
                              Not in store
                            </span>
                          ) : (
                            <span style={{ color: "#e65100", fontWeight: 600 }}>
                              Qty mismatch
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

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
                className="primary"
                onClick={() => setCompareOpen(false)}
              >
                Close
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

const th2: React.CSSProperties = {
  ...th,
  padding: "8px 10px",
  fontSize: 13,
  position: "sticky",
  top: 0,
  background: "white",
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