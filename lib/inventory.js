import Item from "@/models/Item";

export const billItemDeltas = (items, sign = -1) =>
  (Array.isArray(items) ? items : []).map((it) => ({
    Code: it?.Code,
    delta: sign * Math.max(0, Math.floor(Number(it?.qty) || 0)),
  }));

export async function applyInventoryDelta(entries = []) {
  const map = new Map();

  for (const e of entries) {
    const Code = String(e?.Code ?? "").trim();
    const delta = Math.trunc(Number(e?.delta) || 0);
    if (!Code || delta === 0) continue;
    map.set(Code, (map.get(Code) || 0) + delta);
  }

  if (map.size === 0) return;

  const ops = [...map.entries()].map(([Code, delta]) => ({
    updateOne: {
      filter: { Code },
      update: { $inc: { Inventory: delta } },
    },
  }));

  await Item.bulkWrite(ops, { ordered: false });
}
