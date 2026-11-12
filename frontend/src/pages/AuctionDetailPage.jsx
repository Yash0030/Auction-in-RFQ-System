import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { socket } from "../socket";

export const AuctionDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const rfqId = parseInt(id, 10);
  const { API_URL, user, authHeaders } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [carrierName, setCarrierName] = useState("");
  const [freightCharges, setFreightCharges] = useState("");
  const [originCharges, setOriginCharges] = useState("");
  const [destinationCharges, setDestinationCharges] = useState("");
  const [transitTime, setTransitTime] = useState("");
  const [quoteValidity, setQuoteValidity] = useState("");
  const [bidError, setBidError] = useState("");
  const [bidSuccess, setBidSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [nowTime, setNowTime] = useState(Date.now());
  const formInitializedRef = useRef(false);

  const applyQuoteToForm = (quote) => {
    if (!quote) return;
    if (quote.carrier_name) setCarrierName(quote.carrier_name);
    if (quote.transit_time) setTransitTime(quote.transit_time);
    if (quote.quote_validity) setQuoteValidity(quote.quote_validity.slice(0, 10));
    if (quote.freight_charges !== undefined) setFreightCharges(String(quote.freight_charges));
    if (quote.origin_charges !== undefined) setOriginCharges(String(quote.origin_charges));
    if (quote.destination_charges !== undefined) setDestinationCharges(String(quote.destination_charges));
  };

  const fetchDetail = async (isInitial = false) => {
    try {
      const res = await fetch(`${API_URL}/api/rfqs/${rfqId}`, {
        headers: authHeaders()
      });
      if (res.status === 404) {
        navigate("/", { replace: true });
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (isInitial && !formInitializedRef.current && json.user_latest_quote) {
          formInitializedRef.current = true;
          applyQuoteToForm(json.user_latest_quote);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail(true);

    socket.emit("join_rfq", { rfq_id: rfqId });

    const handleUpdate = (updatedData) => {
      setData(updatedData);
    };

    const handleDeleted = (payload) => {
      if (payload && payload.rfq_id === rfqId) {
        navigate("/", { replace: true });
      }
    };

    socket.on("rfq_updated", handleUpdate);
    socket.on("rfq_deleted", handleDeleted);

    const clock = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);

    const poll = setInterval(() => {
      fetchDetail(false);
    }, 4000);

    return () => {
      socket.emit("leave_rfq", { rfq_id: rfqId });
      socket.off("rfq_updated", handleUpdate);
      socket.off("rfq_deleted", handleDeleted);
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [rfqId]);

  const totalCalculated = useMemo(() => {
    const f = parseFloat(freightCharges) || 0;
    const o = parseFloat(originCharges) || 0;
    const d = parseFloat(destinationCharges) || 0;
    return (f + o + d).toFixed(2);
  }, [freightCharges, originCharges, destinationCharges]);

  const sortedBids = useMemo(() => {
    const list = data?.bids;
    if (!list || !Array.isArray(list)) return [];
    return [...list].sort((a, b) => {
      const getRankVal = (r) => {
        if (!r || typeof r !== "string") return 999999;
        if (r.startsWith("L")) {
          const n = parseInt(r.slice(1), 10);
          return isNaN(n) ? 999999 : n;
        }
        return 999999;
      };
      const rankDiff = getRankVal(a.rank) - getRankVal(b.rank);
      if (rankDiff !== 0) return rankDiff;
      const priceDiff = (a.total_amount || 0) - (b.total_amount || 0);
      if (priceDiff !== 0) return priceDiff;
      return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
    });
  }, [data?.bids]);

  const sortedLogs = useMemo(() => {
    const list = data?.logs;
    if (!list || !Array.isArray(list)) return [];
    return [...list].sort((a, b) => {
      const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      return (b.id || 0) - (a.id || 0);
    });
  }, [data?.logs]);

  const getTimeRemaining = (targetDateStr) => {
    if (!targetDateStr) return { expired: true, text: "00:00:00" };
    const diff = new Date(targetDateStr).getTime() - nowTime;
    if (diff <= 0) return { expired: true, text: "Ended" };
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return {
      expired: false,
      text: `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    };
  };

  const handleBidSubmit = async (e) => {
    e.preventDefault();
    setBidError("");
    setBidSuccess("");

    const f = parseFloat(freightCharges);
    const o = parseFloat(originCharges);
    const d = parseFloat(destinationCharges);

    if (isNaN(f) || isNaN(o) || isNaN(d) || f < 0 || o < 0 || d < 0) {
      setBidError("Please provide valid positive charge amounts.");
      return;
    }

    const total = f + o + d;
    if (total <= 0) {
      setBidError("Total quote price must be greater than zero.");
      return;
    }

    if (data.user_lowest_bid && total >= data.user_lowest_bid) {
      setBidError(`Your new quote ($${total.toFixed(2)}) must be strictly lower than your current best quote ($${data.user_lowest_bid.toFixed(2)}).`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/rfqs/${rfqId}/bids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        body: JSON.stringify({
          carrier_name: carrierName,
          freight_charges: f,
          origin_charges: o,
          destination_charges: d,
          transit_time: transitTime,
          quote_validity: quoteValidity
        })
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.detail || "Failed to submit quote");
      }

      setBidSuccess(
        resJson.extended
          ? `Quote submitted successfully! British Auction extended: ${resJson.extension_reason}`
          : "Quote submitted successfully!"
      );
      fetchDetail();
    } catch (err) {
      setBidError(err.message);
    } finally {
      setSubmitting(false);
      fetchDetail();
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          Loading RFQ details...
        </div>
      </div>
    );
  }

  if (!data || !data.rfq) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          RFQ not found or has been deleted.
          <div style={{ marginTop: "12px" }}>
            <button className="btn btn-secondary" onClick={() => navigate("/", { replace: true })}>
              Back to Auctions
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleDeleteAuction = async () => {
    if (!window.confirm(`Are you sure you want to delete auction "${data.rfq.reference_id}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/rfqs/${rfqId}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.detail || "Failed to delete auction");
      }
      navigate("/", { replace: true });
    } catch (err) {
      alert(err.message);
    }
  };

  const { rfq, bids, logs, user_rank, user_lowest_bid } = data;

  const isUpcoming = rfq.status === "DRAFT" || new Date(rfq.bid_start_time).getTime() > nowTime;
  const startCountdown = getTimeRemaining(rfq.bid_start_time);
  const closeCountdown = getTimeRemaining(rfq.bid_close_time);
  const forcedCountdown = getTimeRemaining(rfq.forced_bid_close_time);

  const closeTimeMs = new Date(rfq.bid_close_time).getTime();
  const triggerWindowMs = (rfq.trigger_window_minutes || 0) * 60 * 1000;
  const isMonitorPeriod = rfq.status === "ACTIVE" &&
    rfq.is_british_auction &&
    nowTime >= (closeTimeMs - triggerWindowMs) &&
    nowTime < closeTimeMs;

  const isOwner = user && user.role === "BUYER" && user.id === rfq.created_by;
  const canEdit = isOwner && rfq.status === "DRAFT";
  const canDelete = isOwner && (rfq.status === "DRAFT" || rfq.status === "CLOSED" || rfq.status === "FORCE_CLOSED");

  const getStatusBadge = (status) => {
    if (status === "ACTIVE") return <span className="badge badge-active">Active</span>;
    if (status === "FORCE_CLOSED") return <span className="badge badge-forced">Force Closed</span>;
    if (status === "DRAFT") return <span className="badge badge-closed">Upcoming</span>;
    return <span className="badge badge-closed">Closed</span>;
  };

  return (
    <div style={{ maxWidth: "1600px", width: "100%", margin: "0 auto", padding: "8px 16px", display: "flex", flexDirection: "column", height: "100%", flex: 1, minHeight: 0, boxSizing: "border-box", overflow: "hidden" }}>
      <div style={{ marginBottom: "6px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", flexShrink: 0 }}>
        <button className="btn btn-secondary" style={{ padding: "5px 12px", fontSize: "0.8rem" }} onClick={() => navigate("/")}>
          &larr; Back to Auctions
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "0.8rem", color: "#888888", marginRight: "4px" }}>
            Reference: <strong style={{ color: "#ffffff" }}>{rfq.reference_id}</strong>
          </span>

          {canEdit && (
            <button
              className="btn btn-secondary"
              style={{ padding: "4px 10px", fontSize: "0.78rem", borderColor: "#38bdf8", color: "#38bdf8" }}
              onClick={() => navigate(`/edit-rfq/${rfq.id}`)}
            >
              Edit Auction
            </button>
          )}

          {canDelete && (
            <button
              className="btn btn-secondary"
              style={{ padding: "4px 10px", fontSize: "0.78rem", borderColor: "#7f1d1d", color: "#ef4444" }}
              onClick={handleDeleteAuction}
            >
              Delete Auction
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: "8px 14px", marginBottom: "8px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ minWidth: "260px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
              <h1 style={{ fontSize: "1.12rem", fontWeight: 700, color: "#ffffff", margin: 0 }}>{rfq.title}</h1>
              {getStatusBadge(rfq.status)}
            </div>
            {rfq.description && (
              <p style={{ fontSize: "0.78rem", color: "#a3a3a3", margin: "1px 0 4px 0", maxWidth: "600px" }}>{rfq.description}</p>
            )}
            <div style={{ display: "flex", gap: "14px", fontSize: "0.76rem", color: "#777777", flexWrap: "wrap" }}>
              <span>Start: <strong style={{ color: "#38bdf8" }}>{new Date(rfq.bid_start_time).toLocaleString()}</strong></span>
              <span>End: <strong style={{ color: "#f59e0b" }}>{new Date(rfq.bid_close_time).toLocaleString()}</strong></span>
              <span>Pickup: <strong style={{ color: "#dddddd" }}>{new Date(rfq.pickup_date).toLocaleDateString()}</strong></span>
              <span>Bids: <strong style={{ color: "#dddddd" }}>{bids.length}</strong></span>
              {user && user.role === "SUPPLIER" && (
                <span>
                  Status: <strong style={{ color: user_rank ? "#3b82f6" : "#777" }}>{user_rank ? `${user_rank} ($${user_lowest_bid.toFixed(2)})` : "Not Bid"}</strong>
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#111113", border: "1px solid #27272a", padding: "6px 14px", borderRadius: "8px" }}>
            <div>
              <div style={{ fontSize: "0.64rem", color: "#71717a", textTransform: "uppercase", fontWeight: 700 }}>Start Time</div>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#38bdf8", whiteSpace: "nowrap" }}>
                {new Date(rfq.bid_start_time).toLocaleDateString([], { month: "short", day: "numeric" })}, {new Date(rfq.bid_start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <div style={{ color: "#52525b", fontSize: "0.85rem", fontWeight: 700 }}>&rarr;</div>
            <div>
              <div style={{ fontSize: "0.64rem", color: "#71717a", textTransform: "uppercase", fontWeight: 700 }}>End Time</div>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f59e0b", whiteSpace: "nowrap" }}>
                {new Date(rfq.bid_close_time).toLocaleDateString([], { month: "short", day: "numeric" })}, {new Date(rfq.bid_close_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>

          <div>
            {isUpcoming ? (
              <div style={{ background: "#121212", border: "1px solid #38bdf8", padding: "5px 12px", borderRadius: "6px", textAlign: "center", minWidth: "130px" }}>
                <div style={{ fontSize: "0.68rem", color: "#38bdf8", fontWeight: 700, letterSpacing: "0.5px" }}>Time Starts In</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ffffff", fontFamily: "monospace" }}>
                  {startCountdown.text}
                </div>
                <div style={{ fontSize: "0.64rem", color: "#a1a1aa" }}>
                  Starts at {new Date(rfq.bid_start_time).toLocaleTimeString()}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <div
                  className={isMonitorPeriod ? "timer-monitor-highlight" : ""}
                  style={{
                    background: isMonitorPeriod ? "rgba(234, 179, 8, 0.15)" : "#121212",
                    border: isMonitorPeriod ? "2px solid #eab308" : "1px solid #222",
                    padding: "5px 12px",
                    borderRadius: "6px",
                    textAlign: "center",
                    minWidth: "130px",
                    transition: "all 0.3s ease"
                  }}
                >
                  <div style={{ fontSize: "0.68rem", color: isMonitorPeriod ? "#facc15" : "#888888", fontWeight: isMonitorPeriod ? 800 : 500, letterSpacing: isMonitorPeriod ? "0.3px" : "normal" }}>
                    {isMonitorPeriod ? "MONITORING ACTIVE" : "Bid Close In"}
                  </div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 800, color: closeCountdown.expired ? "#ef4444" : isMonitorPeriod ? "#facc15" : "#ffffff", fontFamily: "monospace" }}>
                    {closeCountdown.text}
                  </div>
                  <div style={{ fontSize: "0.64rem", color: isMonitorPeriod ? "#fef08a" : "#555555" }}>
                    {isMonitorPeriod ? `Bids extend +${rfq.extension_duration_minutes}m` : new Date(rfq.bid_close_time).toLocaleTimeString()}
                  </div>
                </div>

                <div style={{ background: "#121212", border: "1px solid #2e1010", padding: "5px 12px", borderRadius: "6px", textAlign: "center" }}>
                  <div style={{ fontSize: "0.68rem", color: "#f87171" }}>Forced Close In</div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#f87171", fontFamily: "monospace" }}>
                    {forcedCountdown.text}
                  </div>
                  <div style={{ fontSize: "0.64rem", color: "#772b2b" }}>
                    {new Date(rfq.forced_bid_close_time).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {rfq.is_british_auction && (
          <div style={{ marginTop: "6px", background: "#141414", padding: "4px 10px", borderRadius: "5px", display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "0.74rem", borderTop: "1px solid #222" }}>
            <div>
              <span style={{ color: "#777777" }}>Trigger Window (X): </span>
              <strong style={{ color: "#ffffff" }}>{rfq.trigger_window_minutes}m</strong>
            </div>
            <div>
              <span style={{ color: "#777777" }}>Extension Duration (Y): </span>
              <strong style={{ color: "#ffffff" }}>+{rfq.extension_duration_minutes}m</strong>
            </div>
            <div>
              <span style={{ color: "#777777" }}>Extension Trigger: </span>
              <strong style={{ color: "#38bdf8" }}>{rfq.extension_trigger}</strong>
            </div>
            <div>
              <span style={{ color: "#777777" }}>Safety Rule: </span>
              <strong style={{ color: "#9ca3af" }}>Max ceiling enforced</strong>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: "10px", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", height: "100%", minHeight: 0 }}>
          {user && user.role === "SUPPLIER" && rfq.status === "DRAFT" && (
            <div className="card" style={{ padding: "12px", textAlign: "center", color: "#a1a1aa", fontSize: "0.82rem", flexShrink: 0 }}>
              Bidding opens when the auction starts at {new Date(rfq.bid_start_time).toLocaleString()}.
            </div>
          )}

          {user && user.role === "SUPPLIER" && (rfq.status === "CLOSED" || rfq.status === "FORCE_CLOSED") && (
            <div className="card" style={{ padding: "12px", textAlign: "center", color: "#a1a1aa", fontSize: "0.82rem", flexShrink: 0 }}>
              This auction is closed. Bidding is now closed.
            </div>
          )}

          {user && user.role === "BUYER" && (
            <div className="card" style={{ padding: "8px 12px", color: "#a1a1aa", fontSize: "0.8rem", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Buyer Monitoring Console: Watching competitive bids and real-time British Auction extensions.</span>
              <span style={{ color: "#4ade80", fontWeight: 600 }}>Live Feed</span>
            </div>
          )}

          <div className="card" style={{ padding: "10px 14px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", flexShrink: 0 }}>
              <h2 className="card-title" style={{ fontSize: "0.95rem", margin: 0 }}>Supplier Quotes & Ranking</h2>
              <span style={{ fontSize: "0.75rem", color: "#888888" }}>{sortedBids.length} Ranked {sortedBids.length === 1 ? "Supplier" : "Suppliers"}</span>
            </div>

            {sortedBids.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px", color: "#777", fontSize: "0.84rem" }}>
                No quotes submitted yet for this RFQ.
              </div>
            ) : (
              <div className="table-container" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ padding: "6px 8px", fontSize: "0.74rem" }}>Rank</th>
                      <th style={{ padding: "6px 8px", fontSize: "0.74rem" }}>Supplier</th>
                      <th style={{ padding: "6px 8px", fontSize: "0.74rem" }}>Carrier</th>
                      <th style={{ padding: "6px 8px", fontSize: "0.74rem" }}>Freight</th>
                      <th style={{ padding: "6px 8px", fontSize: "0.74rem" }}>Origin</th>
                      <th style={{ padding: "6px 8px", fontSize: "0.74rem" }}>Destination</th>
                      <th style={{ padding: "6px 8px", fontSize: "0.74rem" }}>Total Price</th>
                      <th style={{ padding: "6px 8px", fontSize: "0.74rem" }}>Transit</th>
                      <th style={{ padding: "6px 8px", fontSize: "0.74rem" }}>Validity</th>
                      <th style={{ padding: "6px 8px", fontSize: "0.74rem" }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBids.map((b) => (
                      <tr key={b.id} style={{ background: b.rank === "L1" ? "#061f12" : "transparent" }}>
                        <td style={{ padding: "5px 8px" }}>
                          <span className={`badge ${b.rank === "L1" ? "badge-active" : "badge-closed"}`} style={{ padding: "2px 6px", fontSize: "0.68rem" }}>
                            {b.rank}
                          </span>
                        </td>
                        <td style={{ padding: "5px 8px" }}>
                          <div style={{ fontWeight: 600, color: "#ffffff", fontSize: "0.82rem" }}>{b.supplier_name}</div>
                        </td>
                        <td style={{ padding: "5px 8px", fontSize: "0.8rem" }}>{b.carrier_name}</td>
                        <td style={{ padding: "5px 8px", fontSize: "0.8rem" }}>${b.freight_charges.toFixed(2)}</td>
                        <td style={{ padding: "5px 8px", fontSize: "0.8rem" }}>${b.origin_charges.toFixed(2)}</td>
                        <td style={{ padding: "5px 8px", fontSize: "0.8rem" }}>${b.destination_charges.toFixed(2)}</td>
                        <td style={{ padding: "5px 8px", fontWeight: 700, color: b.rank === "L1" ? "#22c55e" : "#ffffff", fontSize: "0.84rem" }}>
                          ${b.total_amount.toFixed(2)}
                        </td>
                        <td style={{ padding: "5px 8px", fontSize: "0.8rem" }}>{b.transit_time}</td>
                        <td style={{ padding: "5px 8px", fontSize: "0.8rem" }}>{new Date(b.quote_validity).toLocaleDateString()}</td>
                        <td style={{ padding: "5px 8px", fontSize: "0.72rem", color: "#888888" }}>
                          {new Date(b.submitted_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {user && user.role === "SUPPLIER" && rfq.status === "ACTIVE" && (
            <div className="card" style={{ padding: "10px 14px", border: "1px solid #2b2b2b", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <h2 className="card-title" style={{ fontSize: "0.92rem", margin: 0 }}>Submit Quote / Bid</h2>
                <div style={{ fontSize: "0.74rem", color: "#777777" }}>
                  {user_lowest_bid ? (
                    <span>Best Quote: <strong style={{ color: "#38bdf8" }}>${user_lowest_bid.toFixed(2)}</strong></span>
                  ) : (
                    <span>Submit initial quote to enter rankings</span>
                  )}
                </div>
              </div>

              {bidError && <div className="alert-error" style={{ padding: "6px 10px", fontSize: "0.78rem", marginBottom: "6px" }}>{bidError}</div>}
              {bidSuccess && <div className="alert-success" style={{ padding: "6px 10px", fontSize: "0.78rem", marginBottom: "6px" }}>{bidSuccess}</div>}

              <form onSubmit={handleBidSubmit}>
                <div className="grid-3" style={{ gap: "8px", marginBottom: "6px" }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: "0.72rem", marginBottom: "2px" }}>Carrier Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Maersk, MSC"
                      className="form-control"
                      style={{ padding: "4px 8px", fontSize: "0.82rem" }}
                      value={carrierName}
                      onChange={(e) => setCarrierName(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: "0.72rem", marginBottom: "2px" }}>Transit Time</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 21 Days"
                      className="form-control"
                      style={{ padding: "4px 8px", fontSize: "0.82rem" }}
                      value={transitTime}
                      onChange={(e) => setTransitTime(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: "0.72rem", marginBottom: "2px" }}>Quote Validity</label>
                    <input
                      type="date"
                      required
                      min={new Date().toISOString().slice(0, 10)}
                      className="form-control"
                      style={{ padding: "4px 8px", fontSize: "0.82rem" }}
                      value={quoteValidity}
                      onChange={(e) => setQuoteValidity(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid-4" style={{ background: "#111111", padding: "6px 10px", borderRadius: "5px", marginBottom: "6px", gap: "8px" }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: "0.72rem", marginBottom: "2px" }}>Freight ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      className="form-control"
                      style={{ padding: "4px 8px", fontSize: "0.82rem" }}
                      value={freightCharges}
                      onChange={(e) => setFreightCharges(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: "0.72rem", marginBottom: "2px" }}>Origin ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      className="form-control"
                      style={{ padding: "4px 8px", fontSize: "0.82rem" }}
                      value={originCharges}
                      onChange={(e) => setOriginCharges(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: "0.72rem", marginBottom: "2px" }}>Destination ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      className="form-control"
                      style={{ padding: "4px 8px", fontSize: "0.82rem" }}
                      value={destinationCharges}
                      onChange={(e) => setDestinationCharges(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ color: "#22c55e", fontSize: "0.72rem", marginBottom: "2px" }}>Total Amount ($)</label>
                    <div style={{ height: "26px", display: "flex", alignItems: "center", fontSize: "0.95rem", fontWeight: 700, color: "#22c55e" }}>
                      ${totalCalculated}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="submit" className="btn btn-primary" style={{ padding: "5px 16px", fontSize: "0.82rem" }} disabled={submitting}>
                    {submitting ? "Submitting..." : user_lowest_bid ? "Submit Lower Quote" : "Submit Quote"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="card" style={{ padding: "10px 14px", display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexShrink: 0 }}>
            <h2 className="card-title" style={{ fontSize: "0.95rem", margin: 0 }}>Auction Activity Log</h2>
            <span style={{ fontSize: "0.75rem", color: "#888888" }}>{sortedLogs.length} Events</span>
          </div>

          {sortedLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px", color: "#777777", fontSize: "0.84rem" }}>
              No activity logged yet.
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", border: "1px solid #222222", borderRadius: "6px", background: "#0c0c0c", minHeight: 0 }}>
              {sortedLogs.map((l, index) => {
                const isExtended = l.event_type === "AUCTION_EXTENDED";
                const isBlocked = l.event_type === "EXTENSION_BLOCKED";
                const isBid = l.event_type === "BID_SUBMITTED";

                return (
                  <div
                    key={l.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "75px 135px 1fr",
                      alignItems: "center",
                      gap: "8px",
                      padding: "7px 10px",
                      borderBottom: index === sortedLogs.length - 1 ? "none" : "1px solid #1a1a1a",
                      background: isExtended ? "rgba(234, 179, 8, 0.05)" : isBlocked ? "rgba(239, 68, 68, 0.06)" : "transparent"
                    }}
                  >
                    <div style={{ fontSize: "0.72rem", color: "#888888", fontFamily: "monospace" }}>
                      {new Date(l.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                    <div>
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "0.66rem",
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: "4px",
                          letterSpacing: "0.3px",
                          background: isExtended ? "#3d2e05" : isBlocked ? "#3b1111" : isBid ? "#18261e" : "#1f1f1f",
                          color: isExtended ? "#facc15" : isBlocked ? "#f87171" : isBid ? "#4ade80" : "#a1a1aa"
                        }}
                      >
                        {l.event_type}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#d4d4d8", lineHeight: "1.35", wordBreak: "break-word" }}>
                      {l.message}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
