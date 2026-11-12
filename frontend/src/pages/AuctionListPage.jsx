import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import { socket } from "../socket";

export const AuctionListPage = () => {
  const { API_URL, user, authHeaders } = useAuth();
  const { openCreateModal } = useModal();
  const [rfqs, setRfqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const navigate = useNavigate();

  const handleDeleteRfq = async (rfqId, refId, e) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete auction "${refId}"?`)) {
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/rfqs/${rfqId}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to delete auction");
      }
      fetchRfqs();
    } catch (err) {
      alert(err.message);
    }
  };

  const fetchRfqs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/rfqs`);
      const data = await res.json();
      setRfqs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRfqs();

    const handleListUpdate = () => {
      fetchRfqs();
    };

    socket.on("rfq_list_updated", handleListUpdate);
    socket.on("rfq_updated", handleListUpdate);

    const interval = setInterval(fetchRfqs, 10000);

    return () => {
      socket.off("rfq_list_updated", handleListUpdate);
      socket.off("rfq_updated", handleListUpdate);
      clearInterval(interval);
    };
  }, []);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  const getStatusBadge = (status) => {
    if (status === "ACTIVE") return <span className="badge badge-active">Active</span>;
    if (status === "FORCE_CLOSED") return <span className="badge badge-forced">Force Closed</span>;
    if (status === "DRAFT") return <span className="badge badge-closed">Upcoming</span>;
    return <span className="badge badge-closed">Closed</span>;
  };

  const counts = {
    ALL: rfqs.length,
    ACTIVE: rfqs.filter((r) => r.status === "ACTIVE").length,
    CLOSED: rfqs.filter((r) => r.status === "CLOSED").length,
    FORCE_CLOSED: rfqs.filter((r) => r.status === "FORCE_CLOSED").length,
    DRAFT: rfqs.filter((r) => r.status === "DRAFT").length
  };

  const filteredRfqs = rfqs.filter((r) => {
    if (statusFilter === "ALL") return true;
    return r.status === statusFilter;
  });

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.5px" }}>
            Auctions
          </h1>
          <p style={{ fontSize: "0.92rem", color: "#a1a1aa", marginTop: "4px" }}>
            Procurement RFQs with British Auction automatic extensions and forced close rules.
          </p>
        </div>
        {user && user.role === "BUYER" && (
          <button type="button" onClick={openCreateModal} className="btn btn-primary">
            Create Auction
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "24px", flexWrap: "wrap", alignItems: "center" }}>
        {[
          { key: "ALL", label: "All Auctions" },
          { key: "ACTIVE", label: "Active" },
          { key: "CLOSED", label: "Closed" },
          { key: "FORCE_CLOSED", label: "Forced Closed" },
          { key: "DRAFT", label: "Upcoming" }
        ].map((tab) => {
          const isActive = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              style={{
                padding: "6px 14px",
                borderRadius: "20px",
                fontSize: "0.82rem",
                fontWeight: 600,
                border: isActive ? "1px solid #ffffff" : "1px solid #27272a",
                backgroundColor: isActive ? "#ffffff" : "#121214",
                color: isActive ? "#000000" : "#a1a1aa",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  backgroundColor: isActive ? "#000000" : "#27272a",
                  color: isActive ? "#ffffff" : "#d4d4d8",
                  fontWeight: 700
                }}
              >
                {counts[tab.key] || 0}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "50px", color: "#a1a1aa" }}>
          Loading auctions...
        </div>
      ) : filteredRfqs.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "50px", color: "#a1a1aa" }}>
          No auctions found for the selected filter.
        </div>
      ) : (
        <div className="auction-grid">
          {filteredRfqs.map((rfq) => (
            <div
              key={rfq.id}
              className="card"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "18px",
                cursor: "pointer"
              }}
              onClick={() => navigate(`/auctions/${rfq.id}`)}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <span style={{ fontSize: "0.82rem", color: "#a1a1aa", fontWeight: 700, letterSpacing: "0.5px" }}>
                    {rfq.reference_id}
                  </span>
                  {getStatusBadge(rfq.status)}
                </div>

                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#ffffff", marginBottom: "8px", lineHeight: "1.3" }}>
                  {rfq.title}
                </h3>

                {rfq.description && (
                  <p style={{ fontSize: "0.88rem", color: "#d4d4d8", marginBottom: "16px", lineHeight: "1.45" }}>
                    {rfq.description}
                  </p>
                )}

                <div style={{ background: "#18181b", border: "1px solid #27272a", padding: "14px", borderRadius: "6px", marginBottom: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "0.82rem", color: "#a1a1aa", fontWeight: 600 }}>Current Lowest Bid (L1)</span>
                    <span style={{ fontSize: "1.2rem", fontWeight: 800, color: rfq.current_lowest_bid ? "#4ade80" : "#a1a1aa" }}>
                      {rfq.current_lowest_bid ? `$${rfq.current_lowest_bid.toFixed(2)}` : "No bids yet"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "#71717a", marginBottom: "8px" }}>
                    <span>Total Bids Placed</span>
                    <span style={{ color: "#d4d4d8", fontWeight: 600 }}>{rfq.total_bids_count} bids</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "#71717a", borderTop: "1px solid #27272a", paddingTop: "8px", flexWrap: "wrap", gap: "6px" }}>
                    <span>Start: <strong style={{ color: "#38bdf8" }}>{formatDateTime(rfq.bid_start_time)}</strong></span>
                    <span>End: <strong style={{ color: "#f59e0b" }}>{formatDateTime(rfq.bid_close_time)}</strong></span>
                  </div>
                </div>

                {(() => {
                  const nowMs = Date.now();
                  const closeMs = new Date(rfq.bid_close_time).getTime();
                  const winMs = (rfq.trigger_window_minutes || 0) * 60 * 1000;
                  const isMonitorPeriod = rfq.status === "ACTIVE" && rfq.is_british_auction && nowMs >= (closeMs - winMs) && nowMs < closeMs;

                  return (
                    <div className="grid-2" style={{ gap: "10px" }}>
                      {rfq.status === "DRAFT" ? (
                        <>
                          <div style={{ background: "#18181b", border: "1px solid #38bdf8", padding: "10px 12px", borderRadius: "6px" }}>
                            <div style={{ color: "#38bdf8", fontSize: "0.76rem", fontWeight: 600 }}>Time Starts In</div>
                            <div style={{ color: "#ffffff", fontWeight: 700, fontSize: "0.88rem", marginTop: "3px" }}>
                              {formatDateTime(rfq.bid_start_time)}
                            </div>
                          </div>
                          <div style={{ background: "#18181b", border: "1px solid #27272a", padding: "10px 12px", borderRadius: "6px" }}>
                            <div style={{ color: "#a1a1aa", fontSize: "0.76rem", fontWeight: 600 }}>Scheduled Close Time</div>
                            <div style={{ color: "#ffffff", fontWeight: 700, fontSize: "0.88rem", marginTop: "3px" }}>
                              {formatDateTime(rfq.bid_close_time)}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div
                            className={isMonitorPeriod ? "timer-monitor-highlight" : ""}
                            style={{
                              background: isMonitorPeriod ? "rgba(234, 179, 8, 0.15)" : "#18181b",
                              border: isMonitorPeriod ? "2px solid #eab308" : "1px solid #27272a",
                              padding: "10px 12px",
                              borderRadius: "6px",
                              transition: "all 0.3s ease"
                            }}
                          >
                            <div style={{ color: isMonitorPeriod ? "#facc15" : "#a1a1aa", fontSize: "0.76rem", fontWeight: isMonitorPeriod ? 800 : 600, letterSpacing: isMonitorPeriod ? "0.3px" : "normal" }}>
                              {isMonitorPeriod ? "MONITORING ACTIVE" : "Current Bid Close Time"}
                            </div>
                            <div style={{ color: isMonitorPeriod ? "#facc15" : "#ffffff", fontWeight: 700, fontSize: "0.88rem", marginTop: "3px" }}>
                              {formatDateTime(rfq.bid_close_time)}
                            </div>
                          </div>
                          <div style={{ background: "#1c1212", border: "1px solid #3f1d1d", padding: "10px 12px", borderRadius: "6px" }}>
                            <div style={{ color: "#fca5a5", fontSize: "0.76rem", fontWeight: 600 }}>Forced Close Time</div>
                            <div style={{ color: "#f87171", fontWeight: 700, fontSize: "0.88rem", marginTop: "3px" }}>
                              {formatDateTime(rfq.forced_bid_close_time)}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                {rfq.is_british_auction && (
                  <div style={{ marginTop: "14px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ background: "#18181b", border: "1px solid #3f3f46", color: "#f4f4f5", fontSize: "0.78rem", fontWeight: 600, padding: "3px 8px", borderRadius: "4px" }}>
                      Window: {rfq.trigger_window_minutes}m
                    </span>
                    <span style={{ background: "#18181b", border: "1px solid #3f3f46", color: "#f4f4f5", fontSize: "0.78rem", fontWeight: 600, padding: "3px 8px", borderRadius: "4px" }}>
                      Extension: +{rfq.extension_duration_minutes}m
                    </span>
                    <span style={{ background: "#18181b", border: "1px solid #3f3f46", color: "#38bdf8", fontSize: "0.78rem", fontWeight: 600, padding: "3px 8px", borderRadius: "4px" }}>
                      Trigger: {rfq.extension_trigger}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #27272a", paddingTop: "14px", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ fontSize: "0.82rem", color: "#a1a1aa" }}>
                  Pickup: <strong style={{ color: "#ffffff" }}>{new Date(rfq.pickup_date).toLocaleDateString()}</strong>
                </span>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {user && user.role === "BUYER" && user.id === rfq.created_by && rfq.status === "DRAFT" && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "4px 10px", fontSize: "0.78rem", borderColor: "#38bdf8", color: "#38bdf8" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/edit-rfq/${rfq.id}`);
                      }}
                    >
                      Edit
                    </button>
                  )}

                  {user && user.role === "BUYER" && user.id === rfq.created_by && (rfq.status === "DRAFT" || rfq.status === "CLOSED" || rfq.status === "FORCE_CLOSED") && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "4px 10px", fontSize: "0.78rem", borderColor: "#7f1d1d", color: "#ef4444" }}
                      onClick={(e) => handleDeleteRfq(rfq.id, rfq.reference_id, e)}
                    >
                      Delete
                    </button>
                  )}

                  <span style={{ fontSize: "0.88rem", color: "#ffffff", fontWeight: 600, marginLeft: "4px" }}>
                    View &rarr;
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
