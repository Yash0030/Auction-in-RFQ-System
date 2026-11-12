import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";

export const Navbar = () => {
  const { user, logout } = useAuth();
  const { openCreateModal } = useModal();

  return (
    <header className="navbar">
      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
        <Link to="/" className="nav-brand">
          RFQ Auction
        </Link>
        <Link to="/" className="btn btn-secondary" style={{ padding: "6px 12px" }}>
          Auctions
        </Link>
        {user && user.role === "BUYER" && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px" }}
            onClick={openCreateModal}
          >
            Create Auction
          </button>
        )}
      </div>

      <div className="nav-links">
        {user ? (
          <div className="nav-user">
            <span style={{ fontWeight: 600 }}>{user.name}</span>
            <span className={`badge ${user.role === "BUYER" ? "badge-l1" : "badge-active"}`}>
              {user.role}
            </span>
            <button className="btn btn-secondary" style={{ padding: "5px 12px", fontSize: "0.82rem" }} onClick={logout}>
              Logout
            </button>
          </div>
        ) : (
          <Link to="/login" className="btn btn-primary" style={{ padding: "6px 14px" }}>
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
};
