import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { authLogin, fetchCurrentUser, ChurchUser } from "@/services/authService";

interface AuthState {
  user: ChurchUser | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const TOKEN_KEY = "shephr_token";
const USER_KEY = "shephr_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ChurchUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    if (storedToken) {
      setToken(storedToken);
      if (storedUser) {
        try { setUser(JSON.parse(storedUser)); } catch { /* noop */ }
      }
      fetchCurrentUser(storedToken)
        .then((u) => {
          if (u) {
            setUser(u);
            localStorage.setItem(USER_KEY, JSON.stringify(u));
          }
        })
        .catch(() => { /* token may be expired */ })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { token: newToken } = await authLogin(email, password);
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    const me = await fetchCurrentUser(newToken);
    if (me) {
      setUser(me);
      localStorage.setItem(USER_KEY, JSON.stringify(me));
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user, token, loading, isAuthenticated: !!token, login, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
