/* API service - centralized HTTP client for the backend */
const rawBase = import.meta.env.DEV
    ? (import.meta.env.VITE_API_BASE || '/api')
    : '/api'; // Production: use Vercel proxy rewrite
const API_BASE = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;
let inFlightRefresh: Promise<any> | null = null;

export class ApiError extends Error {
    status: number;
    code: string;
    data: any;

    constructor(message: string, { status = 0, code = 'api_error', data = null } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.data = data;
    }
}

function toApiError(status: number, detail: any, fallbackMessage: string) {
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        return new ApiError(detail.message || fallbackMessage, {
            status,
            code: detail.code || 'api_error',
            data: detail,
        });
    }
    if (typeof detail === 'string' && detail.trim()) {
        return new ApiError(detail, {
            status,
            code: 'api_error',
            data: detail,
        });
    }
    return new ApiError(fallbackMessage, {
        status,
        code: 'api_error',
        data: detail,
    });
}

async function parseError(res: Response) {
    const text = await res.text();
    if (!text) {
        return new ApiError(res.statusText || `HTTP ${res.status}`, {
            status: res.status,
            code: 'http_error',
        });
    }
    try {
        const json = JSON.parse(text);
        return toApiError(
            res.status,
            json.detail ?? json,
            json.detail?.message || res.statusText || `HTTP ${res.status}`
        );
    } catch {
        return new ApiError(text, { status: res.status, code: 'http_error', data: text });
    }
}

async function refreshSessionInternal() {
    if (!inFlightRefresh) {
        inFlightRefresh = (async () => {
            const res = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) {
                throw await parseError(res);
            }
            if (res.status === 204) return null;
            return res.json();
        })().finally(() => {
            inFlightRefresh = null;
        });
    }
    return inFlightRefresh;
}

async function request(path: string, options: RequestInit = {}, retriedAfterRefresh = false) {
    const headers = { ...(options.headers as Record<string, string>) };
    const isFormData = options.body instanceof FormData;
    if (!isFormData && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        ...options,
        headers,
    });
    if (!res.ok) {
        // Retry exactly once after refreshing session for protected non-auth endpoints.
        if (res.status === 401 && !retriedAfterRefresh && !path.startsWith('/auth/')) {
            try {
                await refreshSessionInternal();
                return request(path, options, true);
            } catch {
                // Fall through to original 401 parsing.
                // AuthContext will set user=null, and React routing
                // will show the login page — no hard redirect needed.
            }
        }
        throw await parseError(res);
    }
    if (res.status === 204) return null;
    return res.json();
}

/* Auth */
export async function registerUser(payload: any) {
    return request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export async function loginUser(payload: any) {
    return request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export async function logoutUser() {
    return request('/auth/logout', { method: 'POST' });
}

export async function refreshSession() {
    return request('/auth/refresh', { method: 'POST' });
}

export async function getMe() {
    return request('/auth/me');
}

export async function devLogin(email: string) {
    return request('/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ email }),
    });
}

/* Chat */
export async function sendMessage(message: string, conversationId?: string | null) {
    return request('/chat', {
        method: 'POST',
        body: JSON.stringify({ message, conversation_id: conversationId || null }),
    });
}


export async function listChatThreads() {
    return request('/chat/threads');
}

export async function createChatThread(title: string) {
    let clientSessionId = null;
    try {
        clientSessionId = sessionStorage.getItem('pharm_client_session_id') || null;
    } catch {
        clientSessionId = null;
    }
    return request('/chat/threads', {
        method: 'POST',
        body: JSON.stringify({
            title,
            client_session_id: clientSessionId,
        }),
    });
}

export async function getThreadMessages(conversationId: string) {
    return request('/chat/threads/' + conversationId + '/messages');
}

export async function deleteChatThread(conversationId: string) {
    return request('/chat/threads/' + conversationId, {
        method: 'DELETE',
    });
}

/* Voice */
export async function uploadVoice(audioBlob: Blob) {
    const form = new FormData();
    form.append('audio_file', audioBlob, 'recording.webm');
    return request('/voice/upload', { method: 'POST', body: form });
}

export function speakUrl(text: string) {
    return API_BASE + '/voice/speak?text=' + encodeURIComponent(text);
}

export async function getVoiceToken() {
    return request('/voice/token', { method: 'POST' });
}

export async function runHybridVoiceTurn(audioBlob: Blob, threadId: string) {
    const form = new FormData();
    form.append('audio_file', audioBlob, 'voice-turn.webm');
    form.append('thread_id', threadId);
    return request('/voice/turn', { method: 'POST', body: form });
}

export async function getVoiceLastAction() {
    return request('/voice/last-action');
}

export async function notifyVoicePaymentStatus(status: string, orderId?: string) {
    return request('/voice/payment-status', {
        method: 'POST',
        body: JSON.stringify({ status, order_id: orderId || '' }),
    });
}

export async function notifyVoiceSessionEnd() {
    return request('/voice/session-end', { method: 'POST' }).catch(() => { });
}

/* Prescription */
export async function uploadPrescription(imageFile: File) {
    const form = new FormData();
    form.append('image_file', imageFile);
    return request('/prescription/upload', { method: 'POST', body: form });
}

export async function uploadPrescriptionToChat(imageFile: File, conversationId?: string) {
    const form = new FormData();
    form.append('image_file', imageFile);
    if (conversationId) form.append('conversation_id', conversationId);
    return request('/prescription/upload', { method: 'POST', body: form });
}

/* User */
export async function getMyProfile() {
    return request('/user/me/profile');
}

export async function getMyDashboard() {
    return request('/user/me/dashboard');
}

export async function updateMyProfile(payload: any) {
    return request('/user/me/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
    });
}

