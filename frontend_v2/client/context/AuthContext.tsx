import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { devLogin, getMe, loginUser, logoutUser, refreshSession, registerUser } from '../services/api';

interface AuthContextType {
    user: any;
    loading: boolean;
    isAuthenticated: boolean;
    isAdmin: boolean;
    login: (payload: any) => Promise<any>;
    register: (payload: any) => Promise<any>;
    logout: () => Promise<void>;
    demoLogin: (email?: string) => Promise<any>;
    refreshUser: () => Promise<any>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        async function bootstrap() {
            try {
                const me = await getMe();
                if (active) setUser(me.user);
            } catch {
                try {
                    await refreshSession();
                    const me = await getMe();
                    if (active) setUser(me.user);
                } catch {
                    if (active) setUser(null);
                }
            } finally {
                if (active) setLoading(false);
            }
        }
        bootstrap();
        return () => {
            active = false;
        };
    }, []);

    const value = useMemo(
        () => ({
            user,
            loading,
            isAuthenticated: Boolean(user),
            isAdmin: user?.role === 'admin',
            async login(payload: any) {
                const res = await loginUser(payload);
                setUser(res.user);
                return res.user;
            },
            async register(payload: any) {
                const res = await registerUser(payload);
                setUser(res.user);
                return res.user;
            },
            async logout() {
                try {
                    await logoutUser();
                } finally {
                    setUser(null);
                }
            },
            async demoLogin(email = 'aarav@demo.com') {
                const res = await devLogin(email);
                setUser(res.user);
                return res.user;
            },
            async refreshUser() {
                const res = await getMe();
                setUser(res.user);
                return res.user;
            },
        }),
        [loading, user]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used inside AuthProvider');
    }
    return ctx;
}
