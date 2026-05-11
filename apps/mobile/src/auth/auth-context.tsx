import type { AuthResponse, MeResponse } from "@colokin/shared";
import * as SecureStore from "expo-secure-store";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getMeRequest,
  loginRequest,
  logoutRequest,
  refreshRequest,
  registerRequest,
} from "../lib/api";
import { runAuthenticatedRequest, SessionExpiredError } from "../lib/authenticated-request";
import { registerDevicePushToken, revokeRegisteredPushToken } from "../lib/notifications";

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
  withAuthenticatedRequest: <T>(request: (accessToken: string) => Promise<T>) => Promise<T>;
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
  const accessTokenRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<Promise<string> | null>(null);
  const refreshTokenRef = useRef<string | null>(null);

  const applySession = useCallback(async (nextSession: AuthSession) => {
    await storeSession(nextSession);
    accessTokenRef.current = nextSession.accessToken;
    refreshTokenRef.current = nextSession.refreshToken;
    setAccessToken(nextSession.accessToken);
    setRefreshToken(nextSession.refreshToken);
  }, []);

  const applyAuthResponse = useCallback(
    async (response: AuthResponse) => {
      const nextSession = sessionFromAuthResponse(response);
      await applySession(nextSession);
      const profile = await getMeRequest(nextSession.accessToken);
      setMe(profile);
      void registerDevicePushToken(nextSession.accessToken);
    },
    [applySession],
  );

  const clearSession = useCallback(async () => {
    await clearStoredSession();
    accessTokenRef.current = null;
    refreshTokenRef.current = null;
    refreshInFlightRef.current = null;
    setAccessToken(null);
    setRefreshToken(null);
    setMe(null);
  }, []);

  const recoverWithRefreshToken = useCallback(
    async (storedRefreshToken: string) => {
      const response = await refreshRequest(storedRefreshToken);
      await applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  const refreshAccessToken = useCallback(async () => {
    const currentRefreshToken = refreshTokenRef.current;

    if (!currentRefreshToken) {
      throw new SessionExpiredError();
    }

    if (!refreshInFlightRef.current) {
      refreshInFlightRef.current = (async () => {
        const response = await refreshRequest(currentRefreshToken);
        const nextSession = sessionFromAuthResponse(response);
        await applySession(nextSession);
        void registerDevicePushToken(nextSession.accessToken);
        return nextSession.accessToken;
      })().finally(() => {
        refreshInFlightRef.current = null;
      });
    }

    return refreshInFlightRef.current;
  }, [applySession]);

  const withAuthenticatedRequest = useCallback(
    async <T,>(request: (accessToken: string) => Promise<T>): Promise<T> => {
      const currentAccessToken = accessTokenRef.current;

      if (!currentAccessToken) {
        throw new SessionExpiredError();
      }

      return runAuthenticatedRequest({
        accessToken: currentAccessToken,
        clearSession,
        refreshAccessToken,
        request,
      });
    },
    [clearSession, refreshAccessToken],
  );

  const refreshMe = useCallback(async () => {
    setMe(await withAuthenticatedRequest((token) => getMeRequest(token)));
  }, [withAuthenticatedRequest]);

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
          await applySession(storedSession);
          setMe(profile);
          void registerDevicePushToken(storedSession.accessToken);
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
  }, [applySession, clearSession, recoverWithRefreshToken]);

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
      await revokeRegisteredPushToken(accessToken);
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
      withAuthenticatedRequest,
    }),
    [accessToken, bootstrapping, login, logout, me, refreshMe, register, withAuthenticatedRequest],
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
