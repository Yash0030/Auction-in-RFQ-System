import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";

export const CreateAuctionModal = () => {
  const { isCreateModalOpen, closeCreateModal } = useModal();
  const { API_URL, authHeaders, user } = useAuth();
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

  const [dateErrors, setDateErrors] = useState({
    closeTime: "",
    forcedCloseTime: ""
  });

  // clear form fields on modal open, cancel or submit
  const resetForm = () => {
    setReferenceId("");
    setPickupDate("");
    setBidStartTime("");
    setBidCloseTime("");
    setForcedBidCloseTime("");
    setTriggerWindowMinutes("");
    setExtensionDurationMinutes("");
    setExtensionTrigger("ANY_BID");
    setError("");
    setDateErrors({ closeTime: "", forcedCloseTime: "" });
    setCurrentMinTime(getNowLocal());
  };

  const handleClose = () => {
    resetForm();
    closeCreateModal();
  };

  useEffect(() => {
    if (!isCreateModalOpen) {
      resetForm();
      return;
    }

    resetForm();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCreateModalOpen]);

  if (!isCreateModalOpen || !user || user.role !== "BUYER") {
    return null;
  }

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
      // post rfq payload with british auction settings
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
          trigger_window_minutes: x,
          extension_duration_minutes: y,
          extension_trigger: extensionTrigger
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to create RFQ");
      }

      resetForm();
      closeCreateModal();
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
    <div className="modal-backdrop-blur" onClick={handleClose}>
      <div className="modal-square-box" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #27272a", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0e0e11" }}>
          <div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#ffffff", margin: 0 }}>Create Auction</h2>
            <p style={{ fontSize: "0.82rem", color: "#a1a1aa", margin: "3px 0 0 0" }}>
              Configure RFQ and British Auction parameters
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            style={{ background: "transparent", color: "#a1a1aa", fontSize: "1.4rem", lineHeight: 1, padding: "4px 8px", cursor: "pointer", borderRadius: "4px" }}
          >
            &times;
          </button>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {error && <div className="alert-error" style={{ marginBottom: "16px" }}>{error}</div>}

          <form id="create-auction-form" onSubmit={handleSubmit}>
            <div className="grid-2" style={{ gap: "14px", marginBottom: "14px" }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: "0.8rem" }}>RFQ Name / Reference ID</label>
                <input
                  type="text"
                  required
                  className="form-control"
                  style={{ padding: "8px 12px", fontSize: "0.88rem" }}
                  placeholder="Enter RFQ Name or ID"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: "0.8rem" }}>Pickup / Service Date</label>
                <input
                  type="datetime-local"
                  required
                  min={currentMinTime}
                  className="form-control"
                  style={{ padding: "8px 12px", fontSize: "0.88rem" }}
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid-3" style={{ background: "#151518", padding: "14px", borderRadius: "8px", border: "1px solid #27272a", marginBottom: "16px", gap: "10px" }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: "0.78rem" }}>Bid Start Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  min={currentMinTime}
                  className="form-control"
                  style={{ padding: "7px 10px", fontSize: "0.82rem" }}
                  value={bidStartTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: "0.78rem" }}>Bid Close Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  min={closeTimeMin}
                  className="form-control"
                  style={{ padding: "7px 10px", fontSize: "0.82rem", borderColor: dateErrors.closeTime ? "#ef4444" : "#27272a" }}
                  value={bidCloseTime}
                  onChange={(e) => handleCloseTimeChange(e.target.value)}
                  onBlur={handleCloseTimeBlur}
                />
                {dateErrors.closeTime && (
                  <div style={{ color: "#ef4444", fontSize: "0.72rem", marginTop: "4px" }}>
                    {dateErrors.closeTime}
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: "0.78rem" }}>Forced Bid Close Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  min={forcedCloseTimeMin}
                  className="form-control"
                  style={{ padding: "7px 10px", fontSize: "0.82rem", borderColor: dateErrors.forcedCloseTime ? "#ef4444" : "#27272a" }}
                  value={forcedBidCloseTime}
                  onChange={(e) => handleForcedCloseTimeChange(e.target.value)}
                  onBlur={handleForcedCloseTimeBlur}
                />
                {dateErrors.forcedCloseTime && (
                  <div style={{ color: "#ef4444", fontSize: "0.72rem", marginTop: "4px" }}>
                    {dateErrors.forcedCloseTime}
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: "#151518", padding: "14px", borderRadius: "8px", border: "1px solid #27272a" }}>
              <div style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#ffffff" }}>
                  British Auction Configuration
                </div>
                <div style={{ fontSize: "0.76rem", color: "#a1a1aa" }}>
                  Auto-extension settings when bids occur inside trigger window
                </div>
              </div>

              <div className="grid-3" style={{ paddingTop: "10px", borderTop: "1px solid #27272a", gap: "10px" }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.76rem" }}>Window (X Minutes)</label>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    required
                    placeholder="e.g. 10"
                    className="form-control"
                    style={{ padding: "7px 10px", fontSize: "0.85rem" }}
                    value={triggerWindowMinutes}
                    onChange={(e) => setTriggerWindowMinutes(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.76rem" }}>Extension (Y Minutes)</label>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    required
                    placeholder="e.g. 5"
                    className="form-control"
                    style={{ padding: "7px 10px", fontSize: "0.85rem" }}
                    value={extensionDurationMinutes}
                    onChange={(e) => setExtensionDurationMinutes(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.76rem" }}>Trigger Mode</label>
                  <select
                    className="form-control"
                    style={{ padding: "7px 10px", fontSize: "0.85rem" }}
                    value={extensionTrigger}
                    onChange={(e) => setExtensionTrigger(e.target.value)}
                  >
                    <option value="ANY_BID">Bid in Last X Min</option>
                    <option value="ANY_RANK_CHANGE">Any Rank Change</option>
                    <option value="L1_RANK_CHANGE">L1 Rank Change</option>
                  </select>
                </div>
              </div>
            </div>
          </form>
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid #27272a", display: "flex", justifyContent: "flex-end", gap: "12px", background: "#0e0e11" }}>
          <button type="button" className="btn btn-secondary" style={{ padding: "7px 16px", fontSize: "0.85rem" }} onClick={handleClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="create-auction-form"
            className="btn btn-primary"
            style={{ padding: "7px 20px", fontSize: "0.85rem" }}
            disabled={submitting || Boolean(dateErrors.closeTime) || Boolean(dateErrors.forcedCloseTime)}
          >
            {submitting ? "Publishing..." : "Create Auction"}
          </button>
        </div>
      </div>
    </div>
  );
};

