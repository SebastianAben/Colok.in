import { ApiClientError } from "./api";

type AuthenticatedRequestOptions<T> = {
  accessToken: string;
  clearSession: () => Promise<void>;
  refreshAccessToken: () => Promise<string>;
  request: (accessToken: string) => Promise<T>;
};

function isUnauthenticatedError(error: unknown) {
  return (
    error instanceof ApiClientError && (error.status === 401 || error.code === "UNAUTHENTICATED")
  );
}

export class SessionExpiredError extends ApiClientError {
  constructor() {
    super(401, "SESSION_EXPIRED", "Sesi berakhir. Silakan login kembali.");
  }
}

export async function runAuthenticatedRequest<T>({
  accessToken,
  clearSession,
  refreshAccessToken,
  request,
}: AuthenticatedRequestOptions<T>): Promise<T> {
  try {
    return await request(accessToken);
  } catch (error) {
    if (!isUnauthenticatedError(error)) {
      throw error;
    }
  }

  let nextAccessToken: string;

  try {
    nextAccessToken = await refreshAccessToken();
  } catch {
    await clearSession();
    throw new SessionExpiredError();
  }

  return request(nextAccessToken);
}
