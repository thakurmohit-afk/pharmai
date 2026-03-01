# PharmAI

PharmAI is an agentic pharmacy assistant with:
- GPT pharmacist chat + tool-calling medicine search
- safety/inventory-aware order flow
- Razorpay test-mode payment confirmation
- voice and prescription upload support
- app-level auth with account-scoped history

## Runtime Architecture (Source of Truth)

Main orchestration lives in `backend/app/agents/graph.py`:
1. `profiling`
2. `predictive`
3. `pharmacist`
4. conditional `safety -> inventory -> execution` when order action proceeds
5. payment finalize in `POST /api/payment/verify`

Conversation persistence:
- `chat_threads` + `chat_messages` store per-account thread history
- `user_memories` stores compact long-term summary per user
- pending-order confirmation state is thread-scoped (`chat_thread_state`)
- confirmation intent is GPT-classified (no hardcoded keyword requirement)
- confirmation is asked once per quote version; unclear replies do not execute orders
- first valid confirmation reply after summary proceeds directly to execution/payment path
- legacy pending states are auto-hydrated with derived `quote_signature` + confirmation flags

## Auth + Sessions

- Email/password auth (`/api/auth/*`)
- HttpOnly cookie sessions (access + refresh)
- Refresh token rotation backed by `user_sessions`
- RBAC: `/api/admin/*` requires `role=admin`
- Dev-only bypass available via `ALLOW_DEMO_BYPASS=true` and `/api/auth/dev-login`

## API Highlights

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/dev-login` (dev-only)

- `POST /api/chat` body: `{ message, conversation_id }` (conversation is required)
- `POST /api/chat` returns:
  - `422 conversation_required` if `conversation_id` missing
  - `404 conversation_not_found` if thread does not exist or is not owned by caller
- `POST /api/chat` response includes deterministic `quote` when medicine/order context exists:
  - `currency`, `display_unit`, `total_amount`, `conversion_note`, `lines[]`
  - `lines[]` include `requested_qty/unit` and canonical `billing_qty` in strips
- `GET /api/chat/threads`
- `POST /api/chat/threads`
- `GET /api/chat/threads/{conversation_id}/messages`
- `DELETE /api/chat/threads/{conversation_id}`
- `DELETE /api/chat/threads?scope=all` (bulk delete current user's threads; admin can pass `demo_users=true`)

- `GET /api/system/llm-status` (OpenAI auth/config probe)
- `GET /api/system/cache-status` (active cache backend + namespace)
- `POST /api/system/cache/clear` (admin-only)

- `GET /api/user/me/profile`
- `GET /api/user/me/dashboard`

- `POST /api/voice/token` (voice auth token for ElevenLabs bridge)
- `POST /v1/chat/completions` (ElevenLabs custom LLM endpoint)
- `POST /api/prescription/upload`
- `POST /api/payment/verify`

## Local Setup

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Recommended local `.env` defaults:

```env
DATABASE_URL=sqlite+aiosqlite:///./pharmacy.db
APP_ENV=development
AUTH_ENABLED=true
ALLOW_DEMO_BYPASS=true
PAYMENT_ENABLED=false
```

Seed/reset local DB:

```bash
python seed_data.py
```

Purge only demo thread noise (without reseeding medicines/orders):

```bash
python scripts/purge_demo_threads.py
# optional:
# python scripts/purge_demo_threads.py --include-memory
```

Run backend:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend env:

```env
VITE_ELEVENLABS_AGENT_ID=agent_xxx
VITE_ALLOW_DEMO_BYPASS=true
# Optional if not using Vite proxy:
# VITE_API_BASE=http://localhost:8000/api
```

## Seeded Demo Accounts (Local Only)

All seeded demo accounts use password: `Demo@1234`

- `aarav@demo.com` (`user`) - `72bbd3a6-f61d-4e85-849c-2fb3364ee71e`
- `priya@demo.com` (`user`) - `fddcb7b6-2995-4eb7-a2e3-2df541d62fc6`
- `rahul@demo.com` (`user`) - `7a7189fb-f225-4e24-aac4-be387c9b697a`
- `admin@demo.com` (`admin`) - `9f4b3f2b-8ec8-4d88-b95b-19d8d7f6f100`

## Deployment Notes (Current Phase)

- Razorpay stays in test mode.
- App auth is now enabled; keep infra restrictions for admin/webhook paths as defense-in-depth.
- PostgreSQL + Redis are recommended for VPS deployment.
- Pricing contract for this phase:
  - `medicine.price` is interpreted as price per strip.
  - Inventory stock is treated as strips.
- Thread creation contract:
  - manual-only from `POST /api/chat/threads`
  - chat send will not auto-create a thread on missing/invalid IDs

## Non-Goals in This Phase

- Forgot-password flow
- OAuth/OTP login providers
- Public anonymous chat mode
