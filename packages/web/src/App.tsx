import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import type { AppConfig } from './config';

interface Me {
  sub: string;
  username: string;
  scopes: string[];
}

export function App({ config }: { config: AppConfig }) {
  const auth = useAuth();
  const [me, setMe] = useState<Me>();
  const [error, setError] = useState<string>();
  const accessToken = auth.user?.access_token;

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${config.apiUrl}/me`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`GET /me returned ${response.status}`);
        setMe((await response.json()) as Me);
      })
      .catch((e: unknown) => setError(String(e)));
  }, [accessToken, config.apiUrl]);

  // Cognito has no standard end-session endpoint: clear the local session, then use /logout.
  const signOut = async () => {
    await auth.removeUser();
    const logoutUri = encodeURIComponent(`${window.location.origin}/`);
    window.location.href = `${config.cognitoDomain}/logout?client_id=${config.clientId}&logout_uri=${logoutUri}`;
  };

  if (auth.isLoading) return <p>Loading…</p>;
  if (auth.error) return <p role="alert">Sign-in failed: {auth.error.message}</p>;

  if (!auth.isAuthenticated) {
    return (
      <main>
        <h1>Finance App</h1>
        <button type="button" onClick={() => void auth.signinRedirect()}>
          Sign in
        </button>
      </main>
    );
  }

  return (
    <main>
      <h1>Hello, {me?.username ?? '…'}</h1>
      {error && <p role="alert">{error}</p>}
      {me && <pre>{JSON.stringify(me, null, 2)}</pre>}
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </main>
  );
}
