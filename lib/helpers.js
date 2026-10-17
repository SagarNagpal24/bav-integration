export const parseMoney = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, "").trim());
  return Number.isFinite(n) ? n : null;
};

export const parseQty = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(String(v).replace(/[^\d.-]/g, "").trim()));
  return Number.isFinite(n) ? Math.max(0, n) : null;
};

export const normalizeItem = (payload = {}) => {
  const out = {
    Code: String(payload.Code ?? "").trim(),
    MMScode: String(payload.MMScode ?? "").trim(),
    Title: String(payload.Title ?? "").trim(),
    Type: String(payload.Type ?? "").trim(),
  };
  const sp = parseMoney(payload.Saleprice);
  out.Saleprice = sp === null ? null : sp;

  // Only include Inventory when the caller actually provided it, so bulk
  // upserts (e.g. Excel imports that omit stock) don't wipe existing stock.
  const inv = parseQty(payload.Inventory);
  if (inv !== null) out.Inventory = inv;

  return out;
};

export const normalizeBillPayload = (payload = {}) => {
  const rawItems = Array.isArray(payload.items) ? payload.items : [];

  const items = rawItems
    .map((raw) => {
      const base = normalizeItem(raw);
      const qty = Math.max(0, Math.floor(Number(raw?.qty ?? 0)));
      return {
        ...base,
        qty,
      };
    })
    .filter(
      (it) =>
        it.Code ||
        it.MMScode ||
        it.Title ||
        it.Type ||
        it.qty > 0 ||
        Number(it.Saleprice || 0) > 0
    );

  const computedTotal = items.reduce(
    (sum, it) => sum + (Number(it.Saleprice) || 0) * (Number(it.qty) || 0),
    0
  );

  const normalizedTotal =
    typeof payload.total === "number" && Number.isFinite(payload.total)
      ? payload.total
      : computedTotal;

  const counterRaw = String(payload.counter ?? "").toLowerCase();
  const normalized = {
    date: String(payload.date ?? "").trim(),
    items,
    total: normalizedTotal,
  };

  if (["shop", "stall", "admin"].includes(counterRaw)) {
    normalized.counter = counterRaw;
  }

  return normalized;
};