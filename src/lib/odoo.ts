/**
 * Odoo JSON-RPC Service for React
 */

export interface OdooSettings {
    url: string;
    db: string;
    username: string;
    apiKey: string;
}

export function getSettings(): OdooSettings | null {
    const raw = localStorage.getItem('odooSettings');
    return raw ? JSON.parse(raw) : null;
}

export function saveSettings(settings: OdooSettings) {
    localStorage.setItem('odooSettings', JSON.stringify(settings));
}

export function clearSettings() {
    localStorage.removeItem('odooSettings');
}

export function getRecordUrl(res_model: string, res_id: number) {
    const s = getSettings();
    if (!s) return '#';
    return `${s.url}/web#id=${res_id}&model=${res_model}&view_type=form`;
}

interface OdooRecord {
    id: number;
    [key: string]: string | number | boolean | [number, string] | number[] | undefined;
}

interface ActivityRecord extends OdooRecord {
    activity_type_id: [number, string];
    summary: string;
    note: string;
    date_deadline: string;
    res_name: string;
    res_model: string;
    res_id: number;
}

interface OdooVersion {
    server_version: string;
    server_version_info: (string | number)[];
    server_serie: string;
    protocol_version: number;
}

async function jsonRpcCall<T>(service: string, method: string, args: unknown[]): Promise<T> {
    const s = getSettings();
    if (!s) throw new Error("Connection not configured. Please setup credentials.");
    const baseUrl = s.url.replace(/\/+$/, '');

    const jsonRpcUrl = import.meta.env.DEV ? '/jsonrpc' : `${baseUrl}/jsonrpc`;

    const payload = {
        jsonrpc: '2.0',
        method: 'call',
        params: {
            service,
            method,
            args,
        },
        id: Math.round(Math.random() * 1000000000),
    };

    const response = await fetch(jsonRpcUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            // Tell the dev proxy which Odoo instance to forward to
            ...(import.meta.env.DEV ? { 'X-Odoo-Target': baseUrl } : {}),
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error.data?.message || data.error.message);
    }

    return data.result;
}

export async function authenticate() {
    return await jsonRpcCall<OdooVersion>('common', 'version', []);
}

export async function getUid() {
    const s = getSettings();
    if (!s) throw new Error("Connection not configured.");
    return await jsonRpcCall<number>('common', 'authenticate', [
        s.db,
        s.username,
        s.apiKey,
        {},
    ]);
}

// Helper to safely get auth params for execute_kw
async function getAuthKwArgs(uid: number) {
    const s = getSettings();
    if (!s) throw new Error("Connection not configured.");
    return [s.db, uid, s.apiKey];
}

export async function getActivities(): Promise<ActivityRecord[]> {
    const uid = await getUid();
    const authArgs = await getAuthKwArgs(uid);

    // Fetch activities for the current user
    const activities = await jsonRpcCall<ActivityRecord[]>('object', 'execute_kw', [
        ...authArgs,
        'mail.activity',
        'search_read',
        [
            [['user_id', '=', uid]]
        ],
        {
            fields: [
                'id',
                'activity_type_id',
                'summary',
                'note',
                'date_deadline',
                'res_name',
                'res_model',
                'res_id'
            ],
        }
    ]);

    return activities;
}

