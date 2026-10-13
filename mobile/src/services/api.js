import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Automatically detect host IP from Expo Go session or use current machine Wi-Fi IP
export const getAutoDetectedHost = () => {
  try {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      Constants.manifest2?.extra?.expoGo?.debuggerHost ||
      Constants.manifest?.debuggerHost;

    if (hostUri) {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        return `http://${ip}:5000/api`;
      }
    }
  } catch (e) {
    console.log('Error detecting host URI:', e);
  }
  // Default to the computer's detected Wi-Fi adapter IP
  return 'http://192.168.43.96:5000/api';
};

export const DEFAULT_BACKEND_URL = getAutoDetectedHost();

const api = axios.create({
  baseURL: DEFAULT_BACKEND_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT token
api.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem('@officer_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    console.error('Error reading auth token:', err);
  }
  return config;
});

// Initialize base URL from AsyncStorage or auto-detected IP
export const initApi = async () => {
  try {
    const savedUrl = await AsyncStorage.getItem('@server_url');
    if (savedUrl && savedUrl.trim()) {
      api.defaults.baseURL = savedUrl.trim();
      return savedUrl.trim();
    }
    const detected = getAutoDetectedHost();
    api.defaults.baseURL = detected;
    return detected;
  } catch (err) {
    return DEFAULT_BACKEND_URL;
  }
};

// Set and persist new base URL
export const setApiBaseUrl = async (newUrl) => {
  if (!newUrl) return api.defaults.baseURL;
  let formatted = newUrl.trim();
  if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
    formatted = `http://${formatted}`;
  }
  if (!formatted.includes('/api')) {
    formatted = formatted.replace(/\/+$/, '') + '/api';
  }
  api.defaults.baseURL = formatted;
  await AsyncStorage.setItem('@server_url', formatted);
  return formatted;
};

// Test if server is reachable
export const pingServer = async (testUrl) => {
  const target = testUrl || api.defaults.baseURL;
  const healthUrl = target.endsWith('/api') ? `${target}/health` : `${target}/api/health`;
  const startTime = Date.now();
  try {
    const res = await axios.get(healthUrl, { timeout: 4000 });
    const latency = Date.now() - startTime;
    return { ok: true, latency, data: res.data };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data?.message || err.message || 'Cannot reach server',
    };
  }
};

export const loginOfficer = async (email, password) => {
  const res = await api.post('/auth/login', { email, password });
  if (res.data?.token) {
    await AsyncStorage.setItem('@officer_token', res.data.token);
    await AsyncStorage.setItem('@officer_user', JSON.stringify(res.data.user));
    if (res.data.officerProfile) {
      await AsyncStorage.setItem('@officer_profile', JSON.stringify(res.data.officerProfile));
    }
  }
  return res.data;
};

export const verifyScan = async ({ qrToken, direction = 'ENTRY', gateId }) => {
  const res = await api.post('/scan/verify', { qrToken, direction, gateId });
  return res.data;
};

export const getAssignedGate = async () => {
  const res = await api.get('/gates/my-assignment');
  return res.data;
};

export const getGatesList = async () => {
  const res = await api.get('/gates');
  return res.data;
};

export const getShiftLogs = async () => {
  const res = await api.get('/scan/shift-logs?limit=30');
  return res.data;
};

export const logoutOfficer = async () => {
  await AsyncStorage.removeItem('@officer_token');
  await AsyncStorage.removeItem('@officer_user');
  await AsyncStorage.removeItem('@officer_profile');
};

export default api;
