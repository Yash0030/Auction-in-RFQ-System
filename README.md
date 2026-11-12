# RFQ British Auction System

A real-time logistics procurement platform implementing British Auction mechanics for freight Requests for Quotation (RFQs). Buyers publish logistics freight tenders with configurable auto-extension policies, while suppliers submit competitive multi-component bids and track live rank movements. The engine dynamically extends auction deadlines on qualifying last-minute bidding activity while strictly enforcing hard ceiling limits.

---

## 1. Background & Core Concepts

### What is an RFQ?
A Request for Quotation (RFQ) is a procurement workflow where a buyer requests multiple freight forwarders and logistics providers to submit competitive price quotes for moving cargo across designated trade lanes. Suppliers compete on freight costs, origin charges, destination fees, transit times, and service validity.

### What is a British Auction?
In logistics procurement, a British Auction is a reverse dynamic bidding model designed to maximize price discovery and eliminate unfair sniping:
- Suppliers submit binding quotes openly during the active bidding window.
- Each supplier can continuously submit lower quotes to improve their rank (from Ln towards L1).
- If competitive activity occurs within a defined trigger window (the final X minutes of the auction), the closing deadline automatically extends by Y minutes.
- A forced close ceiling sets a hard non-negotiable deadline beyond which no extensions are permitted under any condition.

---

## 2. Key System Capabilities

- Dynamic Extension Trigger Modes:
  - `ANY_BID`: Any valid bid submitted in the final X minutes extends the closing time by Y minutes.
  - `ANY_RANK_CHANGE`: Any bid causing a shift anywhere on the leaderboard extends the closing time by Y minutes.
  - `L1_RANK_CHANGE`: Only bids taking over the lowest-price L1 position extend the closing time by Y minutes.
- Forced Close Ceiling Protection: Prevents infinite extension loops. If an extension would exceed the forced close time, the closing time is capped at the ceiling and subsequent extensions are blocked.
- Continuous Monitor Period Highlight: When an active auction enters its final X-minute trigger window, the countdown timer transitions into an animated glowing monitor state to alert participants.
- Deterministic Tie-Breaking Engine: Guaranteed unambiguous ranking order based on price and timestamp priority.
- Automated Background Lifecycle: An Asyncio background worker scans auctions every 30 seconds to promote upcoming tenders to ACTIVE and finalize expired tenders.
- Real-Time Push Notifications: Socket.IO WebSocket architecture broadcasting instant leaderboard shifts, extension alerts, and audit updates without polling or manual refreshes.

---

## 3. Auction Management (Buyer Operations)

### Create Auction
- Accessible via the Buyer Console modal popup featuring backdrop blur and responsive square framing.
- Enforces strict chronological date validation:
  - Bid Start Time must be equal to or later than current time.
  - Bid Close Time must be strictly later than Bid Start Time.
  - Forced Close Time must be strictly later than Bid Close Time.
  - Trigger Window (X) and Extension Duration (Y) must be positive integers.
- Automated State Reset: All form fields, date errors, and minimum time boundaries reset cleanly upon opening, closing, or publishing, preventing stale data retention.

### Edit Auction
- Buyers can modify tender details for any upcoming auction in `DRAFT` status via the dedicated Edit Auction interface.
- Editable parameters include Reference ID, Title, Description, Pickup Date, Start Time, Close Time, Forced Close Time, and British Auction settings (X, Y, Trigger Mode).
- Modifying times triggers automated server validation.
- Updates are saved to PostgreSQL and immediately broadcast through Socket.IO (`rfq_updated`), synchronizing all connected client screens without reloading.
- Editing is strictly locked once an auction transitions to `ACTIVE`, `CLOSED`, or `FORCE_CLOSED`.

### Delete Auction
- Buyers can safely remove auctions when in `DRAFT`, `CLOSED`, or `FORCE_CLOSED` status.
- Prevents deletion during `ACTIVE` status to protect active competitive bidding rounds.
- Database integrity: Deletion triggers foreign key cascades, purging all associated quote bids and activity logs.
- Real-time broadcast: Emits an `rfq_deleted` Socket.IO event, notifying active viewers and redirecting them back to the main auctions dashboard.

---

## 4. Deterministic Tie-Breaking and Ranking Rules

The auction ranking engine evaluates quotes using deterministic SQL sorting:

```sql
ORDER BY total_amount ASC, submitted_at ASC
```

