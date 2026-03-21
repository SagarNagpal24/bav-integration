"use client";

import React, { useEffect, useState } from "react";

type BillItem = {
  Type?: string;
  qty?: number;
  Saleprice?: number;
};

type Bill = {
  date?: string;
  items?: BillItem[];
};

type CategorySummary = {
  qty: number;
  amount: number;
};

export default function Summary() {
  const [bills, setBills] = useState<Bill[]>([]);

  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [alertMsg, setAlertMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        let url = `/api/bills`;

        if (startDate && endDate) {
          url = `/api/bills?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`;
        } else if (startDate) {
          url = `/api/bills?date=${encodeURIComponent(startDate)}`;
        } else if (endDate) {
          url = `/api/bills?date=${encodeURIComponent(endDate)}`;
        }

        const res = await fetch(url, { credentials: "include" });
        let data = await res.json();
        if (!Array.isArray(data)) data = [];

        if (startDate && endDate) {
          const s = new Date(startDate);
          const e = new Date(endDate);
          s.setHours(0, 0, 0, 0);
          e.setHours(0, 0, 0, 0);

          data = data.filter((b: Bill) => {
            const d = new Date(b?.date || "");
            d.setHours(0, 0, 0, 0);
            return d >= s && d <= e;
          });
        }

        setBills(data);
      } catch {
        setBills([]);
        setAlertMsg("❌ Failed to load summary from server");
      }
    };

    load();
  }, [startDate, endDate]);

  const summary: Record<string, CategorySummary> = {};

  bills.forEach((bill) => {
    (bill.items || []).forEach((item) => {
      const category = item.Type || "Other";
      if (!summary[category]) {
        summary[category] = { qty: 0, amount: 0 };
      }
      summary[category].qty += Number(item.qty || 0);
      summary[category].amount +=
        Number(item.Saleprice || 0) * Number(item.qty || 0);
    });
  });

  const grandQty = Object.values(summary).reduce((s, c) => s + c.qty, 0);
  const grandAmt = Object.values(summary).reduce((s, c) => s + c.amount, 0);

  const resetToToday = () => {
    setStartDate(today);
    setEndDate(today);
  };

  const showAll = () => {
    setStartDate("");
    setEndDate("");
  };

  return (
    <div className="container">
      <h2>Summary</h2>

      {alertMsg && (
        <div
          style={{
            background: "#c62828",
            color: "white",
            padding: "8px 12px",
            borderRadius: 6,
            display: "inline-block",
            marginBottom: 10,
          }}
        >
          {alertMsg}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <label>
          <b>Start Date:</b>
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />

        <label>
          <b>End Date:</b>
        </label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />

        <button onClick={resetToToday}>Today</button>
        <button onClick={showAll}>Show All</button>
      </div>

      <div style={{ marginTop: 8, color: "#555" }}>
        Showing:{" "}
        {startDate && endDate
          ? `${startDate} → ${endDate}`
          : startDate
          ? startDate
          : endDate
          ? endDate
          : "All dates"}{" "}
        ({bills.length} bill{bills.length === 1 ? "" : "s"})
      </div>

      {Object.keys(summary).length === 0 ? (
        <p style={{ marginTop: 16 }}>No data found for this selection.</p>
      ) : (
        <table
          border={1}
          cellPadding={8}
          style={{ width: "50%", margin: "20px auto" }}
        >
          <thead>
            <tr>
              <th>Category</th>
              <th>Quantity</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(summary).map((cat, idx) => (
              <tr key={idx}>
                <td>{cat}</td>
                <td>{summary[cat].qty}</td>
                <td>₹{summary[cat].amount.toFixed(2)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: "bold", background: "#f1f1f1" }}>
              <td>Total</td>
              <td>{grandQty}</td>
              <td>₹{grandAmt.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}