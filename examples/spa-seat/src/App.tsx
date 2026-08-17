import { AuthVitalProvider } from '@authvital/browser/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AV_HOST, AV_CLIENT_ID } from './config';
import Dashboard from './pages/Dashboard';
import Callback from './pages/Callback';
import Login from './pages/Login';

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
        </Routes>
      </BrowserRouter>
    </AuthVitalProvider>
  );
}