### Ranking Rules
1. Multi-Component Price Aggregation:
   `total_amount = freight_charges + origin_charges + destination_charges`
2. Lowest Total Wins (L1):
   Suppliers are ranked from lowest total amount to highest total amount (L1, L2, L3, ... Ln).
3. Timestamp Priority Tie-Breaker:
   If two or more suppliers submit quotes with the exact same total amount, the supplier who submitted earlier retains the higher rank.
   - Example: Supplier A submits $25.00 at 02:19:55 PM. Supplier B submits $25.00 at 02:20:29 PM. Supplier A is awarded L1, and Supplier B is assigned L2.
4. Bid Progression Rule:
   A supplier cannot submit a quote higher than or equal to their own previously submitted lowest quote. Each successive quote from the same supplier must strictly improve their own best offer.

---

## 5. Database Architecture and Schema

The application uses PostgreSQL with SQLAlchemy ORM. The relational model consists of 4 core tables:

```text
+-------------------+       1:N       +-----------------------------+
|       users       | --------------> |            rfqs             |
| (Buyers/Suppliers)|                 | (Tenders & British Config)  |
+-------------------+                 +-----------------------------+
          |                                          |
          | 1:N                                      | 1:N (Cascade)
          v                                          v
+-------------------+       1:N       +-----------------------------+
|    quote_bids     | <-------------- |        activity_logs        |
|  (Freight Quotes) |                 |     (Chronological Audit)   |
+-------------------+                 +-----------------------------+
```

### Table Definitions

#### `users`
Stores user identities, hashed credentials, and role authorizations.
- `id` (Integer, Primary Key)
- `name` (String 100, Not Null)
- `email` (String 255, Unique, Indexed, Not Null)
- `password_hash` (String 255, Not Null)
- `role` (String 20, Not Null) - Restricted to `BUYER` or `SUPPLIER`
- `created_at` (DateTime, Default UTC Now)

#### `rfqs`
Stores auction definitions, trade lane parameters, timing bounds, and extension policies.
- `id` (Integer, Primary Key)
- `reference_id` (String 100, Unique, Indexed, Not Null)
- `title` (String 255, Not Null)
- `description` (Text, Nullable)
- `pickup_date` (DateTime, Not Null)
- `bid_start_time` (DateTime, Not Null)
- `bid_close_time` (DateTime, Not Null)
- `forced_bid_close_time` (DateTime, Not Null)
- `is_british_auction` (Boolean, Default True)
- `trigger_window_minutes` (Integer, Default 5) - Window X
- `extension_duration_minutes` (Integer, Default 5) - Extension Y
- `extension_trigger` (String 50, Default "ANY_BID") - Options: `ANY_BID`, `ANY_RANK_CHANGE`, `L1_RANK_CHANGE`
- `status` (String 20, Default "DRAFT") - Values: `DRAFT`, `ACTIVE`, `CLOSED`, `FORCE_CLOSED`
- `created_by` (Integer, Foreign Key -> `users.id`, Not Null)
- `created_at` (DateTime, Default UTC Now)

#### `quote_bids`
Stores individual supplier bids, cost breakdowns, and submission timestamps.
- `id` (Integer, Primary Key)
- `rfq_id` (Integer, Foreign Key -> `rfqs.id` ON DELETE CASCADE, Not Null)
- `supplier_id` (Integer, Foreign Key -> `users.id`, Not Null)
- `carrier_name` (String 100, Not Null)
- `freight_charges` (Numeric 10,2, Not Null)
- `origin_charges` (Numeric 10,2, Not Null)
- `destination_charges` (Numeric 10,2, Not Null)
- `total_amount` (Numeric 10,2, Indexed, Not Null)
- `transit_time` (String 50, Not Null)
- `quote_validity` (DateTime, Not Null)
- `submitted_at` (DateTime, Default UTC Now, Indexed, Not Null)

#### `activity_logs`
Immutable audit log tracking all operational events chronologically.
- `id` (Integer, Primary Key)
- `rfq_id` (Integer, Foreign Key -> `rfqs.id` ON DELETE CASCADE, Not Null)
- `event_type` (String 50, Not Null) - Types: `RFQ_CREATED`, `STATUS_CHANGE`, `BID_SUBMITTED`, `AUCTION_EXTENDED`, `EXTENSION_BLOCKED`
- `message` (Text, Not Null)
- `created_at` (DateTime, Default Local Timestamp, Not Null)

