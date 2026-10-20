export type Session = {
  baseUrl: string;
  userId: string;
  deviceId: string;
  accessToken: string;
  expiresInMs?: number;
  refreshToken?: string;
  fallbackSdkStores?: boolean;
};

export type Sessions = Session[];
export type SessionStoreName = {
  sync: string;
  crypto: string;
  /** Rust crypto IndexedDB prefix. undefined means sdk default. */
  rustCryptoPrefix?: string;
};

/**
 * Migration code for old session
 */
const FALLBACK_STORE_NAME: SessionStoreName = {
  sync: 'web-sync-store',
  crypto: 'crypto-store',
} as const;

export function setFallbackSession(
  accessToken: string,
  deviceId: string,
  userId: string,
  baseUrl: string
) {
  localStorage.setItem('cinny_access_token', accessToken);
  localStorage.setItem('cinny_device_id', deviceId);
  localStorage.setItem('cinny_user_id', userId);
  localStorage.setItem('cinny_hs_base_url', baseUrl);
}
export const removeFallbackSession = () => {
  localStorage.removeItem('cinny_hs_base_url');
  localStorage.removeItem('cinny_user_id');
  localStorage.removeItem('cinny_device_id');
  localStorage.removeItem('cinny_access_token');
};
export const getFallbackSession = (): Session | undefined => {
  const baseUrl = localStorage.getItem('cinny_hs_base_url');
  const userId = localStorage.getItem('cinny_user_id');
  const deviceId = localStorage.getItem('cinny_device_id');
  const accessToken = localStorage.getItem('cinny_access_token');

  if (baseUrl && userId && deviceId && accessToken) {
    const session: Session = {
      baseUrl,
      userId,
      deviceId,
      accessToken,
      fallbackSdkStores: true,
    };

    return session;
  }

  return undefined;
};
/**
 * End of migration code for old session
 */

export const getSessionStoreName = (session: Session): SessionStoreName => {
  if (session.fallbackSdkStores) {
    return FALLBACK_STORE_NAME;
  }

  return {
    sync: `sync${session.userId}`,
    crypto: `crypto${session.userId}`,
    rustCryptoPrefix: `rust-crypto${session.userId}`,
  };
};

export const MATRIX_SESSIONS_KEY = 'matrixSessions';
export const ACTIVE_SESSION_KEY = 'matrixActiveSession';
const ADD_ACCOUNT_KEY = 'cinny_add_account';

const readSessions = (): Sessions => {
  try {
    const item = localStorage.getItem(MATRIX_SESSIONS_KEY);
    const sessions = item ? JSON.parse(item) : [];
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
};

const writeSessions = (sessions: Sessions) => {
  localStorage.setItem(MATRIX_SESSIONS_KEY, JSON.stringify(sessions));
};

export const getSessions = (): Sessions => {
  const sessions = readSessions();

  // Before multi account support session was stored
  // as multiple item in local storage.
  // So we need these migration code.
  const fallbackSession = getFallbackSession();
  if (fallbackSession) {
    removeFallbackSession();
    if (!sessions.find((s) => s.userId === fallbackSession.userId)) {
      sessions.push(fallbackSession);
      writeSessions(sessions);
    }
    if (!localStorage.getItem(ACTIVE_SESSION_KEY)) {
      localStorage.setItem(ACTIVE_SESSION_KEY, fallbackSession.userId);
    }
  }

  return sessions;
};

export const getSession = (userId: string): Session | undefined =>
  getSessions().find((s) => s.userId === userId);

export const getActiveSession = (): Session | undefined => {
  const sessions = getSessions();
  const activeUserId = localStorage.getItem(ACTIVE_SESSION_KEY);
  return sessions.find((s) => s.userId === activeUserId) ?? sessions[0];
};

export const setActiveSession = (userId: string) => {
  localStorage.setItem(ACTIVE_SESSION_KEY, userId);
};

/**
 * Add or replace the session (by userId) and make it active.
 */
export const putSession = (session: Session) => {
  const sessions = getSessions();
  const index = sessions.findIndex((s) => s.userId === session.userId);
  if (index === -1) {
    sessions.push(session);
  } else {
    sessions.splice(index, 1, session);
  }
  writeSessions(sessions);
  setActiveSession(session.userId);
};

/**
 * Remove session and return the next session to activate, if any.
 */
export const removeSession = (userId: string): Session | undefined => {
  const sessions = getSessions().filter((s) => s.userId !== userId);
  writeSessions(sessions);

  const next = sessions[0];
  if (next) {
    setActiveSession(next.userId);
  } else {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
  return next;
};

/**
 * Add-account mode lets an already logged in user visit auth pages.
 * Stored in sessionStorage so it survives SSO redirects in the same tab.
 */
export const setAddingAccount = (adding: boolean) => {
  if (adding) sessionStorage.setItem(ADD_ACCOUNT_KEY, 'true');
  else sessionStorage.removeItem(ADD_ACCOUNT_KEY);
};
export const isAddingAccount = (): boolean => sessionStorage.getItem(ADD_ACCOUNT_KEY) === 'true';
