import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, Lock, Mail, ArrowRight, AlertCircle, Info } from 'lucide-react';

export const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const redirectAfterLogin = (role) => {
    if (role === 'ADMIN') navigate('/admin');
    else if (role === 'GATE_OFFICER') navigate('/scanner');
    else navigate('/dashboard');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      redirectAfterLogin(user.role);
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-8 space-y-6">
      <div className="text-center space-y-3">
        <div className="inline-flex p-2 rounded-2xl bg-white shadow-md border border-slate-200 mx-auto">
          <img
            src="/kasu-logo.png"
            alt="Kaduna State University Logo"
            className="w-16 h-16 object-contain"
          />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Sign In to KASU Pass
          </h1>
          <p className="text-xs text-slate-600 font-medium">
            Kaduna State University &bull; Vehicle Gate Pass Portal
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {/* Main Login Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-lg space-y-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Account Email</label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@kasu.edu.ng or officer@kasu.edu.ng"
                className="w-full px-3.5 py-2.5 pl-10 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-kasu-green-600 bg-slate-50 focus:bg-white transition text-slate-900"
              />
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Password</label>
              <Link to="/forgot-password" className="text-xs text-kasu-red-800 font-bold hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 pl-10 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-kasu-green-600 bg-slate-50 focus:bg-white transition text-slate-900"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-kasu-red-800 to-kasu-red-700 hover:from-kasu-red-700 hover:to-kasu-red-600 text-white font-black text-xs uppercase tracking-wider shadow-md transition flex items-center justify-center gap-2 border border-kasu-red-600 disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In to Portal'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <div className="pt-3 text-center text-xs text-slate-600 border-t border-slate-200">
          Vehicle Owner / Student / Staff?{' '}
          <Link to="/register" className="text-kasu-red-800 font-black hover:underline">
            Register Vehicle Pass
          </Link>
        </div>
      </div>

      {/* Admin Notice */}
      <div className="bg-slate-100 rounded-2xl p-4 border border-slate-200 text-slate-700 text-xs flex items-center gap-2.5">
        <Info className="w-4 h-4 text-kasu-green-800 shrink-0" />
        <div>
          <span className="font-bold text-slate-900">Administrator Access:</span> Sign in with your security admin credentials to manage campus gate passes, register officers, and assign gates.
        </div>
      </div>
    </div>
  );
};

export default Login;
