import type { AuthResponse, MeResponse } from "@colokin/shared";
import * as SecureStore from "expo-secure-store";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getMeRequest,
  loginRequest,
  logoutRequest,
  refreshRequest,
  registerRequest,
} from "../lib/api";

type AuthSession = {
  accessToken: string;
  refreshToken: string;
};

type AuthContextValue = {
  accessToken: string | null;
  bootstrapping: boolean;
  login: (input: { emailOrPhone: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  me: MeResponse | null;
  refreshMe: () => Promise<void>;
  register: (input: {
    email: string;
    name: string;
    password: string;
    phone: string;
  }) => Promise<void>;
};

const accessTokenKey = "colokin.accessToken";
const refreshTokenKey = "colokin.refreshToken";

const AuthContext = createContext<AuthContextValue | null>(null);

async function readStoredSession(): Promise<AuthSession | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(accessTokenKey),
    SecureStore.getItemAsync(refreshTokenKey),
  ]);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken };
}

async function storeSession(session: AuthSession) {
  await Promise.all([
    SecureStore.setItemAsync(accessTokenKey, session.accessToken),
    SecureStore.setItemAsync(refreshTokenKey, session.refreshToken),
  ]);
}

async function clearStoredSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(accessTokenKey),
    SecureStore.deleteItemAsync(refreshTokenKey),
  ]);
}

function sessionFromAuthResponse(response: AuthResponse): AuthSession {
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  const applyAuthResponse = useCallback(async (response: AuthResponse) => {
    const nextSession = sessionFromAuthResponse(response);
    await storeSession(nextSession);
    setAccessToken(nextSession.accessToken);
    setRefreshToken(nextSession.refreshToken);

    const profile = await getMeRequest(nextSession.accessToken);
    setMe(profile);
  }, []);

  const clearSession = useCallback(async () => {
    await clearStoredSession();
    setAccessToken(null);
    setRefreshToken(null);
    setMe(null);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setMe(await getMeRequest(accessToken));
  }, [accessToken]);

  const recoverWithRefreshToken = useCallback(
    async (storedRefreshToken: string) => {
      const response = await refreshRequest(storedRefreshToken);
      await applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const storedSession = await readStoredSession();
        if (!storedSession) {
          return;
        }

        try {
          const profile = await getMeRequest(storedSession.accessToken);
          if (cancelled) {
            return;
          }
          setAccessToken(storedSession.accessToken);
          setRefreshToken(storedSession.refreshToken);
          setMe(profile);
        } catch {
          if (!cancelled) {
            await recoverWithRefreshToken(storedSession.refreshToken);
          }
        }
      } catch {
        if (!cancelled) {
          await clearSession();
        }
      } finally {
        if (!cancelled) {
          setBootstrapping(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [clearSession, recoverWithRefreshToken]);

  const login = useCallback(
    async (input: { emailOrPhone: string; password: string }) => {
      const response = await loginRequest(input);
      await applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  const register = useCallback(
    async (input: { email: string; name: string; password: string; phone: string }) => {
      const response = await registerRequest(input);
      await applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest(accessToken);
    } finally {
      await clearSession();
    }
  }, [accessToken, clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      bootstrapping,
      login,
      logout,
      me,
      refreshMe,
      register,
    }),
    [accessToken, bootstrapping, login, logout, me, refreshMe, register],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return value;
}
