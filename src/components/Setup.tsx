import React, { useState } from 'react';
import { Database, Link, User, Key, ArrowRight } from 'lucide-react';
import { saveSettings, getSettings } from '../lib/odoo';
import type { OdooSettings } from '../lib/odoo';

interface SetupProps {
    onComplete: () => void;
}

const Setup: React.FC<SetupProps> = ({ onComplete }) => {
    const [settings, setSettings] = useState<OdooSettings>(() => {
        const existing = getSettings();
        return existing || {
            url: '',
            db: '',
            username: '',
            apiKey: ''
        };
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        saveSettings(settings);
        onComplete();
    };

    return (
        <div className="w-full max-w-md mx-auto p-8 rounded-[2.5rem] bg-zinc-900 border border-white/10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[80px] rounded-full pointer-events-none" />

            <div className="mb-8">
                <h2 className="text-3xl font-black text-white tracking-tight mb-2">Setup Connection</h2>
                <p className="text-zinc-400 text-sm font-medium">Please enter your Odoo credentials to sync your activities.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1">Odoo URL</label>
                    <div className="relative">
                        <Link className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            required
                            type="url"
                            value={settings.url}
                            onChange={e => setSettings({ ...settings, url: e.target.value })}
                            className="w-full bg-black/50 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                            placeholder="https://your-odoo-instance.com"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1">Database Name</label>
                    <div className="relative">
                        <Database className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            required
                            type="text"
                            value={settings.db}
                            onChange={e => setSettings({ ...settings, db: e.target.value })}
                            className="w-full bg-black/50 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                            placeholder="my-company-db"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1">Username / Email</label>
                    <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            required
                            type="text"
                            value={settings.username}
                            onChange={e => setSettings({ ...settings, username: e.target.value })}
                            className="w-full bg-black/50 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                            placeholder="name@company.com"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1">API Key</label>
                    <div className="relative">
                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            required
                            type="password"
                            value={settings.apiKey}
                            onChange={e => setSettings({ ...settings, apiKey: e.target.value })}
                            className="w-full bg-black/50 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                            placeholder="Odoo API Key"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    className="w-full mt-6 bg-white text-black font-bold py-3.5 rounded-2xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                    Connect
                    <ArrowRight className="w-4 h-4" />
                </button>
            </form>
        </div>
    );
};

export default Setup;
