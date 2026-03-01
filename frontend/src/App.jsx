import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider, useAuth } from './auth/AuthContext';
import { AdminRoute, ProtectedRoute, PublicOnlyRoute } from './auth/ProtectedRoute';
import AdminDashboard from './components/Admin/AdminDashboard';
import ChatWindow from './components/Chat/ChatWindow';
import UserDashboard from './components/Dashboard/UserDashboard';
import Sidebar from './components/Layout/Sidebar';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import './App.css';

function AppShell() {
    const { user, logout, isAdmin } = useAuth();
    const defaultRoute = isAdmin ? '/admin' : '/';
    return (
        <div className="flex h-screen w-screen overflow-hidden p-4 gap-4">
            <Sidebar user={user} onLogout={logout} />
            <main className="flex-1 overflow-hidden relative glass-panel ml-2">
                <Routes>
                    <Route path="/" element={isAdmin ? <Navigate to="/admin" replace /> : <ChatWindow />} />
                    <Route path="/dashboard" element={isAdmin ? <Navigate to="/admin" replace /> : <UserDashboard />} />
                    <Route
                        path="/admin"
                        element={
                            <AdminRoute>
                                <AdminDashboard />
                            </AdminRoute>
                        }
                    />
                    <Route path="*" element={<Navigate to={defaultRoute} replace />} />
                </Routes>
            </main>
        </div>
    );
}

function AppRoutes() {
    return (
        <Routes>
            <Route
                path="/login"
                element={
                    <PublicOnlyRoute>
                        <LoginPage />
                    </PublicOnlyRoute>
                }
            />
            <Route
                path="/register"
                element={
                    <PublicOnlyRoute>
                        <RegisterPage />
                    </PublicOnlyRoute>
                }
            />
            <Route
                path="/*"
                element={
                    <ProtectedRoute>
                        <AppShell />
                    </ProtectedRoute>
                }
            />
        </Routes>
    );
}

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;

