# PharmAI Handover

## Product Goal

Authenticated AI pharmacist experience where each account has:
- its own chat threads
- its own dashboard/profile/order context
- per-user long-term memory summary used by GPT pharmacist

## Current Runtime Flow

`backend/app/agents/graph.py`:
1. profiling
2. predictive
3. pharmacist
4. conditional safety -> inventory -> execution
5. payment finalization in `/api/payment/verify`

## Auth and Trust Boundaries

- App-level auth is enabled (`AUTH_ENABLED=true`).
- Identity is cookie-based; frontend no longer submits `user_id` for chat/prescription.
- Refresh session records are stored in `user_sessions`.
- Admin APIs are protected by role (`require_admin`).

## Conversation and Memory

- `chat_threads` and `chat_messages` persist thread history per user.
- `/api/chat` is authenticated and requires valid `conversation_id` (manual-thread contract).
- Missing `conversation_id` returns `422 conversation_required`.
- Invalid/not-owned `conversation_id` returns `404 conversation_not_found`.
- `user_memories` stores long-term summary; profiling injects summary into pharmacist context.
- `/api/chat` now also returns deterministic `quote` for medicine/order turns:
  - canonical billing unit is strips
  - tablet requests are auto-converted to strips with conversion notes
  - totals are backend-computed (not GPT arithmetic)
- confirmation handling:
  - no hardcoded confirm/cancel keyword list
  - graph uses dedicated GPT confirmation-intent classification on pending quotes
  - single confirmation ask per quote version
  - first valid confirm reply proceeds immediately (same turn) to order execution/payment
  - legacy/incomplete pending rows are auto-hydrated (quote signature + confirmation flags)
  - unclear confirmation replies keep pending state and do not execute

## Voice Identity

- Frontend requests `/api/voice/token` before ElevenLabs session start.
- ElevenLabs custom LLM endpoint validates `customLlmExtraBody.auth_token`.
- Raw voice `user_id` is not trusted.

## Mock Accounts (Seeded)

Password for all: `Demo@1234`

- `aarav@demo.com` (`user`)
- `priya@demo.com` (`user`)
- `rahul@demo.com` (`user`)
- `admin@demo.com` (`admin`)

Deterministic IDs are defined in `backend/seed_data.py`.

## Key Files

- Auth routes: `backend/app/routes/auth.py`
- Auth dependency: `backend/app/dependencies/auth.py`
- Security utilities: `backend/app/security.py`
- Chat persistence models: `backend/app/models/chat.py`
- Session model: `backend/app/models/auth.py`
- Chat service orchestration: `backend/app/services/chat_service.py`
- Confirmation intent classifier: `backend/app/services/confirmation_intent.py`
- Thread routes: `backend/app/routes/chat_threads.py`
- System diagnostics routes: `backend/app/routes/system.py`
- Cache backend wrapper: `backend/app/redis_client.py`
- Frontend auth context: `frontend/src/auth/AuthContext.jsx`
- Frontend login/register: `frontend/src/pages/LoginPage.jsx`, `frontend/src/pages/RegisterPage.jsx`
- Frontend chat UI + threads: `frontend/src/components/Chat/ChatWindow.jsx`

## Local Validation Commands

Backend:
1. `cd backend`
2. `pip install -r requirements.txt`
3. `python seed_data.py`
4. `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
5. Optional cleanup for noisy demo chats: `python scripts/purge_demo_threads.py`

Frontend:
1. `cd frontend`
2. `npm install`
3. `npm run lint`
4. `npm run build`
5. `npm run dev`

## Debug Shortcuts

- LLM config/auth check: `GET /api/system/llm-status`
- Cache backend check: `GET /api/system/cache-status`
- Clear runtime cache (admin): `POST /api/system/cache/clear`

## Known Deferred Items

- Forgot-password / email reset flow
- OAuth/OTP providers
- Rich chat inbox features (search/rename/folders)
