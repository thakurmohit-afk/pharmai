import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute, PublicOnlyRoute } from "@/components/auth/ProtectedRoute";

import Index from "./pages/Index";
import ChatPage from "./pages/ChatPage";
import SplineMock from "./pages/SplineMock";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";
import AdminPage from "./pages/AdminPage";
import WorkspacePage from "./pages/WorkspacePage";
import MedicationsPage from "./pages/MedicationsPage";
import RefillsPage from "./pages/RefillsPage";
import HealthPage from "./pages/HealthPage";
import PrescriptionsPage from "./pages/PrescriptionsPage";
import OrdersPage from "./pages/OrdersPage";
import SpendingPage from "./pages/SpendingPage";
import SearchPage from "./pages/SearchPage";
import CartPage from "./pages/CartPage";

const queryClient = new QueryClient();

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                {/* Public Routes */}
                <Route element={<PublicOnlyRoute />}>
                  <Route path="/login" element={<LoginPage />} />
                </Route>

                {/* Protected Routes */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/workspace" element={<WorkspacePage />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/medications" element={<MedicationsPage />} />
                  <Route path="/refills" element={<RefillsPage />} />
                  <Route path="/health" element={<HealthPage />} />
                  <Route path="/prescriptions" element={<PrescriptionsPage />} />
                  <Route path="/orders" element={<OrdersPage />} />
                  <Route path="/spending" element={<SpendingPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/cart" element={<CartPage />} />
                  <Route path="/spline" element={<SplineMock />} />
                </Route>

                {/* Admin Routes */}
                <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
                  <Route path="/admin/*" element={<AdminPage />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
