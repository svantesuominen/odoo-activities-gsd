import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const target = req.headers['x-odoo-target'] as string | undefined;
    if (!target) {
        return res.status(400).json({ error: 'Missing X-Odoo-Target header' });
    }

    const url = `${target.replace(/\/+$/, '')}/jsonrpc`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        return res.status(502).json({
            error: { message: `Failed to reach Odoo server: ${String(err)}` }
        });
    }
}
