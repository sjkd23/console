// bot/src/lib/http.ts

const BASE = process.env.BACKEND_URL!;
const API_KEY = process.env.BACKEND_API_KEY!;

function headers() {
    return {
        'content-type': 'application/json',
        'x-api-key': API_KEY,
    };
}

export class BackendError extends Error {
    code?: string;
    status?: number;
    constructor(message: string, code?: string, status?: number) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

async function handle(res: Response) {
    const text = await res.text();
    let data: any;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (res.ok) return data;

    // Expect unified error: { error: { code, message } }
    const code = data?.error?.code ?? 'UNKNOWN';
    const msg = data?.error?.message ?? `HTTP ${res.status}`;
    throw new BackendError(msg, code, res.status);
}

export async function getJSON<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`, { method: 'GET', headers: headers() });
    return handle(res) as Promise<T>;
}

export async function postJSON<T>(path: string, body: any): Promise<T> {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    return handle(res) as Promise<T>;
}

export async function patchJSON<T>(path: string, body: any): Promise<T> {
    const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(body) });
    return handle(res) as Promise<T>;
}

export async function deleteJSON<T>(path: string, body: any): Promise<T> {
    const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: headers(), body: JSON.stringify(body) });
    return handle(res) as Promise<T>;
}
