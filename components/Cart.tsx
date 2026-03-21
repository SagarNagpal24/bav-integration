"use client";

import React from "react";

export type CartItem = {
  Code: string;
  MMScode?: string;
  Title?: string;
  Saleprice?: number | null;
  Type?: string;
  qty: number;
};

type CartProps = {
  cart: CartItem[];
  updateQty: (code: string, qty: number) => void;
  removeFromCart: (code: string) => void;
  todayTotal?: number;
};

export default function Cart({
  cart,
  updateQty,
  removeFromCart,
  todayTotal = 0,
}: CartProps) {
  return (
    <div className="cart">
      <h3
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Cart</span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>
          Total Sale Today : ₹{Number(todayTotal || 0).toFixed(2)}
        </span>
      </h3>

      <table>
        <thead>
          <tr>
            <th>S.No.</th>
            <th>Code</th>
            <th>MMScode</th>
            <th>Title</th>
            <th>Saleprice</th>
            <th>Type</th>
            <th>Qty</th>
            <th>Total</th>
            <th>Remove</th>
          </tr>
        </thead>

        <tbody>
          {cart.map((c, idx) => (
            <tr key={idx}>
              <td>{idx + 1}</td>
              <td>{c.Code}</td>
              <td>{c.MMScode}</td>
              <td>{c.Title}</td>
              <td>₹{Number(c.Saleprice || 0).toFixed(2)}</td>
              <td>{c.Type}</td>

              <td>
                <input
                  type="number"
                  value={c.qty}
                  min={1}
                  onChange={(e) =>
                    updateQty(c.Code, parseInt(e.target.value) || 1)
                  }
                />
              </td>

              <td>₹{((c.Saleprice || 0) * c.qty).toFixed(2)}</td>

              <td>
                <button onClick={() => removeFromCart(c.Code)}>❌</button>
              </td>
            </tr>
          ))}

          {cart.length === 0 && (
            <tr>
              <td colSpan={9} style={{ textAlign: "center", padding: "12px" }}>
                Cart is empty
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}