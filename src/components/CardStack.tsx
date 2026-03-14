import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Phone, Mail, Calendar, FileText, Check, Clock, User, AlertCircle, RefreshCw, Loader2, ExternalLink, Mic, ChevronsRight } from 'lucide-react';
import * as odoo from '../lib/odoo';

interface ActivityTypeConfig {
    icon: React.ElementType;
    color: string;
}

const TYPE_CONFIG: Record<string, ActivityTypeConfig> = {
    'Call': { icon: Phone, color: 'from-blue-500 to-cyan-600' },
    'Email': { icon: Mail, color: 'from-purple-500 to-indigo-600' },
    'Meeting': { icon: Calendar, color: 'from-orange-500 to-red-600' },
    'To-do': { icon: User, color: 'from-zinc-700 to-black' },
    'default': { icon: FileText, color: 'from-emerald-500 to-teal-600' }
};

interface CardData extends ActivityTypeConfig {
    id: number;
    odooId: number;
    type: string;
    activityTypeId: number;
    title: string;
    content: string;
    contentHtml?: string;
    due: string;
    priority: number;
    phone: string;
    contactName: string;
    companyName: string;
    res_model?: string;
    res_id?: number;
    metaInfo?: string;
    nextActivityTypeName?: string;
    dateDeadline: string;
}


interface CardStackProps {
    onSettingsError: () => void;
    onStatusChange?: (status: 'loading' | 'ready' | 'error') => void;
}

function humanDueLabel(dateStr: string): { dueLabel: string; priority: number } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + 'T00:00:00');
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

    if (diffDays === 0) return { dueLabel: 'Today', priority: 1 };
    if (diffDays === 1) return { dueLabel: 'Tomorrow', priority: 3 };
    if (diffDays === -1) return { dueLabel: 'Yesterday', priority: 2 };

    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    if (diffDays > 0) {
        if (diffDays < 7) return { dueLabel: `Next ${DAYS[due.getDay()]}`, priority: 3 };
        if (diffDays < 14) return { dueLabel: 'Next week', priority: 3 };
        const weeks = Math.round(diffDays / 7);
        if (weeks < 5) return { dueLabel: `In ${weeks} weeks`, priority: 3 };
        const months = Math.round(diffDays / 30);
        if (months < 12) return { dueLabel: `In ${months} month${months > 1 ? 's' : ''}`, priority: 3 };
        const years = Math.round(diffDays / 365);
        return { dueLabel: `In ${years} year${years > 1 ? 's' : ''}`, priority: 3 };
    } else {
        const absDays = Math.abs(diffDays);
        if (absDays < 7) return { dueLabel: `${absDays} days ago`, priority: 2 };
        if (absDays < 14) return { dueLabel: 'Last week', priority: 2 };
        const weeks = Math.round(absDays / 7);
        if (weeks < 5) return { dueLabel: `${weeks} weeks ago`, priority: 2 };
        const months = Math.round(absDays / 30);
        if (months < 12) return { dueLabel: `${months} month${months > 1 ? 's' : ''} ago`, priority: 2 };
        const years = Math.round(absDays / 365);
        return { dueLabel: `${years} year${years > 1 ? 's' : ''} ago`, priority: 2 };
    }
}