export async function getContactInfo(modelRecords: { model: string, ids: number[] }[]) {
    const uid = await getUid();
    const authArgs = await getAuthKwArgs(uid);
    const phoneResults: Record<string, Record<number, string>> = {};
    const nameResults: Record<string, Record<number, string>> = {};
    const companyResults: Record<string, Record<number, string>> = {};
    const metaResults: Record<string, Record<number, string>> = {};
    const recordNames: Record<string, Record<number, string>> = {};
    const partnerIdsToFetch = new Set<number>();
    const taskToPartnerMap: Record<number, number> = {};

    // 1) Fetch true display_name for ALL related records to guarantee correct titles
    for (const item of modelRecords) {
        if (item.ids.length === 0) continue;
        try {
            const records = await jsonRpcCall<OdooRecord[]>('object', 'execute_kw', [
                ...authArgs,
                item.model,
                'read',
                [item.ids, ['display_name']]
            ]);
            recordNames[item.model] = {};
            records.forEach(r => {
                recordNames[item.model][r.id] = typeof r.display_name === 'string' ? r.display_name : '';
            });
        } catch (err) {
            console.warn(`Failed to fetch display_names for ${item.model}`, err);
        }
    }

    for (const item of modelRecords) {
        if (item.model === 'res.partner') {
            item.ids.forEach(id => partnerIdsToFetch.add(id));
        } else if (item.model === 'crm.lead') {
            const records = await jsonRpcCall<OdooRecord[]>('object', 'execute_kw', [
                ...authArgs,
                item.model,
                'read',
                [item.ids, ['phone', 'mobile', 'contact_name', 'partner_name', 'partner_id']]
            ]);
            phoneResults[item.model] = {};
            nameResults[item.model] = {};
            companyResults[item.model] = {};

            const leadPartnerIds = new Set<number>();
            records.forEach(r => {
                const phone = typeof r.phone === 'string' ? r.phone : '';
                const mobile = typeof r.mobile === 'string' ? r.mobile : '';
                phoneResults[item.model][r.id] = phone || mobile || '';

                const contactName = typeof r.contact_name === 'string' ? r.contact_name : '';
                const partnerName = typeof r.partner_name === 'string' ? r.partner_name : '';
                nameResults[item.model][r.id] = contactName || partnerName || '';

                // Track partner IDs for company lookup
                if (r.partner_id && Array.isArray(r.partner_id)) {
                    leadPartnerIds.add(r.partner_id[0] as number);
                }
            });

            // Fetch company names for lead partners
            if (leadPartnerIds.size > 0) {
                const leadPartners = await jsonRpcCall<OdooRecord[]>('object', 'execute_kw', [
                    ...authArgs,
                    'res.partner',
                    'read',
                    [Array.from(leadPartnerIds), ['name', 'parent_id', 'is_company']]
                ]);

                const companyIdsForLeads = new Set<number>();
                const partnerToCompanyMap: Record<number, number> = {};

                leadPartners.forEach(p => {
                    // If this partner has a parent (company), use that
                    if (p.parent_id && Array.isArray(p.parent_id)) {
                        const parentId = p.parent_id[0] as number;
                        companyIdsForLeads.add(parentId);
                        partnerToCompanyMap[p.id] = parentId;
                    }
                    // If this partner IS a company, use its own name
                    else if (p.is_company) {
                        const name = typeof p.name === 'string' ? p.name : '';
                        companyResults[item.model] = companyResults[item.model] || {};
                        // Map all records that reference this partner
                        records.forEach(r => {
                            if (r.partner_id && Array.isArray(r.partner_id) && r.partner_id[0] === p.id) {
                                companyResults[item.model][r.id] = name;
                            }
                        });
                    }
                });

                // Fetch actual company names
                if (companyIdsForLeads.size > 0) {
                    const companies = await jsonRpcCall<OdooRecord[]>('object', 'execute_kw', [
                        ...authArgs,
                        'res.partner',
                        'read',
                        [Array.from(companyIdsForLeads), ['name']]
                    ]);
                    const companyIdToName: Record<number, string> = {};
                    companies.forEach(c => {
                        companyIdToName[c.id] = typeof c.name === 'string' ? c.name : '';
                    });

                    records.forEach(r => {
                        if (r.partner_id && Array.isArray(r.partner_id)) {
                            const partnerId = r.partner_id[0] as number;
                            const companyId = partnerToCompanyMap[partnerId];
                            if (companyId) {
                                companyResults[item.model][r.id] = companyIdToName[companyId] || '';
                            }
                        }
                    });
                }
            }
        } else if (item.model === 'project.task' || item.model === 'sale.order' || item.model === 'helpdesk.ticket') {
            const fields = ['partner_id'];
            if (item.model === 'sale.order') {
                fields.push('amount_total', 'state');
            } else if (item.model === 'project.task' || item.model === 'helpdesk.ticket') {
                fields.push('stage_id');
            }

            const records = await jsonRpcCall<OdooRecord[]>('object', 'execute_kw', [
                ...authArgs,
                item.model,
                'read',
                [item.ids, fields]
            ]);

            metaResults[item.model] = metaResults[item.model] || {};
            if (item.model === 'sale.order') {
                // Customer name is handled in nameResults/contactName
            } else if (item.model === 'project.task' || item.model === 'helpdesk.ticket') {
                records.forEach(r => {
                    if (r.stage_id && Array.isArray(r.stage_id)) {
                        metaResults[item.model][r.id] = String(r.stage_id[1]);
                    }
                });
            }
            records.forEach(r => {
                if (r.partner_id && Array.isArray(r.partner_id)) {
                    const pid = r.partner_id[0] as number;
                    partnerIdsToFetch.add(pid);
                    taskToPartnerMap[r.id] = pid;
                }
            });
        }
    }

    if (partnerIdsToFetch.size > 0) {
        const partnerRecords = await jsonRpcCall<OdooRecord[]>('object', 'execute_kw', [
            ...authArgs,
            'res.partner',
            'read',
            [Array.from(partnerIdsToFetch), ['phone', 'mobile', 'name', 'parent_id']]
        ]);

        const partnerPhoneMap: Record<number, string> = {};
        const partnerNameMap: Record<number, string> = {};
        const partnerCompanyMap: Record<number, string> = {};
        const companyIdsToFetch = new Set<number>();

        partnerRecords.forEach(r => {
            const phone = typeof r.phone === 'string' ? r.phone : '';
            const mobile = typeof r.mobile === 'string' ? r.mobile : '';
            partnerPhoneMap[r.id] = phone || mobile || '';

            const name = typeof r.name === 'string' ? r.name : '';
            partnerNameMap[r.id] = name;

            // Track company IDs
            if (r.parent_id && Array.isArray(r.parent_id)) {
                companyIdsToFetch.add(r.parent_id[0] as number);
            }
        });

        // Fetch company names
        if (companyIdsToFetch.size > 0) {
            const companyRecords = await jsonRpcCall<OdooRecord[]>('object', 'execute_kw', [
                ...authArgs,
                'res.partner',
                'read',
                [Array.from(companyIdsToFetch), ['name']]
            ]);
            const companyIdToName: Record<number, string> = {};
            companyRecords.forEach(c => {
                companyIdToName[c.id] = typeof c.name === 'string' ? c.name : '';
            });

            partnerRecords.forEach(r => {
                if (r.parent_id && Array.isArray(r.parent_id)) {
                    partnerCompanyMap[r.id] = companyIdToName[r.parent_id[0] as number] || '';
                }
            });
        }

        // Map back to res.partner
        phoneResults['res.partner'] = phoneResults['res.partner'] || {};
        nameResults['res.partner'] = nameResults['res.partner'] || {};
        companyResults['res.partner'] = companyResults['res.partner'] || {};
        partnerRecords.forEach(r => {
            phoneResults['res.partner'][r.id] = partnerPhoneMap[r.id];
            nameResults['res.partner'][r.id] = partnerNameMap[r.id];
            companyResults['res.partner'][r.id] = partnerCompanyMap[r.id] || '';
        });

        // Map back to project.task, sale.order, helpdesk.ticket
        ['project.task', 'sale.order', 'helpdesk.ticket'].forEach(model => {
            phoneResults[model] = phoneResults[model] || {};
            nameResults[model] = nameResults[model] || {};
            companyResults[model] = companyResults[model] || {};
        });

        Object.entries(taskToPartnerMap).forEach(([taskId, pid]) => {
            const id = parseInt(taskId);
            const modelForTask = modelRecords.find(mr => mr.ids.includes(id))?.model;
            if (modelForTask) {
                phoneResults[modelForTask][id] = partnerPhoneMap[pid] || '';
                nameResults[modelForTask][id] = partnerNameMap[pid] || '';
                companyResults[modelForTask][id] = partnerCompanyMap[pid] || '';
            }
        });
    }

    return { phones: phoneResults, names: nameResults, companies: companyResults, recordNames, meta: metaResults };
}

