/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { devLogin, getMe, loginUser, logoutUser, refreshSession, registerUser } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
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
            async login(payload) {
                const res = await loginUser(payload);
                setUser(res.user);
                return res.user;
            },
            async register(payload) {
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
