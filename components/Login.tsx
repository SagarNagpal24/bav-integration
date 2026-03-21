"use client";

import React, { useState } from "react";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { type User } from "./Navbar";

type LoginProps = {
  onLoginSuccess: (user: User) => void;
};

export default function Login({ onLoginSuccess }: LoginProps) {
  const [error, setError] = useState("");

  const handleSuccess = async (credentialResponse: CredentialResponse) => {
    setError("");

    if (!credentialResponse.credential) {
      setError("Google did not return a credential.");
      return;
    }

    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          credential: credentialResponse.credential,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Login failed");
        return;
      }

      onLoginSuccess(data.user);
    } catch (err) {
      setError("Something went wrong during login");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f5f5f5",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#fff",
          padding: "30px",
          borderRadius: "12px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <h2 style={{ marginBottom: "10px" }}>BAV App Login</h2>
        <p style={{ marginBottom: "20px", color: "#555" }}>
          Sign in with an approved Google account
        </p>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => setError("Google sign-in failed")}
            useOneTap={false}
          />
        </div>

        {error ? (
          <p style={{ color: "red", marginTop: "15px" }}>{error}</p>
        ) : null}
      </div>
    </div>
  );
}