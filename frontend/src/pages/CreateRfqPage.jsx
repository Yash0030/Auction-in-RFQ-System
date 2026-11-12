import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const CreateRfqPage = () => {
  const { API_URL, authHeaders } = useAuth();
  const navigate = useNavigate();

  const getNowLocal = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [currentMinTime, setCurrentMinTime] = useState(getNowLocal());
  const [referenceId, setReferenceId] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [bidStartTime, setBidStartTime] = useState("");
  const [bidCloseTime, setBidCloseTime] = useState("");
  const [forcedBidCloseTime, setForcedBidCloseTime] = useState("");
  const [triggerWindowMinutes, setTriggerWindowMinutes] = useState("");
  const [extensionDurationMinutes, setExtensionDurationMinutes] = useState("");
  const [extensionTrigger, setExtensionTrigger] = useState("ANY_BID");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentMinTime(getNowLocal());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const [dateErrors, setDateErrors] = useState({
    closeTime: "",
    forcedCloseTime: ""
  });

  const handleStartTimeChange = (val) => {
    setBidStartTime(val);
    setDateErrors({ closeTime: "", forcedCloseTime: "" });
    if (bidCloseTime && val && new Date(bidCloseTime) <= new Date(val)) {
      setBidCloseTime("");
      setForcedBidCloseTime("");
      setDateErrors((prev) => ({
        ...prev,
        closeTime: "Bid Close Time must be later than Bid Start Time."
      }));
    }
  };

  const handleCloseTimeChange = (val) => {
    if (!val) {
      setBidCloseTime("");
      return;
    }

    if (bidStartTime && new Date(val) <= new Date(bidStartTime)) {
      setBidCloseTime(val);
      setDateErrors((prev) => ({
        ...prev,
        closeTime: "Bid Close Time cannot be earlier than or equal to Bid Start Time."
      }));
      return;
    }

    setDateErrors((prev) => ({ ...prev, closeTime: "" }));
    setBidCloseTime(val);

    if (forcedBidCloseTime && new Date(forcedBidCloseTime) <= new Date(val)) {
      setForcedBidCloseTime("");
    }
  };

  const handleForcedCloseTimeChange = (val) => {
    if (!val) {
      setForcedBidCloseTime("");
      return;
    }

    if (bidCloseTime && new Date(val) <= new Date(bidCloseTime)) {
      setForcedBidCloseTime(val);
      setDateErrors((prev) => ({
        ...prev,
        forcedCloseTime: "Forced Close Time must be strictly later than Bid Close Time."
      }));
      return;
    }

    setDateErrors((prev) => ({ ...prev, forcedCloseTime: "" }));
    setForcedBidCloseTime(val);
  };

  const handleCloseTimeBlur = () => {
    if (bidCloseTime && bidStartTime && new Date(bidCloseTime) <= new Date(bidStartTime)) {
      setBidCloseTime("");
      setDateErrors((prev) => ({
        ...prev,
        closeTime: "Invalid time reset. Bid Close Time must be later than Bid Start Time."
      }));
    }
  };

  const handleForcedCloseTimeBlur = () => {
    if (forcedBidCloseTime && bidCloseTime && new Date(forcedBidCloseTime) <= new Date(bidCloseTime)) {
      setForcedBidCloseTime("");
      setDateErrors((prev) => ({
        ...prev,
        forcedCloseTime: "Invalid time reset. Forced Close Time must be later than Bid Close Time."
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!bidStartTime) {
      setError("Please select Bid Start Date & Time.");
      return;
    }

    if (!bidCloseTime) {
      setError("Please select Bid Close Date & Time.");
      return;
    }

    if (!forcedBidCloseTime) {
      setError("Please select Forced Bid Close Date & Time.");
      return;
    }

    const start = new Date(bidStartTime);
    const close = new Date(bidCloseTime);
    const forced = new Date(forcedBidCloseTime);

    if (close <= start) {
      setError("Bid Close Date & Time must be strictly later than Bid Start Date & Time.");
      return;
    }

    if (forced <= close) {
      setError("Forced Bid Close Date & Time must be strictly later than Bid Close Date & Time.");
      return;
    }

    const x = parseInt(triggerWindowMinutes, 10);
    const y = parseInt(extensionDurationMinutes, 10);
    if (isNaN(x) || x <= 0) {
      setError("Please enter a valid Trigger Window (X Minutes).");
      return;
    }
    if (isNaN(y) || y <= 0) {
      setError("Please enter a valid Extension Duration (Y Minutes).");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/rfqs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        body: JSON.stringify({
          reference_id: referenceId,
          pickup_date: new Date(pickupDate).toISOString(),
          bid_start_time: start.toISOString(),
          bid_close_time: close.toISOString(),
          forced_bid_close_time: forced.toISOString(),
          is_british_auction: true,
          trigger_window_minutes: parseInt(triggerWindowMinutes, 10),
          extension_duration_minutes: parseInt(extensionDurationMinutes, 10),
          extension_trigger: extensionTrigger
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to create Auction");
      }
      navigate(`/auctions/${data.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const closeTimeMin = bidStartTime ? bidStartTime : currentMinTime;
  const forcedCloseTimeMin = bidCloseTime ? bidCloseTime : closeTimeMin;

  return (
    <div className="container" style={{ maxWidth: "780px" }}>
      <div className="card">
        <h2 className="card-title">Create Auctions</h2>
        <p style={{ fontSize: "0.88rem", color: "#a1a1aa", marginBottom: "22px" }}>
          Fill in the required RFQ details and British Auction configuration.
        </p>

        {error && <div className="alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">RFQ Name / Reference ID</label>
              <input
                type="text"
                required
                className="form-control"
                placeholder="Enter RFQ Name or Reference ID"
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Pickup / Service Date</label>
              <input
                type="datetime-local"
                required
                min={currentMinTime}
                className="form-control"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid-3" style={{ background: "#18181b", padding: "18px", borderRadius: "8px", border: "1px solid #27272a", marginBottom: "22px" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Bid Start Date & Time</label>
              <input
                type="datetime-local"
                required
                min={currentMinTime}
                className="form-control"
                value={bidStartTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Bid Close Date & Time</label>
              <input
                type="datetime-local"
                required
                min={closeTimeMin}
                className="form-control"
                style={{ borderColor: dateErrors.closeTime ? "#ef4444" : "#27272a" }}
                value={bidCloseTime}
                onChange={(e) => handleCloseTimeChange(e.target.value)}
                onBlur={handleCloseTimeBlur}
              />
              {dateErrors.closeTime && (
                <div style={{ color: "#ef4444", fontSize: "0.76rem", marginTop: "5px" }}>
                  {dateErrors.closeTime}
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Forced Bid Close Date & Time</label>
              <input
                type="datetime-local"
                required
                min={forcedCloseTimeMin}
                className="form-control"
                style={{ borderColor: dateErrors.forcedCloseTime ? "#ef4444" : "#27272a" }}
                value={forcedBidCloseTime}
                onChange={(e) => handleForcedCloseTimeChange(e.target.value)}
                onBlur={handleForcedCloseTimeBlur}
              />
              {dateErrors.forcedCloseTime && (
                <div style={{ color: "#ef4444", fontSize: "0.76rem", marginTop: "5px" }}>
                  {dateErrors.forcedCloseTime}
                </div>
              )}
            </div>
          </div>

          <div style={{ background: "#18181b", padding: "18px", borderRadius: "8px", border: "1px solid #27272a", marginBottom: "24px" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#ffffff" }}>
                British Auction Configuration
              </div>
              <div style={{ fontSize: "0.82rem", color: "#a1a1aa" }}>
                Configure automatic bid-time extensions and forced close triggers
              </div>
            </div>

            <div className="grid-3" style={{ paddingTop: "14px", borderTop: "1px solid #27272a" }}>
              <div className="form-group">
                <label className="form-label">Trigger Window (X Minutes)</label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  required
                  placeholder="e.g. 10"
                  className="form-control"
                  value={triggerWindowMinutes}
                  onChange={(e) => setTriggerWindowMinutes(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Extension Duration (Y Minutes)</label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  required
                  placeholder="e.g. 5"
                  className="form-control"
                  value={extensionDurationMinutes}
                  onChange={(e) => setExtensionDurationMinutes(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Extension Trigger</label>
                <select
                  className="form-control"
                  value={extensionTrigger}
                  onChange={(e) => setExtensionTrigger(e.target.value)}
                >
                  <option value="ANY_BID">Bid Received in Last X Minutes</option>
                  <option value="ANY_RANK_CHANGE">Any Supplier Rank Change in Last X Minutes</option>
                  <option value="L1_RANK_CHANGE">Lowest Bidder (L1) Rank Change in Last X Minutes</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || Boolean(dateErrors.closeTime) || Boolean(dateErrors.forcedCloseTime)}
            >
              {submitting ? "Publishing..." : "Create Auctions"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