export async function uploadAvatar(file: File) {
    const form = new FormData();
    form.append('avatar', file);
    return request('/user/me/avatar', { method: 'POST', body: form });
}

/* Admin */
export async function getAdminAlerts() {
    return request('/admin/alerts');
}

export async function getInventory() {
    return request('/admin/inventory');
}

export async function restockMedicine(medicineId: number, quantity: number) {
    return request('/admin/restock', {
        method: 'POST',
        body: JSON.stringify({ medicine_id: medicineId, quantity }),
    });
}

export async function getPrescriptionQueue() {
    return request('/admin/prescriptions');
}

export async function getAdminOverview() {
    return request('/admin/overview');
}

export async function getAdminOrders(limit = 50) {
    return request('/admin/orders?limit=' + limit);
}

export async function getAdminUsers() {
    return request('/admin/users');
}

export async function getAdminDispensingLogs(limit = 50) {
    return request('/admin/dispensing-logs?limit=' + limit);
}

export async function getAdminThreads(limit = 50) {
    return request('/admin/threads?limit=' + limit);
}

export async function getAdminThreadTrace(threadId: string) {
    return request('/admin/threads/' + threadId + '/trace');
}

export async function getAdminLiveTraces(limit = 30) {
    return request('/admin/traces/live?limit=' + limit);
}

export async function getUserProfile(userId: string) {
    return request('/user/' + userId + '/profile');
}

export async function getUserDashboard(userId: string) {
    return request('/user/' + userId + '/dashboard');
}

/* Payment */
export async function verifyPayment(paymentData: any) {
    return request('/payment/verify', {
        method: 'POST',
        body: JSON.stringify(paymentData),
    });
}

/* System diagnostics */
export async function getLlmStatus(forceRefresh = false) {
    const query = forceRefresh ? '?force_refresh=true' : '';
    return request('/system/llm-status' + query);
}

export async function getCacheStatus() {
    return request('/system/cache-status');
}

export async function clearRuntimeCache() {
    return request('/system/cache/clear', {
        method: 'POST',
    });
}

/* Cart */
export async function getCart() {
    return request('/cart');
}

export async function addCartItem(medicineName: string, quantity = 1) {
    return request('/cart/items', {
        method: 'POST',
        body: JSON.stringify({ medicine_name: medicineName, quantity }),
    });
}

export async function updateCartItem(itemId: string, quantity: number) {
    return request('/cart/items/' + itemId, {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
    });
}

export async function removeCartItem(itemId: string) {
    return request('/cart/items/' + itemId, { method: 'DELETE' });
}

export async function clearCart() {
    return request('/cart/clear', { method: 'DELETE' });
}

export async function checkoutCart() {
    return request('/cart/checkout', { method: 'POST' });
}

/* Admin Analytics */
export async function getAdminSystemHealth() {
    return request('/admin/health');
}


export async function getStockForecast() {
    return request('/admin/forecast');
}

export async function getSeasonalAlerts() {
    return request('/admin/seasonal-alerts');
}

export async function getStockHeatmap() {
    return request('/admin/stock-heatmap');
}

export async function getPatientSummary(userId: string) {
    return request('/admin/patient-summary/' + userId);
}

export async function getPatientAIInsight(userId: string) {
    return request('/admin/patient-ai-insight/' + userId);
}

export async function adminNlpSearch(query: string) {
    return request('/admin/nlp-search', {
        method: 'POST',
        body: JSON.stringify({ query }),
    });
}

/* Patient Search */
export async function semanticSearch(query: string, limit = 12) {
    return request('/search', {
        method: 'POST',
        body: JSON.stringify({ query, limit }),
    });
}

/* Waitlist — Back in Stock Notifications */
export async function subscribeWaitlist(medicineName: string, notificationMethod = 'email') {
    return request('/waitlist/subscribe', {
        method: 'POST',
        body: JSON.stringify({ medicine_name: medicineName, notification_method: notificationMethod }),
    });
}

export async function unsubscribeWaitlist(waitlistId: string) {
    return request('/waitlist/' + waitlistId, { method: 'DELETE' });
}

export async function checkWaitlistStatus(medicineName: string) {
    return request('/waitlist/check?medicine_name=' + encodeURIComponent(medicineName));
}

export async function getWaitlist() {
    return request('/waitlist');
}

/* Admin — CSV Medicine Import */
export async function importMedicines(file: File) {
    const form = new FormData();
    form.append('file', file);
    return request('/admin/import-medicines', {
        method: 'POST',
        body: form,
    });
}
