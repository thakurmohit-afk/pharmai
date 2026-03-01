import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, ShieldCheck, HeartPulse } from 'lucide-react';

import { useAuth } from '../auth/AuthContext';

const DEMO_EMAILS = [
    'aarav@demo.com',
    'priya@demo.com',
    'rahul@demo.com',
    'admin@demo.com',
];

export default function LoginPage() {
    const navigate = useNavigate();
    const { login, demoLogin } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const allowDemoBypass = import.meta.env.VITE_ALLOW_DEMO_BYPASS === 'true';

    async function handleSubmit(event) {
        event.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login({ email, password });
            navigate('/');
        } catch (err) {
            setError(err.message || 'Login failed.');
        } finally {
            setLoading(false);
        }
    }

    async function handleDemo(emailAddress) {
        setError('');
        setLoading(true);
        try {
            await demoLogin(emailAddress);
            navigate('/');
        } catch (err) {
            setError(err.message || 'Demo login failed.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen w-full font-sans bg-surface-950 text-surface-50 selection:bg-primary-500/30">

            {/* Left Side - Visual / Branding */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12 bg-gradient-to-br from-surface-900 to-primary-950 border-r border-white/5">
                {/* Abstract animated background elements */}
                <div className="absolute inset-0 pointer-events-none">
                    <motion.div
                        animate={{
                            transform: ['translate(0%, 0%) scale(1)', 'translate(5%, 10%) scale(1.05)', 'translate(0%, 0%) scale(1)']
                        }}
                        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
                        className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-primary-600/10 blur-[120px]"
                    />
                    <motion.div
                        animate={{
                            transform: ['translate(0%, 0%) scale(1)', 'translate(-5%, -10%) scale(1.1)', 'translate(0%, 0%) scale(1)']
                        }}
                        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                        className="absolute bottom-[10%] -right-[20%] w-[60%] h-[60%] rounded-full bg-accent-500/10 blur-[100px]"
                    />
                </div>

                <div className="relative z-10 flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-500/30">
                        <Activity className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-2xl font-bold tracking-tight text-white">PharmAI</span>
                </div>

                <div className="relative z-10 max-w-lg mt-auto mb-20">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="text-5xl font-extrabold tracking-tight leading-tight mb-6"
                    >
                        Intelligence for your <span className="text-gradient-bright">wellbeing.</span>
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.4 }}
                        className="text-lg text-surface-200/80 leading-relaxed max-w-md"
                    >
                        Seamlessly order prescriptions, track your health history, and interact with our AI pharmacist all in one secure platform.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1, delay: 0.8 }}
                        className="flex gap-6 mt-12"
                    >
                        <div className="flex items-center gap-2 text-sm font-medium text-surface-300">
                            <ShieldCheck className="w-4 h-4 text-accent-400" /> Secure Data
                        </div>
                        <div className="flex items-center gap-2 text-sm font-medium text-surface-300">
                            <HeartPulse className="w-4 h-4 text-primary-400" /> Proactive Care
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-24 relative">
                {/* Mobile branded header (only visible on small screens) */}
                <div className="absolute top-8 left-8 flex lg:hidden items-center gap-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-500/30">
                        <Activity className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-white">PharmAI</span>
                </div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="w-full max-w-sm"
                >
                    <div className="mb-10 lg:mb-12">
                        <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Welcome back</h2>
                        <p className="text-surface-300 text-sm">Please enter your details to sign in.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wider text-surface-400 ml-1">Email Address</label>
                            <input
                                type="email"
                                className="w-full bg-surface-800/50 border border-surface-700/50 text-white placeholder-surface-500 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all duration-200 backdrop-blur-sm"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center justify-between ml-1">
                                <label className="text-xs font-semibold uppercase tracking-wider text-surface-400">Password</label>
                                <a href="#" className="text-xs font-medium text-primary-400 hover:text-primary-300 transition-colors">Forgot password?</a>
                            </div>
                            <input
                                type="password"
                                className="w-full bg-surface-800/50 border border-surface-700/50 text-white placeholder-surface-500 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all duration-200 backdrop-blur-sm"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        {error && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="text-sm text-danger-400 bg-danger-500/10 border border-danger-500/20 rounded-lg px-4 py-3"
                            >
                                {error}
                            </motion.div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white font-medium rounded-xl px-4 py-3.5 mt-2 transition-all duration-200 shadow-lg shadow-primary-500/25 active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Signing in...</span>
                                </>
                            ) : (
                                <span>Sign in</span>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-center text-sm text-surface-400">
                        Don't have an account?{' '}
                        <Link to="/register" className="font-medium text-primary-400 hover:text-primary-300 transition-colors">
                            Sign up for free
                        </Link>
                    </div>

                    {allowDemoBypass && (
                        <div className="mt-12">
                            <div className="relative flex items-center py-5">
                                <div className="flex-grow border-t border-surface-800"></div>
                                <span className="flex-shrink-0 mx-4 text-xs font-medium text-surface-500 uppercase tracking-widest">Demo Access</span>
                                <div className="flex-grow border-t border-surface-800"></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {DEMO_EMAILS.map((demoEmail) => (
                                    <button
                                        key={demoEmail}
                                        type="button"
                                        onClick={() => handleDemo(demoEmail)}
                                        disabled={loading}
                                        className="bg-surface-800/30 hover:bg-surface-800/80 border border-surface-700/50 text-surface-300 text-xs font-medium rounded-lg px-3 py-2.5 transition-colors"
                                    >
                                        {demoEmail.split('@')[0]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}
