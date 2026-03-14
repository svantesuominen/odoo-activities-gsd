import { useState, useEffect } from 'react'
import CardStack from './components/CardStack'
import Setup from './components/Setup'
import { getSettings, clearSettings } from './lib/odoo'
import { LogOut } from 'lucide-react'

function App() {
  const [hasSetup, setHasSetup] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const handleLogout = () => {
    clearSettings();
    setHasSetup(false);
    setConnectionStatus('loading');
  };

  useEffect(() => {
    setHasSetup(getSettings() !== null);
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-blue-500/30">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse 40% 40% at 0% 0%, rgba(59,130,246,0.08) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 100% 100%, rgba(168,85,247,0.08) 0%, transparent 70%)'
        }} />
      </div>

      <main className="relative z-10 container mx-auto px-6 py-12 flex flex-col items-center min-h-screen">
        <section className="w-full flex justify-center flex-1 items-center z-50">
          {hasSetup ? (
            <CardStack
              onSettingsError={() => setHasSetup(false)}
              onStatusChange={setConnectionStatus}
            />
          ) : (
            <Setup onComplete={() => setHasSetup(true)} />
          )}
        </section>

        <footer className="mt-auto pt-12 text-center flex flex-col items-center gap-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
            <div className={`w-2 h-2 rounded-full animate-pulse ${!hasSetup ? 'bg-orange-500' :
              connectionStatus === 'error' ? 'bg-red-500' :
                connectionStatus === 'loading' ? 'bg-blue-300' :
                  'bg-emerald-500'
              }`} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
              {!hasSetup ? 'Setup Required' :
                connectionStatus === 'error' ? 'System Offline' :
                  connectionStatus === 'loading' ? 'Establishing Link...' :
                    'System Ready'}
            </span>
          </div>

          <div>
            <p className="text-zinc-500 text-xs font-medium tracking-wide max-w-xs mx-auto">
              Swipe left → <span className="text-emerald-500/80">Done</span>. Far left → <span className="text-emerald-500/80">Done + new activity</span>. <br />
                      Swipe right → <span className="text-yellow-500/80">deal with it later</span>.
            </p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">
              Odoo Activities GSD • by Svante
            </p>
            {hasSetup && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/5 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-bold transition-colors mb-4"
              >
                <LogOut className="w-3.5 h-3.5" />
                Logout
              </button>
            )}
          </div>
        </footer>
      </main>
    </div>
  )
}

export default App
