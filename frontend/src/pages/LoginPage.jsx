import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const LoginPage = () => {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("BUYER");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (isRegister) {
        await register(email, password, name, role);
      } else {
        await login(email, password);
      }
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#000000", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
      <div style={{ maxWidth: "980px", width: "100%", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "60px", alignItems: "center" }}>
        
        <div>
          <h1 style={{ fontSize: "3.2rem", fontWeight: 800, color: "#ffffff", letterSpacing: "-1px", lineHeight: "1.1", marginBottom: "12px" }}>
            RFQ Auction
          </h1>
          <p style={{ fontSize: "1.25rem", color: "#8e8e93", fontWeight: 400 }}>
            {isRegister ? "Create an account" : "Welcome back"}
          </p>
        </div>

        <div style={{ backgroundColor: "#121214", border: "1px solid #222225", borderRadius: "14px", padding: "36px 32px" }}>
          {error && <div className="alert-error" style={{ marginBottom: "20px" }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            {isRegister && (
              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#8e8e93", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "8px" }}>
                  NAME
                </label>
                <input
                  type="text"
                  required
                  style={{ width: "100%", backgroundColor: "#f0f4f9", color: "#000000", border: "1px solid #d1d5db", borderRadius: "8px", padding: "12px 14px", fontSize: "0.95rem", outline: "none" }}
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}

            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#8e8e93", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "8px" }}>
                EMAIL ADDRESS
              </label>
              <input
                type="email"
                required
                style={{ width: "100%", backgroundColor: "#f0f4f9", color: "#000000", border: "1px solid #d1d5db", borderRadius: "8px", padding: "12px 14px", fontSize: "0.95rem", outline: "none" }}
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: isRegister ? "18px" : "24px" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#8e8e93", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "8px" }}>
                PASSWORD
              </label>
              <input
                type="password"
                required
                style={{ width: "100%", backgroundColor: "#f0f4f9", color: "#000000", border: "1px solid #d1d5db", borderRadius: "8px", padding: "12px 14px", fontSize: "0.95rem", outline: "none" }}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {isRegister && (
              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#8e8e93", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px" }}>
                  ROLE
                </label>
                <div style={{ display: "flex", gap: "28px", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.92rem", color: "#ffffff", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={role === "BUYER"}
                      onChange={() => setRole("BUYER")}
                      style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#ffffff" }}
                    />
                    Buyer
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.92rem", color: "#ffffff", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={role === "SUPPLIER"}
                      onChange={() => setRole("SUPPLIER")}
                      style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#ffffff" }}
                    />
                    Supplier
                  </label>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: "100%",
                backgroundColor: "#1e1e24",
                border: "1px solid #2f2f38",
                color: "#ffffff",
                borderRadius: "8px",
                padding: "13px",
                fontWeight: 600,
                fontSize: "0.95rem",
                cursor: submitting ? "not-allowed" : "pointer"
              }}
            >
              {submitting ? "Processing..." : isRegister ? "Create Account" : "Sign In"}
            </button>
          </form>

          <div style={{ marginTop: "24px", textAlign: "center", fontSize: "0.88rem", color: "#8e8e93" }}>
            {isRegister ? (
              <span>
                Already have an account?{" "}
                <strong
                  style={{ color: "#ffffff", cursor: "pointer" }}
                  onClick={() => {
                    setIsRegister(false);
                    setError("");
                  }}
                >
                  Sign In
                </strong>
              </span>
            ) : (
              <span>
                Don't have an account?{" "}
                <strong
                  style={{ color: "#ffffff", cursor: "pointer" }}
                  onClick={() => {
                    setIsRegister(true);
                    setError("");
                  }}
                >
                  Create one
                </strong>
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
