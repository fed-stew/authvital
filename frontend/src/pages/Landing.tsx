import { Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Landing() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        {/* Logo/Icon */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500">
            <Shield className="h-8 w-8 text-white" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold text-white mb-2">AuthVader</h1>
        <p className="text-lg text-slate-400 mb-8">Identity Provider Service</p>

        {/* Links */}
        <div className="flex items-center justify-center gap-6">
          <Link
            to="/admin/login"
            className="px-6 py-3 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:opacity-90 transition-opacity"
          >
            Admin Dashboard
          </Link>
          <a
            href="/api/health"
            className="px-6 py-3 rounded-lg border border-slate-700 text-slate-300 font-medium hover:bg-slate-800 transition-colors"
          >
            API Health
          </a>
        </div>

        {/* Footer */}
        <p className="text-sm text-slate-600 mt-12">
          Built with ❤️ by the AuthVader team
        </p>
      </div>
    </div>
  );
}