export async function markActivityDone(activityId: number, feedback?: string) {
    const uid = await getUid();
    const authArgs = await getAuthKwArgs(uid);

    const method = feedback ? 'action_feedback' : 'action_done';
    const kwargs = feedback ? { feedback } : {};

    return await jsonRpcCall<any>('object', 'execute_kw', [
        ...authArgs,
        'mail.activity',
        method,
        [[activityId]],
        kwargs
    ]);
}

export async function snoozeActivityMañana(activityId: number) {
    const uid = await getUid();
    const authArgs = await getAuthKwArgs(uid);

    // Calculate next business day
    const today = new Date();
    const nextDay = new Date(today);
    nextDay.setDate(today.getDate() + 1);

    // If Saturday, go to Monday
    if (nextDay.getDay() === 6) nextDay.setDate(nextDay.getDate() + 2);
    // If Sunday, go to Monday
    if (nextDay.getDay() === 0) nextDay.setDate(nextDay.getDate() + 1);

    const dateStr = nextDay.toISOString().split('T')[0];

    return await jsonRpcCall<boolean>('object', 'execute_kw', [
        ...authArgs,
        'mail.activity',
        'write',
        [[activityId], { date_deadline: dateStr }]
    ]);
}

interface ActivityTypeRecord {
    id: number;
    triggered_next_type_id: [number, string] | false;
    delay_count: number;
    delay_unit: 'days' | 'weeks' | 'months';
}

