import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [officerProfile, setOfficerProfile] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.data.user);
          setOfficerProfile(res.data.officerProfile || null);
        } catch (err) {
          console.error('Session restoration failed:', err);
          logout();
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token: receivedToken, user: receivedUser, officerProfile: receivedOfficer } = res.data;

    localStorage.setItem('token', receivedToken);
    setToken(receivedToken);
    setUser(receivedUser);
    setOfficerProfile(receivedOfficer || null);
    return receivedUser;
  };

  const register = async (userData) => {
    const res = await api.post('/auth/register', userData);
    const { token: receivedToken, user: receivedUser } = res.data;

    localStorage.setItem('token', receivedToken);
    setToken(receivedToken);
    setUser(receivedUser);
    return receivedUser;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setOfficerProfile(null);
  };

  const refreshUser = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
      setOfficerProfile(res.data.officerProfile || null);
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  };

  const value = {
    user,
    officerProfile,
    token,
    isAuthenticated: !!user,
    loading,
    login,
    register,
    logout,
    refreshUser,
    isAdmin: user?.role === 'ADMIN',
    isGateOfficer: user?.role === 'GATE_OFFICER',
    isStudent: user?.role === 'STUDENT',
    isStaff: user?.role === 'STAFF',
    isVisitor: user?.role === 'VISITOR',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
