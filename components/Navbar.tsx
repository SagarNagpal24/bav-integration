"use client";

import React from "react";

export type User = {
  email?: string;
  name?: string;
  picture?: string;
  role?: string | null;
};

type NavbarProps = {
  view: string;
  setView: (view: string) => void;
  user?: User | null;
  onLogout?: () => void;
};

export const ROLE_LABELS: Record<string, string> = {
  shop: "Shop POS",
  stall: "Stall POS",
  admin: "Admin",
};

export default function Navbar({
  view,
  setView,
  user,
  onLogout,
}: NavbarProps) {
  return (
    <nav className="navbar">
      <h2>
        📑 BAV Billing App
        {user?.role && ROLE_LABELS[user.role] ? (
          <span
            style={{
              marginLeft: 10,
              fontSize: 13,
              padding: "3px 10px",
              borderRadius: 999,
              background:
                user.role === "admin" ? "#4a148c" : user.role === "shop" ? "#1b5e20" : "#e65100",
              color: "white",
              verticalAlign: "middle",
            }}
          >
            {ROLE_LABELS[user.role]}
          </span>
        ) : null}
      </h2>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div className="nav-links">
          <button
            className={view === "billing" ? "active" : ""}
            onClick={() => setView("billing")}
          >
            Billing
          </button>
          <button
            className={view === "report" ? "active" : ""}
            onClick={() => setView("report")}
          >
            Report
          </button>
          <button
            className={view === "summary" ? "active" : ""}
            onClick={() => setView("summary")}
          >
            Summary
          </button>
          <button
            className={view === "store" ? "active" : ""}
            onClick={() => setView("store")}
          >
            Store
          </button>
        </div>

        {(user || onLogout) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginLeft: "10px",
            }}
          >
            {user?.picture && (
              <img
                src={user.picture}
                alt={user?.name || "User"}
                width={32}
                height={32}
                style={{
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
              />
            )}

            {user?.email && (
              <span style={{ fontSize: "14px", fontWeight: "500" }}>
                {user.email}
              </span>
            )}

            {onLogout && <button onClick={onLogout}>Logout</button>}
          </div>
        )}
      </div>
    </nav>
  );
}