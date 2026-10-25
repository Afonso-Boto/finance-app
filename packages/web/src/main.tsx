import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from 'react-oidc-context';
import { App } from './App';
import { loadConfig } from './config';

const root = createRoot(document.getElementById('root') as HTMLElement);

loadConfig()
  .then((config) => {
    root.render(
      <StrictMode>
        <AuthProvider
          authority={`https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`}
          client_id={config.clientId}
          redirect_uri={`${window.location.origin}/`}
          response_type="code"
          scope="openid email profile"
          // Remove ?code=…&state=… from the address bar after sign-in.
          onSigninCallback={() => window.history.replaceState({}, document.title, '/')}
        >
          <App config={config} />
        </AuthProvider>
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    root.render(<p role="alert">Could not start the app: {String(error)}</p>);
  });