export async function getActivityType(typeId: number): Promise<ActivityTypeRecord | null> {
    const uid = await getUid();
    const authArgs = await getAuthKwArgs(uid);

    const records = await jsonRpcCall<ActivityTypeRecord[]>('object', 'execute_kw', [
        ...authArgs,
        'mail.activity.type',
        'read',
        [[typeId], ['triggered_next_type_id', 'delay_count', 'delay_unit']]
    ]);

    return records?.[0] ?? null;
}

function nextBizDay(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
}

export async function createActivity(
    resModel: string,
    resId: number,
    activityTypeId: number,
    delayCount: number,
    delayUnit: 'days' | 'weeks' | 'months'
): Promise<number> {
    const uid = await getUid();
    const authArgs = await getAuthKwArgs(uid);

    // In Odoo 17, res_model is readonly/computed — must pass res_model_id (ir.model ID)
    const modelRecords = await jsonRpcCall<{ id: number }[]>('object', 'execute_kw', [
        ...authArgs,
        'ir.model',
        'search_read',
        [[['model', '=', resModel]]],
        { fields: ['id'], limit: 1 }
    ]);
    if (!modelRecords?.length) {
        throw new Error(`ir.model record not found for model: ${resModel}`);
    }
    const resModelId = modelRecords[0].id;

    let deadline: string;
    if (delayCount > 0) {
        const d = new Date();
        if (delayUnit === 'days') d.setDate(d.getDate() + delayCount);
        else if (delayUnit === 'weeks') d.setDate(d.getDate() + delayCount * 7);
        else if (delayUnit === 'months') d.setMonth(d.getMonth() + delayCount);
        deadline = d.toISOString().split('T')[0];
    } else {
        deadline = nextBizDay();
    }

    return await jsonRpcCall<number>('object', 'execute_kw', [
        ...authArgs,
        'mail.activity',
        'create',
        [{
            res_model_id: resModelId,
            res_id: resId,
            activity_type_id: activityTypeId,
            date_deadline: deadline,
            user_id: uid,
        }]
    ]);
}

export async function postLogNote(resModel: string, resId: number, body: string) {
    const uid = await getUid();
    const authArgs = await getAuthKwArgs(uid);
    return await jsonRpcCall<number>('object', 'execute_kw', [
        ...authArgs,
        resModel,
        'message_post',
        [],
        {
            res_id: resId,
            body,
            message_type: 'comment',
            subtype_xmlid: 'mail.mt_note',
        }
    ]);
}

export async function appendActivityNote(activityId: number, newText: string) {
    const uid = await getUid();
    const authArgs = await getAuthKwArgs(uid);

    // Fetch the current note HTML
    const records = await jsonRpcCall<{ id: number; note: string | false }[]>('object', 'execute_kw', [
        ...authArgs,
        'mail.activity',
        'read',
        [[activityId], ['note']]
    ]);

    const existing = records?.[0]?.note || '';

    // Build timestamp like "14.03.2026 09:40"
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const separator = existing ? '<br/><br/>' : '';
    const appended = `${existing}${separator}<em>[${timestamp}]</em> ${newText}`;

    return await jsonRpcCall<boolean>('object', 'execute_kw', [
        ...authArgs,
        'mail.activity',
        'write',
        [[activityId], { note: appended }]
    ]);
}