const CardStack: React.FC<CardStackProps> = ({ onSettingsError, onStatusChange }) => {
    const [cards, setCards] = useState<CardData[]>([]);
    const [initialTotal, setInitialTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [toast, setToast] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 1200);
    };

    // Voice Input State
    const [activeVoiceCard, setActiveVoiceCard] = useState<CardData | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [voiceLang, setVoiceLang] = useState<'fi-FI' | 'sv-SE' | 'en-US'>(
        () => (localStorage.getItem('voiceLang') as 'fi-FI' | 'sv-SE' | 'en-US') || 'fi-FI'
    );
    const voiceLangRef = React.useRef<string>(voiceLang);
    voiceLangRef.current = voiceLang;
    const activeVoiceCardRef = React.useRef<CardData | null>(null);
    const recognitionObjRef = React.useRef<any>(null);
    const recognitionSessionRef = React.useRef(0);
    const committedTranscriptRef = React.useRef('');

    const fetchActivities = useCallback(async () => {
        setLoading(true);
        setError(null);
        if (onStatusChange) onStatusChange('loading');
        try {
            const rawActivities = await odoo.getActivities();

            // Batch fetch phone numbers and contact names for relevant models
            const modelGroups: Record<string, number[]> = {};
            rawActivities.forEach((a) => {
                if (['res.partner', 'crm.lead', 'project.task', 'sale.order', 'helpdesk.ticket'].includes(a.res_model)) {
                    if (!modelGroups[a.res_model]) modelGroups[a.res_model] = [];
                    modelGroups[a.res_model].push(a.res_id);
                }
            });

            const contactData = await odoo.getContactInfo(
                Object.entries(modelGroups).map(([model, ids]) => ({ model, ids }))
            );

            // Map and Sort
            const processed: CardData[] = rawActivities
                .map((a) => {
                    const typeName = a.activity_type_id[1] || 'To-do';
                    const config = TYPE_CONFIG[typeName] || TYPE_CONFIG['default'];

                    const { dueLabel, priority } = humanDueLabel(a.date_deadline);

                    const noteHtml = a.note || '';

                    const phone = contactData.phones[a.res_model]?.[a.res_id] || '';
                    const contactName = contactData.names[a.res_model]?.[a.res_id] || '';
                    const companyName = contactData.companies[a.res_model]?.[a.res_id] || '';
                    const realDocName = contactData.recordNames[a.res_model]?.[a.res_id];

                    let displayTitle = (realDocName || a.res_name || a.summary || 'No Summary');
                    let displayMeta = (contactData as any).meta?.[a.res_model]?.[a.res_id] || '';

                    if (a.res_model === 'sale.order' && contactName) {
                        const soNumber = (realDocName || a.res_name || '');
                        displayTitle = soNumber ? `${soNumber} - ${contactName}` : contactName;
                        displayMeta = '';
                    }

                    return {
                        id: a.id,
                        odooId: a.id,
                        type: typeName,
                        activityTypeId: a.activity_type_id[0],
                        title: displayTitle,
                        content: a.summary || '',
                        contentHtml: noteHtml,
                        due: dueLabel,
                        priority,
                        phone,
                        contactName,
                        companyName,
                        res_model: a.res_model,
                        res_id: a.res_id,
                        metaInfo: displayMeta,
                        dateDeadline: a.date_deadline,
                        ...config
                    };
                })
                // Sort: 1 (Today) first, then 2 (Late/Yesterday), then 3 (Tomorrow/Future)
                .sort((a, b) => a.priority - b.priority)
                // Reverse because we render the last item in the array as the top card
                .reverse();

            // Batch-fetch triggered next type names for all unique activity types
            const uniqueTypeIds = [...new Set(processed.map(c => c.activityTypeId))];
            const nextTypeMap: Record<number, string> = {};
            await Promise.all(uniqueTypeIds.map(async (typeId) => {
                try {
                    const actType = await odoo.getActivityType(typeId);
                    if (actType?.triggered_next_type_id) {
                        nextTypeMap[typeId] = actType.triggered_next_type_id[1];
                    }
                } catch { /* ignore */ }
            }));
            processed.forEach(c => {
                if (nextTypeMap[c.activityTypeId]) {
                    c.nextActivityTypeName = nextTypeMap[c.activityTypeId];
                }
            });

            setCards(processed);
            setInitialTotal(processed.length);
            if (onStatusChange) onStatusChange('ready');
        } catch (err) {
            if (onStatusChange) onStatusChange('error');
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);

            // If it's explicitly an auth problem, prompt them to fix settings
            if (msg.includes('Access Denied') || msg.includes('not configured')) {
                setTimeout(() => onSettingsError(), 2000);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchActivities();
    }, [fetchActivities]);

    const initSpeechRecognition = (lang?: string) => {
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = lang ?? voiceLangRef.current;

            const sessionId = ++recognitionSessionRef.current;
            recognitionObjRef.current = recognition;

            recognition.onresult = (event: any) => {
                let newFinal = '';
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        newFinal += event.results[i][0].transcript;
                    } else {
                        interim += event.results[i][0].transcript;
                    }
                }
                if (newFinal) {
                    const sep = committedTranscriptRef.current ? ' ' : '';
                    committedTranscriptRef.current += sep + newFinal.trim();
                }
                const interimTrimmed = interim.trim();
                const sep = committedTranscriptRef.current && interimTrimmed ? ' ' : '';
                setTranscript(committedTranscriptRef.current + sep + interimTrimmed);
            };

            recognition.onerror = (event: any) => {
                if (event.error !== 'no-speech' && recognitionSessionRef.current === sessionId) {
                    console.error("Speech recognition error", event.error);
                }
            };

            recognition.onend = () => {
                if (activeVoiceCardRef.current && recognitionSessionRef.current === sessionId) {
                    // Create a fresh instance on every restart — reusing the same object
                    // causes mobile browsers to re-emit previously heard words.
                    const newRec = initSpeechRecognition();
                    if (newRec) {
                        try { newRec.start(); } catch (e) { setIsListening(false); }
                    } else {
                        setIsListening(false);
                    }
                } else if (recognitionSessionRef.current === sessionId) {
                    setIsListening(false);
                }
            };

            return recognition;
        }
        console.warn("Speech recognition not supported in this browser.");
        return null;
    };


    const handleDismissAction = (card: CardData, action: 'done' | 'doneNext' | 'snooze' | 'dismiss') => {
        removeCard(card.id, action);
    };

    const openVoiceOverlay = (card: CardData) => {
        committedTranscriptRef.current = '';
        setTranscript('');
        activeVoiceCardRef.current = card;
        setActiveVoiceCard(card);

        if (recognitionObjRef.current) {
            try { recognitionObjRef.current.stop(); } catch (e) { /* ignore */ }
        }

        const rec = initSpeechRecognition();
        if (rec) {
            try {
                rec.start();
                setIsListening(true);
            } catch (e) {
                console.error("Could not start recognition", e);
            }
        }
    };

    const confirmVoiceDone = async () => {
        if (!activeVoiceCard) return;
        const card = activeVoiceCard;
        const note = transcript.trim();

        activeVoiceCardRef.current = null;
        setActiveVoiceCard(null);
        if (recognitionObjRef.current) {
            try { recognitionObjRef.current.stop(); } catch (e) { /* ignore */ }
        }
        setIsListening(false);
        setTranscript('');
        committedTranscriptRef.current = '';

        if (note && card.odooId) {
            try {
                await odoo.appendActivityNote(card.odooId, note);
                showToast('Thanks. Sent to Odoo.');
            } catch (err) {
                console.error('Failed to append activity note:', err);
                showToast('Failed to save note.');
            }
        }
    };

    const removeCard = async (id: number, action: 'done' | 'doneNext' | 'snooze' | 'dismiss' = 'dismiss', feedback?: string) => {
        const cardToRemove = cards.find(c => c.id === id);
        if (cardToRemove) {
            setCards((prev) => prev.filter((card) => card.id !== id));

            // Background API call
            try {
                if (action === 'done') {
                    await odoo.markActivityDone(cardToRemove.odooId, feedback);
                } else if (action === 'doneNext') {
                    await odoo.markActivityDone(cardToRemove.odooId);
                    if (cardToRemove.res_model && cardToRemove.res_id) {
                        const actType = await odoo.getActivityType(cardToRemove.activityTypeId);
                        // Use triggered next type if configured, otherwise recreate same type
                        const nextTypeId = actType?.triggered_next_type_id
                            ? actType.triggered_next_type_id[0]
                            : cardToRemove.activityTypeId;
                        const nextTypeName = actType?.triggered_next_type_id
                            ? actType.triggered_next_type_id[1]
                            : cardToRemove.type;
                        await odoo.createActivity(
                            cardToRemove.res_model,
                            cardToRemove.res_id,
                            nextTypeId,
                            actType?.delay_count ?? 0,
                            actType?.delay_unit ?? 'days'
                        );
                        showToast(`Done, and next ${nextTypeName} scheduled`);
                    }
                } else if (action === 'snooze') {
                    const todayStr = new Date().toISOString().split('T')[0];
                    // Only push the deadline forward if the activity is overdue or due today
                    if (cardToRemove.dateDeadline <= todayStr) {
                        await odoo.snoozeActivityMañana(cardToRemove.odooId);
                    }
                    // Future activities: just dismiss from view, deadline stays as-is
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('Failed to update Odoo:', msg);
                showToast('Failed to sync with Odoo');
            }
        }
    };


    const nextCard = () => {
        if (cards.length > 0) {
            const topCard = cards[cards.length - 1];
            setCards(prev => {
                const newCards = prev.slice(0, -1); // Remove top card
                return [topCard, ...newCards]; // Add it to the beginning (back of stack)
            });
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 gap-4">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <p className="text-zinc-500 font-medium">Fetching Odoo Activities...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h3 className="text-red-400 font-bold text-lg">Connection Error</h3>
                <p className="text-zinc-500 text-sm mt-2 max-w-xs">{error}</p>

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={fetchActivities}
                        className="px-6 py-2 rounded-full bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition-colors"
                    >
                        Try Again
                    </button>
                    <button
                        onClick={() => {
                            onSettingsError();
                        }}
                        className="px-6 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
                    >
                        Edit Settings
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center gap-12 w-full max-w-md mx-auto">
            {/* TOAST */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.15 }}
                        className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-full bg-white/10 backdrop-blur-md border border-white/15 shadow-lg text-sm font-semibold text-white/80 whitespace-nowrap"
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* VOICE ACTIVE OVERLAY */}
            <AnimatePresence>
                {activeVoiceCard && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-black/80 backdrop-blur-xl rounded-[3rem] border border-white/10"
                    >
                        <div className="flex flex-col items-center w-full max-w-sm gap-8">
                            <div className="text-center space-y-2">
                                <h2 className="text-2xl font-black text-white">Add Voice Note</h2>
                                <p className="text-emerald-400 font-bold text-sm">"{activeVoiceCard.title}"</p>
                            </div>

                            {/* Language picker */}
                            <div className="flex gap-2">
                                {([['fi-FI', 'FI'], ['sv-SE', 'SV'], ['en-US', 'EN']] as const).map(([code, label]) => (
                                    <button
                                        key={code}
                                        onClick={() => {
                                            setVoiceLang(code);
                                            voiceLangRef.current = code;
                                            localStorage.setItem('voiceLang', code);
                                            if (recognitionObjRef.current) {
                                                try { recognitionObjRef.current.stop(); } catch (e) { /* ignore */ }
                                            }
                                            setTimeout(() => {
                                                const rec = initSpeechRecognition(code);
                                                if (rec) {
                                                    try { rec.start(); setIsListening(true); } catch (e) { /* ignore */ }
                                                }
                                            }, 150);
                                        }}
                                        className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${voiceLang === code
                                            ? 'bg-white text-zinc-900 shadow-lg scale-105'
                                            : 'bg-white/10 text-white/60 hover:bg-white/20'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* Listening indicator */}
                            <div className="flex items-center gap-3 py-2">
                                {isListening ? (
                                    <>
                                        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]" />
                                        <span className="text-white/70 text-sm font-semibold tracking-wide">Listening...</span>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-3 h-3 rounded-full bg-white/20" />
                                        <span className="text-white/30 text-sm font-semibold tracking-wide">Paused</span>
                                    </>
                                )}
                            </div>

                            <div className="w-full min-h-28 p-4 rounded-2xl bg-white/5 border border-white/10 overflow-y-auto">
                                <p className="text-white/90 text-sm leading-relaxed font-medium">
                                    {transcript || <span className="text-white/30 italic">Start speaking…</span>}
                                </p>
                            </div>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => {
                                        activeVoiceCardRef.current = null;
                                        setActiveVoiceCard(null);
                                        if (recognitionObjRef.current) {
                                            try { recognitionObjRef.current.stop(); } catch (e) { /* ignore */ }
                                        }
                                        setIsListening(false);
                                        setTranscript('');
                                        committedTranscriptRef.current = '';
                                    }}
                                    className="flex-1 py-3 rounded-full border border-white/10 bg-white/5 text-zinc-400 font-bold text-sm hover:bg-white/10 hover:text-white transition-all active:scale-95"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => confirmVoiceDone()}
                                    className="flex-1 py-3 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold text-sm hover:bg-emerald-500/20 hover:text-emerald-300 transition-all active:scale-95"
                                >
                                    Save Note
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="relative w-full aspect-[3/4] flex items-center justify-center">
                <AnimatePresence mode="popLayout">
                    {cards.map((card, index) => {
                        const isTop = index === cards.length - 1;
                        return (
                            <Card
                                key={card.id}
                                card={card}
                                isTop={isTop}
                                index={cards.length - 1 - index}
                                initialTotal={initialTotal}
                                currentCardNumber={initialTotal - (cards.length - index - 1)}
                                onDismiss={(dir: 'left' | 'farLeft' | 'right' | 'up') => {
                                    const action = dir === 'farLeft' ? 'doneNext' : dir === 'left' ? 'done' : dir === 'right' ? 'snooze' : 'dismiss';
                                    handleDismissAction(card, action);
                                }}
                                onVoiceNote={isTop ? () => openVoiceOverlay(card) : undefined}
                            />
                        );
                    })}
                </AnimatePresence>

                {cards.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center"
                    >
                        <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center mx-auto mb-4 border border-white/10">
                            <Check className="text-zinc-500 w-10 h-10" />
                        </div>
                        <h3 className="text-xl font-bold text-zinc-300">All Done!</h3>
                        <p className="text-zinc-500 text-sm mt-2 mb-8">Inbox Zero achieved.</p>
                        <button
                            onClick={fetchActivities}
                            className="px-6 py-2 rounded-full border border-white/10 text-zinc-400 text-sm font-medium hover:bg-white/5 transition-colors flex items-center gap-2 mx-auto"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Sync for fresh tasks
                        </button>
                    </motion.div>
                )}
            </div>

            <div className="flex gap-4 w-full justify-center">
                <button
                    onClick={nextCard}
                    disabled={cards.length === 0}
                    className="group relative px-8 py-3 bg-white/5 hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed border border-white/10 rounded-2xl text-white font-semibold transition-all active:scale-95 overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="relative z-10">Next</span>
                </button>
            </div>
        </div >
    );
};

