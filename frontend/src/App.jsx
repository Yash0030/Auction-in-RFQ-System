import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ModalProvider } from "./context/ModalContext";
import { Navbar } from "./components/Navbar";
import { CreateAuctionModal } from "./components/CreateAuctionModal";
import { AuctionListPage } from "./pages/AuctionListPage";
import { AuctionDetailPage } from "./pages/AuctionDetailPage";
import { CreateRfqPage } from "./pages/CreateRfqPage";
import { EditRfqPage } from "./pages/EditRfqPage";
import { LoginPage } from "./pages/LoginPage";

function AppRoutes() {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <LoginPage />;
  }

  const isAuctionDetail = location.pathname.startsWith("/auctions/");

  return (
    <div
      style={{
        height: isAuctionDetail ? "100vh" : "auto",
        minHeight: "100vh",
        backgroundColor: "#000000",
        color: "#f4f4f5",
        display: "flex",
        flexDirection: "column",
        overflow: isAuctionDetail ? "hidden" : "visible"
      }}
    >
      <Navbar />
      <CreateAuctionModal />
      <main
        key={location.pathname}
        className="page-transition"
        style={{
          flex: isAuctionDetail ? 1 : "none",
          minHeight: 0,
          display: isAuctionDetail ? "flex" : "block",
          flexDirection: isAuctionDetail ? "column" : "initial",
          overflow: isAuctionDetail ? "hidden" : "visible",
          paddingBottom: isAuctionDetail ? "0" : "60px"
        }}
      >
        <Routes>
          <Route path="/" element={<AuctionListPage />} />
          <Route path="/auctions/:id" element={<AuctionDetailPage />} />
          <Route path="/create-rfq" element={<CreateRfqPage />} />
          <Route path="/edit-rfq/:id" element={<EditRfqPage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ModalProvider>
          <AppRoutes />
        </ModalProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
