import { AuthVitalProvider } from '@authvital/browser/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AV_HOST, AV_CLIENT_ID } from './config';
import Dashboard from './pages/Dashboard';
import Callback from './pages/Callback';
import Login from './pages/Login';
import Invite from './pages/Invite';

/**
 * App root. Wraps everything in <AuthVitalProvider>, which constructs a single
 * AuthVitalClient (split-token, in-memory access token, silent refresh).
 *
 * redirectUri is intentionally omitted: the SDK defaults it to
 * `${window.location.origin}/auth/callback`, which matches the seeded
 * redirect_uris for both app.lvh.me and {tenant}.app.lvh.me.
 */
export default function App() {
  return (
    <AuthVitalProvider
      authVitalHost={AV_HOST}
      clientId={AV_CLIENT_ID}
      debug={import.meta.env.DEV}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/auth/callback" element={<Callback />} />
          <Route path="/login" element={<Login />} />
          <Route path="/invite" element={<Invite />} />
        </Routes>
      </BrowserRouter>
    </AuthVitalProvider>
  );
}