interface CardProps {
    card: CardData;
    isTop: boolean;
    index: number;
    initialTotal: number;
    currentCardNumber: number;
    onDismiss: (dir: 'left' | 'farLeft' | 'right' | 'up') => void;
    onVoiceNote?: () => void;
}

const getModelLabel = (model: string): string => {
    const modelLabels: Record<string, string> = {
        'crm.lead': 'Opportunity',
        'project.task': 'Task',
        'sale.order': 'Sales Order',
        'res.partner': 'Contact',
        'account.move': 'Invoice',
        'purchase.order': 'Purchase Order',
        'helpdesk.ticket': 'Ticket',
    };
    return modelLabels[model] || 'Record';
};

const Card = ({ card, isTop, index, initialTotal, currentCardNumber, onDismiss, onVoiceNote }: CardProps) => {
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotate = useTransform(x, [-180, 180], [-20, 20]);
    const opacity = useTransform(x, [-180, -150, 0, 150, 180], [0, 1, 1, 1, 0]);

    const doneOpacity = useTransform(x, [-80, -50, -20], [0, 1, 0]);
    const doneNextOpacity = useTransform(x, [-180, -80], [1, 0]);
    const snoozeOpacity = useTransform(x, [20, 100], [0, 1]);
    const overlayBg = useTransform(x, [-100, 0, 100], ['rgba(34, 197, 94, 0.8)', 'rgba(34, 197, 94, 0)', 'rgba(234, 179, 8, 0.8)']);

    // Calculate next business day
    const today = new Date();
    const nextDay = new Date(today);
    nextDay.setDate(today.getDate() + 1);

    // If Saturday, go to Monday
    if (nextDay.getDay() === 6) nextDay.setDate(nextDay.getDate() + 2);
    // If Sunday, go to Monday
    if (nextDay.getDay() === 0) nextDay.setDate(nextDay.getDate() + 1);

    const nextBizDay = nextDay.toISOString().split('T')[0];

    const handleDragEnd = (_: unknown, info: { velocity: { x: number, y: number }, offset: { x: number, y: number } }) => {
        const velocity = Math.sqrt(Math.pow(info.velocity.x, 2) + Math.pow(info.velocity.y, 2));
        if (Math.abs(info.offset.x) > 150 || velocity > 800) {
            if (info.offset.x < -160) {
                onDismiss('farLeft');
            } else {
                const dir = info.offset.x < 0 ? 'left' : 'right';
                onDismiss(dir);
            }
        } else {
            x.set(0);
            y.set(0);
        }
    };

    return (
        <motion.div
            style={{
                x, y, rotate: isTop ? rotate : 0, opacity: isTop ? opacity : 1,
                zIndex: 50 - index, scale: 1 - index * 0.05, top: index * -15
            }}
            drag={isTop}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            onDragEnd={handleDragEnd}
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{
                scale: 1 - index * 0.05, opacity: 1, y: index * -15,
                transition: { type: 'spring', stiffness: 300, damping: 30 }
            }}
            exit={{
                x: x.get() > 0 ? 500 : -500,
                opacity: 0,
                rotate: x.get() > 0 ? 45 : -45,
                transition: { duration: 0.3 }
            }}
            className={`absolute w-full h-full rounded-[2.5rem] bg-gradient-to-br ${card.color} p-8 flex flex-col justify-between shadow-2xl border border-white/20 select-none cursor-grab active:cursor-grabbing overflow-hidden touch-none`}
        >
            <motion.div
                style={{ backgroundColor: overlayBg }}
                className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center p-8 text-center"
            >
                <motion.div style={{ opacity: doneNextOpacity }} className="flex flex-col items-center gap-1">
                    <div className="w-20 h-20 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center border border-white/50 mb-3 shadow-lg">
                        <ChevronsRight className="text-white w-10 h-10" />
                    </div>
                    <span className="text-white font-black text-3xl uppercase tracking-widest drop-shadow-lg">Done</span>
                    <span className="text-white font-black text-3xl uppercase tracking-widest drop-shadow-lg">+ Next</span>
                    {card.nextActivityTypeName && (
                        <span className="mt-2 px-3 py-1 rounded-full bg-white/25 border border-white/40 text-white font-bold text-sm tracking-wide shadow">
                            → {card.nextActivityTypeName}
                        </span>
                    )}
                </motion.div>
                <motion.div style={{ opacity: doneOpacity }} className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/40 mb-4">
                        <Check className="text-white w-10 h-10" />
                    </div>
                    <span className="text-white font-black text-2xl uppercase tracking-widest">Done</span>
                </motion.div>
                <motion.div style={{ opacity: snoozeOpacity }} className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/40 mb-4">
                        <Clock className="text-white w-10 h-10" />
                    </div>
                    <span className="text-white font-black text-2xl uppercase tracking-widest leading-none">Later</span>
                    {card.dateDeadline <= new Date().toISOString().split('T')[0] ? (
                        <>
                            <span className="text-white/80 text-[10px] font-bold uppercase tracking-widest mt-2">Moved to next biz day</span>
                            <span className="text-white/60 text-xs font-semibold mt-1">{nextBizDay}</span>
                        </>
                    ) : (
                        <span className="text-white/80 text-[10px] font-bold uppercase tracking-widest mt-2">Deal with this when scheduled</span>
                    )}
                </motion.div>
            </motion.div>

            <div className="flex justify-between items-start">
                <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                    <card.icon className="text-white w-7 h-7" />
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className="px-4 py-1.5 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-[10px] font-black text-white uppercase tracking-[0.2em]">
                        {card.type}
                    </div>
                </div>
            </div>

            <div>
                <h3 className="text-2xl font-black text-white leading-tight drop-shadow-md">{card.title}</h3>
                {card.content ? (
                    <p className="mt-4 text-white/90 text-sm font-medium leading-relaxed line-clamp-6 whitespace-pre-line">
                        {card.content}
                    </p>
                ) : card.contentHtml ? (
                    <div
                        className="mt-4 text-white/90 text-sm font-medium leading-relaxed line-clamp-6 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_em]:not-italic [&_em]:text-white/60 [&_strong]:text-white [&_br]:block"
                        dangerouslySetInnerHTML={{ __html: card.contentHtml }}
                    />
                ) : (
                    <p className="mt-4 text-white/50 text-sm italic">No details provided.</p>
                )}

                {card.metaInfo && (
                    <div className="mt-3 text-[10px] font-black uppercase tracking-wider text-white/70 bg-white/10 px-2.5 py-1 rounded-md border border-white/5 inline-block">
                        {card.metaInfo}
                    </div>
                )}

                <div className="mt-8 flex flex-wrap gap-3">
                    {card.phone && (
                        <motion.a
                            href={`tel:${card.phone}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full border border-white/20 text-white font-bold text-xs transition-colors shadow-lg group/call"
                        >
                            <div className="w-5 h-5 rounded-full bg-emerald-500/80 flex items-center justify-center animate-pulse group-hover/call:animate-none">
                                <Phone className="w-2.5 h-2.5 text-white fill-white" />
                            </div>
                            Call {card.contactName ? (card.companyName ? `${card.contactName} (${card.companyName})` : card.contactName) : card.phone}
                        </motion.a>
                    )}

                    {card.res_model && card.res_id && (
                        <motion.a
                            href={odoo.getRecordUrl(card.res_model, card.res_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-white/90 font-bold text-xs transition-colors shadow-lg group/odoo"
                        >
                            <ExternalLink className="w-3.5 h-3.5 text-white/60 group-hover/odoo:text-white transition-colors" />
                            Open {getModelLabel(card.res_model)} in Odoo
                        </motion.a>
                    )}

                    {onVoiceNote && (
                        <motion.button
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => { e.stopPropagation(); onVoiceNote(); }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full border border-white/20 text-white font-bold text-xs transition-colors shadow-lg"
                        >
                            <Mic className="w-3.5 h-3.5 text-white" />
                            Add Voice Note
                        </motion.button>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.15em] text-white/40">
                    <div className="flex items-center gap-4">
                        <span className="text-white/60 lowercase tracking-normal font-bold">
                            {currentCardNumber} of {initialTotal}
                        </span>
                    </div>
                    <div className={`flex items-center gap-1.5 ring-1 px-2 py-0.5 rounded-full ${
                        card.dateDeadline < new Date().toISOString().split('T')[0]
                            ? 'ring-red-400/60 bg-black/30 text-red-300 font-black tracking-widest'
                            : card.dateDeadline === new Date().toISOString().split('T')[0]
                                ? 'ring-yellow-400/60 bg-black/30 text-yellow-300 font-black tracking-widest'
                                : 'ring-white/5 bg-white/5 text-white/80'
                    }`}>
                        <Clock className="w-3 h-3 opacity-60" />
                        <span>{card.due}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <motion.div
                            initial={{ x: '-100%' }}
                            animate={{ x: '0%' }}
                            transition={{ duration: 1.2, delay: 0.6 }}
                            className="h-full bg-white/40 shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                        />
                    </div>
                    <div className="flex-1 h-1.5 rounded-full bg-white/5" />
                    <div className="flex-1 h-1.5 rounded-full bg-white/5" />
                </div>
            </div>
        </motion.div>
    );
};

export default CardStack;
