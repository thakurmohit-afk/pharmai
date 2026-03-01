/* API service - centralized HTTP client for the backend */

const rawBase = import.meta.env.VITE_API_BASE || '/api';
const API_BASE = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;

export class ApiError extends Error {
    constructor(message, { status = 0, code = 'api_error', data = null } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.data = data;
    }
}

function toApiError(status, detail, fallbackMessage) {
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

async function parseError(res) {
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

async function request(path, options = {}) {
    const headers = { ...options.headers };
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
        throw await parseError(res);
    }
    if (res.status === 204) return null;
    return res.json();
}

/* Auth */
export async function registerUser(payload) {
    return request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export async function loginUser(payload) {
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

export async function devLogin(email) {
    return request('/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ email }),
    });
}

/* Chat */
export async function sendMessage(message, conversationId) {
    return request('/chat', {
        method: 'POST',
        body: JSON.stringify({ message, conversation_id: conversationId || null }),
    });
}

export async function listChatThreads() {
    return request('/chat/threads');
}

export async function createChatThread(title) {
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

export async function getThreadMessages(conversationId) {
    return request(`/chat/threads/${conversationId}/messages`);
}

export async function deleteChatThread(conversationId) {
    return request(`/chat/threads/${conversationId}`, {
        method: 'DELETE',
    });
}

/* Voice */
export async function uploadVoice(audioBlob) {
    const form = new FormData();
    form.append('audio_file', audioBlob, 'recording.webm');
    return request('/voice/upload', { method: 'POST', body: form });
}

export function speakUrl(text) {
    return `${API_BASE}/voice/speak?text=${encodeURIComponent(text)}`;
}

export async function getVoiceToken() {
    return request('/voice/token', { method: 'POST' });
}

/* Prescription */
export async function uploadPrescription(imageFile) {
    const form = new FormData();
    form.append('image_file', imageFile);
    return request('/prescription/upload', { method: 'POST', body: form });
}

/* User */
export async function getMyProfile() {
    return request('/user/me/profile');
}

export async function getMyDashboard() {
    return request('/user/me/dashboard');
}

export async function updateMyProfile(payload) {
    return request('/user/me/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
    });
}

export async function uploadAvatar(file) {
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

export async function restockMedicine(medicineId, quantity) {
    return request('/admin/restock', {
        method: 'POST',
        body: JSON.stringify({ medicine_id: medicineId, quantity }),
    });
}

export async function getPrescriptionQueue() {
    return request('/admin/prescriptions');
}

/* Payment */
export async function verifyPayment(paymentData) {
    return request('/payment/verify', {
        method: 'POST',
        body: JSON.stringify(paymentData),
    });
}

/* System diagnostics */
export async function getLlmStatus(forceRefresh = false) {
    const query = forceRefresh ? '?force_refresh=true' : '';
    return request(`/system/llm-status${query}`);
}

export async function getCacheStatus() {
    return request('/system/cache-status');
}

export async function clearRuntimeCache() {
    return request('/system/cache/clear', {
        method: 'POST',
    });
}
