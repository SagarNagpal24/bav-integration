"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import Cart, { type CartItem } from "./Cart";
import Navbar, { type User } from "./Navbar";
import Report from "./Report";
import Summary from "./Summary";
import Store from "./Store";
import Login from "./Login";

type Item = {
  Code: string;
  MMScode?: string;
  Title?: string;
  Saleprice?: number | null;
  Type?: string;
};

function BillingApp({
  user,
  onLogout,
}: {
  user: User | null;
  onLogout: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [view, setView] = useState("billing");
  const [alertMsg, setAlertMsg] = useState("");
  const [suggestions, setSuggestions] = useState<Item[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [todayTotal, setTodayTotal] = useState(0);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const genIdemKey = () =>
    crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/items`, {
        credentials: "include",
      });

      if (res.status === 401) {
        setAlertMsg("❌ Session expired. Please login again.");
        return;
      }

      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setAlertMsg("❌ Failed to load items from server");
    }
  }, []);

  const fetchTodayTotal = useCallback(async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/bills?date=${today}`, {
        credentials: "include",
      });

      if (!res.ok) return;

      const data = await res.json();
      const sum = Array.isArray(data)
        ? data.reduce((acc: number, b: any) => acc + (b.total || 0), 0)
        : 0;

      setTodayTotal(sum);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    fetchTodayTotal();
  }, [fetchItems, fetchTodayTotal]);

  useEffect(() => {
    if (!alertMsg) return;
    const t = setTimeout(() => setAlertMsg(""), 3000);
    return () => clearTimeout(t);
  }, [alertMsg]);

  const requestClearCart = useCallback(() => {
    if (cart.length === 0) {
      setAlertMsg("⚠️ Cart is already empty.");
      return;
    }
    setConfirmOpen(true);
  }, [cart.length]);

  const performClearCart = useCallback(() => {
    setCart([]);
    setSuggestions([]);
    setHighlightIndex(-1);
    setCodeInput("");
    setAlertMsg("🗑️ Cart cleared!");
    setConfirmOpen(false);
    inputRef.current?.focus();
  }, []);

  const cancelClearCart = useCallback(() => {
    setConfirmOpen(false);
    inputRef.current?.focus();
  }, []);

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const readFile = (f: File) =>
      new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(f);
      });

    const parseMoney = (v: unknown) => {
      if (v === null || v === undefined) return 0;
      const n = parseFloat(String(v).replace(/[^\d.-]/g, "").trim());
      return Number.isFinite(n) ? n : 0;
    };

    try {
      const ab = await readFile(file);
      const wb = XLSX.read(ab, { type: "array", cellDates: true });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];

      let rows = XLSX.utils.sheet_to_json(ws, {
        defval: "",
        raw: true,
        blankrows: false,
      }) as Record<string, any>[];

      if (!Array.isArray(rows) || rows.length === 0) {
        setAlertMsg("⚠️ No rows found in sheet.");
        return;
      }

      const normalizeKey = (k: string) =>
        String(k).trim().replace(/\s+/g, " ").toLowerCase();

      rows = rows.map((r) => {
        const norm: Record<string, any> = {};
        for (const [k, v] of Object.entries(r)) {
          norm[normalizeKey(k)] = v;
        }
        return norm;
      });

      const cleaned: Item[] = rows
        .map((r) => {
          const priceRaw =
            r["saleprice"] ??
            r["sale price"] ??
            r["sale_price"] ??
            r["selling price"] ??
            r["selling_price"] ??
            r["price"] ??
            r["mrp"] ??
            r["rate"] ??
            r["amount"];

          return {
            Code: r["code"] || r["item code"] || r["barcode"] || "",
            MMScode: r["mms code"] || r["mmscode"] || r["mms"] || "",
            Title: r["title"] || r["name"] || r["item name"] || "",
            Saleprice: parseMoney(priceRaw),
            Type: r["type"] || r["category"] || "",
          };
        })
        .filter((r) => String(r.Code).trim() || String(r.Title).trim());

      if (cleaned.length === 0) {
        setAlertMsg("⚠️ No valid rows after cleaning (missing Code/Title?).");
        return;
      }

      setItems(cleaned);

      const chunkSize = 500;
      for (let i = 0; i < cleaned.length; i += chunkSize) {
        const slice = cleaned.slice(i, i + chunkSize);
        const resp = await fetch(`/api/items/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ items: slice }),
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new Error(
            `Bulk upsert failed at rows ${i}-${i + slice.length - 1}. ${text}`
          );
        }
      }

      await fetchItems();
      setAlertMsg("✅ Items uploaded to database");
    } catch (err) {
      console.error(err);
      setAlertMsg("❌ Failed to import Excel to database");
    }
  };

  const addToCart = (item: Item) => {
    const existing = cart.find((c) => c.Code === item.Code);

    if (existing) {
      setCart(
        cart.map((c) =>
          c.Code === item.Code ? { ...c, qty: c.qty + 1 } : c
        )
      );
    } else {
      const cartItem: CartItem = {
        Code: item.Code,
        MMScode: item.MMScode,
        Title: item.Title,
        Saleprice: item.Saleprice ?? null,
        Type: item.Type,
        qty: 1,
      };
      setCart([...cart, cartItem]);
    }

    setSuggestions([]);
    setHighlightIndex(-1);
    setCodeInput("");
    inputRef.current?.focus();
  };

  const updateQty = (code: string, qty: number) =>
    setCart(
      cart.map((c) => (c.Code === code ? { ...c, qty: qty || 1 } : c))
    );

  const removeFromCart = (code: string) =>
    setCart(cart.filter((c) => c.Code !== code));

  const runSuggestions = useCallback(
    (input: string) => {
      if (!input.trim()) {
        setSuggestions([]);
        setHighlightIndex(-1);
        return;
      }

      const search = input.toLowerCase();

      const matches = items.filter((it) => {
        const code = String(it.Code || "").toLowerCase();
        const mms = String(it.MMScode || "").toLowerCase();
        const title = String(it.Title || "").toLowerCase();
        return (
          code.includes(search) ||
          mms.includes(search) ||
          title.includes(search)
        );
      });

      setSuggestions(matches.slice(0, 8));
      setHighlightIndex(-1);
    },
    [items]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setCodeInput(input);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      runSuggestions(input);
    }, 250);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      addToCart(suggestions[highlightIndex]);
    }
  };

  const handleCodeSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const input = codeInput.trim().toLowerCase();

    if (highlightIndex >= 0 && suggestions[highlightIndex]) {
      addToCart(suggestions[highlightIndex]);
      return;
    }

    const found = items.find((it) => {
      const code = String(it.Code || "").toLowerCase();
      const mms = String(it.MMScode || "").toLowerCase();
      const title = String(it.Title || "").toLowerCase();
      return code === input || mms === input || title === input;
    });

    if (found) {
      addToCart(found);
    } else if (suggestions.length > 0) {
      addToCart(suggestions[0]);
    } else {
      setAlertMsg("❌ Item not found!");
      inputRef.current?.focus();
    }
  };

  const total = cart.reduce(
    (sum, i) => sum + (i.Saleprice || 0) * i.qty,
    0
  );

  const saveBill = useCallback(async () => {
    if (cart.length === 0) {
      setAlertMsg("⚠️ Cart is empty, nothing to save.");
      inputRef.current?.focus();
      return;
    }

    if (isSavingRef.current) {
      setAlertMsg("⌛ Already saving this bill...");
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);

    const today = new Date().toISOString().split("T")[0];
    const bill = { date: today, items: cart, total };
    const idempotencyKey = genIdemKey();

    try {
      const res = await fetch(`/api/bills`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        credentials: "include",
        body: JSON.stringify(bill),
      });

      if (!res.ok) throw new Error("Failed");

      setCart([]);
      setSuggestions([]);
      setHighlightIndex(-1);
      setCodeInput("");
      setAlertMsg("✅ Bill saved to database & cart cleared!");
      await fetchTodayTotal();
      inputRef.current?.focus();
    } catch (err) {
      console.error(err);
      setAlertMsg("❌ Failed to save bill to database.");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [cart, total, fetchTodayTotal]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      const k = (e.key || "").toLowerCase();

      if (k === "s") {
        e.preventDefault();
        e.stopPropagation();
        if (view === "billing" && !isSavingRef.current) {
          saveBill();
        }
      } else if (k === "d") {
        e.preventDefault();
        e.stopPropagation();
        if (view === "billing" && !isSavingRef.current) {
          requestClearCart();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", onKeyDown, {
        capture: true,
      } as EventListenerOptions);
  }, [view, saveBill, requestClearCart]);

  useEffect(() => {
    if (!confirmOpen) return;

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelClearCart();
    };

    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [confirmOpen, cancelClearCart]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div>
      <Navbar view={view} setView={setView} user={user} onLogout={onLogout} />

      {alertMsg && (
        <div
          style={{
            position: "fixed",
            top: "20%",
            left: "50%",
            transform: "translateX(-50%)",
            background: alertMsg.startsWith("✅") ? "green" : "#f44336",
            color: "white",
            padding: "14px 24px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            fontWeight: "bold",
            zIndex: 1000,
            animation: "fadeInOut 3s ease-in-out",
            textAlign: "center",
            minWidth: "250px",
          }}
        >
          {alertMsg}
        </div>
      )}

      {confirmOpen && (
        <>
          <div onClick={cancelClearCart} style={overlayStyle} />
          <div
            style={modalStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-cart-title"
          >
            <div style={modalHeaderStyle}>
              <h3 id="clear-cart-title" style={{ margin: 0 }}>
                Clear Cart
              </h3>
            </div>
            <div style={modalBodyStyle}>
              <p style={{ margin: 0 }}>
                Are you sure you want to clear the cart? This action cannot be
                undone.
              </p>
            </div>
            <div style={modalFooterStyle}>
              <button
                onClick={cancelClearCart}
                className="secondary"
                style={{ padding: "8px 14px", borderRadius: 8 }}
              >
                Cancel
              </button>
              <button
                onClick={performClearCart}
                className="danger"
                style={{ padding: "8px 14px", borderRadius: 8 }}
              >
                Yes, Clear
              </button>
            </div>
          </div>
        </>
      )}

      {view === "billing" ? (
        <div className="container">
          <div className="top-bar">
            <div className="top-bar-left" style={{ flex: 1 }}>
              <form
                onSubmit={handleCodeSubmit}
                style={{ display: "flex", gap: "10px", alignItems: "center" }}
              >
                <label style={{ whiteSpace: "nowrap" }}>Enter Code: </label>

                <div style={{ position: "relative", flex: "0 0 60%" }}>
                  <input
                    type="text"
                    ref={inputRef}
                    value={codeInput}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter item code / MMS code / Title"
                    autoComplete="off"
                    style={{
                      width: "400px",
                      height: "38px",
                      lineHeight: "38px",
                      padding: "0 10px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                      boxSizing: "border-box",
                    }}
                  />

                  {suggestions.length > 0 && (
                    <ul
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        background: "white",
                        border: "1px solid #ccc",
                        borderRadius: "6px",
                        listStyle: "none",
                        margin: 0,
                        padding: "5px 0",
                        width: "100%",
                        maxHeight: "250px",
                        overflowY: "auto",
                        boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
                        zIndex: 999,
                      }}
                    >
                      {suggestions.map((s, i) => (
                        <li
                          key={`${s.Code}-${i}`}
                          onClick={() => addToCart(s)}
                          style={{
                            padding: "8px 12px",
                            cursor: "pointer",
                            background:
                              i === highlightIndex ? "#f0f0f0" : "white",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontWeight: "bold",
                              marginRight: "10px",
                            }}
                          >
                            {s.Code}
                          </span>
                          <span
                            style={{
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {s.Title}
                          </span>
                          <span
                            style={{ marginLeft: "10px", color: "green" }}
                          >
                            ₹{Number(s.Saleprice || 0).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button
                  type="submit"
                  className="primary"
                  style={{
                    height: "38px",
                    lineHeight: "38px",
                    padding: "0 16px",
                    borderRadius: "4px",
                  }}
                >
                  Add Item
                </button>
              </form>
            </div>

            <div className="top-bar-right">
              <button
                onClick={saveBill}
                className="secondary"
                style={{ background: "green", color: "white" }}
                disabled={isSaving || cart.length === 0}
                aria-busy={isSaving ? "true" : "false"}
              >
                {isSaving ? "Saving…" : "Save Bill"}
              </button>

              <button
                onClick={requestClearCart}
                className="danger"
                style={{ marginLeft: "8px" }}
                disabled={isSaving}
              >
                Clear Cart
              </button>

              <small style={{ marginLeft: "8px", color: "gray" }}>
                (Ctrl+S = Save, Ctrl+D = Clear)
              </small>
            </div>
          </div>

          <div className="flex">
            <Cart
              cart={cart}
              updateQty={updateQty}
              removeFromCart={removeFromCart}
              todayTotal={todayTotal}
            />
          </div>

          <h2 className="total">Total Bill: ₹{total.toFixed(2)}</h2>
        </div>
      ) : view === "report" ? (
        <Report onSalesChanged={fetchTodayTotal} />
      ) : view === "summary" ? (
        <Summary />
      ) : view === "store" ? (
        <Store
          items={items}
          onRefresh={fetchItems}
          handleFileUpload={handleFileUpload}
        />
      ) : null}

      <style>{`
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translate(-50%, -10px); }
          10% { opacity: 1; transform: translate(-50%, 0); }
          90% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -10px); }
        }
      `}</style>
    </div>
  );
}

export default function AppClient() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch(`/api/auth/me`, {
        method: "GET",
        credentials: "include",
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setIsAuthenticated(true);
        setUser(data?.user || null);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (err) {
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleLoginSuccess = (loggedInUser: User) => {
    setIsAuthenticated(true);
    setUser(loggedInUser || null);
  };

  const handleLogout = async () => {
    try {
      await fetch(`/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  if (checkingAuth) {
    return (
      <div style={{ padding: "30px", textAlign: "center" }}>
        Checking login...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return <BillingApp user={user} onLogout={handleLogout} />;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  backdropFilter: "blur(1px)",
  zIndex: 1100,
};

const modalStyle: React.CSSProperties = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(480px, 92vw)",
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  zIndex: 1110,
  overflow: "hidden",
};

const modalHeaderStyle: React.CSSProperties = {
  padding: "14px 18px",
  borderBottom: "1px solid #eee",
  background: "#fafafa",
};

const modalBodyStyle: React.CSSProperties = {
  padding: "16px 18px",
  color: "#333",
  lineHeight: 1.5,
};

const modalFooterStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  padding: "12px 18px",
  borderTop: "1px solid #eee",
  background: "#fafafa",
};