### Relational Integrity Rules
- `users` -> `rfqs` (1:N): One buyer creates many tenders via `rfqs.created_by`.
- `users` -> `quote_bids` (1:N): One supplier submits multiple quotes via `quote_bids.supplier_id`.
- `rfqs` -> `quote_bids` (1:N, Cascade): Quotes are bound to an RFQ. Deleting an RFQ purges all its quotes.
- `rfqs` -> `activity_logs` (1:N, Cascade): Audit logs are bound to an RFQ. Deleting an RFQ purges all its logs.
- Audit Chronology: Logs are queried with `ORDER BY created_at DESC, id DESC`, ensuring the latest real-time events render at the top.

---

## 6. Real-Time Architecture & Scheduler

### Asyncio Background Scheduler
- Runs every 30 seconds as an independent ASGI background task.
- Scans `DRAFT` auctions: promotes to `ACTIVE` when `now >= bid_start_time`.
- Scans `ACTIVE` auctions: closes to `CLOSED` when `now >= bid_close_time`.
- Scans `ACTIVE` auctions: force-closes to `FORCE_CLOSED` when `now >= forced_bid_close_time`.
- Commits state changes and pushes WebSocket updates to all active rooms.

### Socket.IO Real-Time Engine
- Rooms: Each auction maps to an isolated room named `rfq_{id}`.
- Global Channel: Broadcasts creation, deletion, and status changes across the dashboard.
- Events:
  - `join_rfq`: Client joins specific auction room.
  - `leave_rfq`: Client leaves auction room.
  - `rfq_updated`: Broadcasts fresh bids, recalculated rankings, timer extensions, and logs.
  - `rfq_deleted`: Alerts viewers that an auction has been removed.

---

## 7. Project Structure

```text
RFQ-Auction/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── database.py
│   │   │   ├── deps.py
│   │   │   └── security.py
│   │   ├── models/
│   │   │   ├── activity_log.py
│   │   │   ├── bid.py
│   │   │   ├── rfq.py
│   │   │   └── user.py
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── bids.py
│   │   │   └── rfqs.py
│   │   ├── schemas/
│   │   │   ├── activity_log.py
│   │   │   ├── bid.py
│   │   │   ├── rfq.py
│   │   │   └── user.py
│   │   ├── services/
│   │   │   ├── auction_engine.py
│   │   │   ├── auth_service.py
│   │   │   ├── bidding_service.py
│   │   │   ├── rfq_service.py
│   │   │   └── scheduler.py
│   │   └── sockets/
│   │       └── server.py
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CreateAuctionModal.jsx
│   │   │   └── Navbar.jsx
│   │   ├── context/
│   │   │   ├── AuthContext.jsx
│   │   │   └── ModalContext.jsx
│   │   ├── pages/
│   │   │   ├── AuctionDetailPage.jsx
│   │   │   ├── AuctionListPage.jsx
│   │   │   ├── CreateRfqPage.jsx
│   │   │   ├── EditRfqPage.jsx
│   │   │   └── LoginPage.jsx
│   │   ├── App.jsx
│   │   ├── index.css
│   │   ├── main.jsx
│   │   └── socket.js
│   ├── package.json
│   └── vite.config.js
├── HLD.pdf
├── DB_SCHEMA.pdf
├── DB_SCHEMA.png
└── README.md
```

---

## 8. Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL instance running

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure environment variables in `backend/.env`:
```env
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/rfq_auction
JWT_SECRET=supersecretkey1234567890abcdef
PORT=8000
```

5. Start the FastAPI ASGI server:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
*(Alternatively, run `python main.py`, which executes the same Uvicorn instance directly).*

Database tables are automatically created on initial startup via SQLAlchemy (`Base.metadata.create_all`). Backend API and Socket.IO server will be accessible at http://localhost:8000.

---

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the Vite development server:
```bash
npm run dev
```
The application will be accessible at http://localhost:5173.

---

## 9. User Roles & Access Scope

Users can register directly via the UI or API endpoint (`/api/auth/register`) as either:

| Role | Access Scope |
|------|--------------|
| BUYER | Create auctions, edit upcoming auctions (DRAFT), delete auctions (DRAFT, CLOSED, FORCE_CLOSED), monitor live leaderboards, and inspect real-time activity logs |
| SUPPLIER | Submit freight quotes, view personal rank (L1-Ln), track competitive price improvements, and receive live British Auction extension alerts |

