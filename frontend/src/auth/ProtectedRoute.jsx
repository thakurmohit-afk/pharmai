import { Navigate } from 'react-router-dom';

import { useAuth } from './AuthContext';

function FullscreenLoader() {
    return (
        <div className="flex h-screen w-screen items-center justify-center text-surface-200/60">
            Loading...
        </div>
    );
}

export function ProtectedRoute({ children }) {
    const { loading, isAuthenticated } = useAuth();
    if (loading) return <FullscreenLoader />;
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    return children;
}

export function AdminRoute({ children }) {
    const { loading, isAuthenticated, isAdmin } = useAuth();
    if (loading) return <FullscreenLoader />;
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (!isAdmin) return <Navigate to="/" replace />;
    return children;
}

export function PublicOnlyRoute({ children }) {
    const { loading, isAuthenticated, isAdmin } = useAuth();
    if (loading) return <FullscreenLoader />;
    if (isAuthenticated) return <Navigate to={isAdmin ? '/admin' : '/'} replace />;
    return children;
}

