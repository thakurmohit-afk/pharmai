<p align="center">
  <h1 align="center">💊 PharmAI</h1>
  <p align="center"><strong>AI-Powered Autonomous Pharmacy Platform</strong></p>
  <p align="center">
    Multi-agent AI system that handles medicine ordering, prescription analysis, voice interactions, and pharmacy operations — end to end.
  </p>
</p>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                 │
│  Chat UI · Voice Mode · Prescription Upload · Admin     │
└─────────────────────┬───────────────────────────────────┘
                      │ REST API + WebSocket
┌─────────────────────▼───────────────────────────────────┐
│                 FastAPI Backend                          │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │            LangGraph Multi-Agent Pipeline         │   │
│  │                                                   │   │
│  │  Supervisor → Understanding → Pharmacist AI       │   │
│  │     → Safety Gate → Inventory → Execution         │   │
│  │     → Patient Profiling → Predictive Analytics    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  Services: Medicine Search · Clinical Validator         │
│  Prescription OCR (Gemini) · ML Forecast · TTS/STT     │
│  Patient Profiler · Pricing Engine · Email/SMS          │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   SQLite DB      Redis Cache    OpenAI / Gemini
```

---

## ✨ Key Features

### 🤖 AI Chat Assistant
- Natural language medicine ordering ("I have a headache")
- Multi-turn conversations with context memory
- Automatic cart building, payment flow, and delivery tracking
- Medicine recommendations with clinical validation

### 📋 Prescription OCR
- Upload prescription images or PDFs
- **Google Gemini 3.0 Flash** extracts medicines, dosages, and doctor info
- Auto-matches against medicine database with clinical-grade accuracy
- Molecule-level ingredient matching (exact, strength mismatch, therapeutic equivalent)
- Prescription date validation and completeness checks

### 🎤 Voice Mode
- Inline voice interaction — chat stays visible
- Browser STT → existing chat pipeline → ElevenLabs TTS
- Real-time shader ball visualization with listening/speaking states

### 🏥 Multi-Agent Pipeline (LangGraph)
| Agent | Role |
|---|---|
| **Supervisor** | Routes queries to the right specialist agent |
| **Understanding** | NLU — extracts intent, entities, medicine names |
| **Pharmacist AI** | Clinical reasoning, drug info, dosage guidance |
| **Safety Gate** | Blocks dangerous interactions, validates prescriptions |
| **Inventory** | Real-time stock check, pricing, alternatives |
| **Execution** | Cart ops, order placement, payment orchestration |
| **Patient Profiler** | Builds patient intelligence from conversation history |
| **Predictive** | Refill predictions, adherence tracking |

### 📊 Admin Panel
- **Overview Dashboard** — orders, revenue, user stats (live data)
- **Medicine Inventory** — stock management + AI CSV import
- **AI Insights** — model performance, pipeline analytics
- **Trace Explorer** — live Chain of Thought for every user query
- **Analytics & Forecast** — ML-powered demand forecasting
- **Refill Calls** — automated outbound refill reminders via Twilio
- **System Health** — LLM status, cache, queue monitoring

### 🛒 E-Commerce
- Smart cart with real-time pricing
- Razorpay payment integration (test mode)
- Order tracking with delivery status
- Waitlist for out-of-stock medicines

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Three.js |
| **Backend** | FastAPI, Python 3.12, LangGraph, SQLAlchemy (async) |
| **AI/LLM** | OpenAI GPT-4.1, Google Gemini 3.0 Flash, LangChain |
| **Database** | SQLite (dev) / PostgreSQL (prod), Redis cache |
| **Voice** | Web Speech API (STT), ElevenLabs (TTS) |
| **Payments** | Razorpay |
| **Calls** | Twilio (outbound refill reminders) |
| **Email** | Gmail SMTP (order confirmations) |
| **Observability** | LangFuse (LLM tracing) |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.12+
- Node.js 18+ & pnpm
- OpenAI API key
- Google Gemini API key

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Run
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend_v2
pnpm install
pnpm dev                     # Runs on http://localhost:8080
```

---

## 🌐 Deployment

| Service | Platform | Config |
|---|---|---|
| Frontend | Vercel | `frontend_v2/vercel.json` |
| Backend | Render | `render.yaml` |

See deployment configs in the repo root. Set `VITE_API_BASE` on Vercel pointing to your Render backend URL.

---

## 📁 Project Structure

```
HF26/
├── backend/
│   ├── app/
│   │   ├── agents/          # LangGraph multi-agent pipeline
│   │   │   ├── graph.py     # Main agent orchestration graph
│   │   │   ├── pharmacist.py # Clinical reasoning agent
│   │   │   ├── safety.py    # Safety gate agent
│   │   │   ├── inventory.py # Stock & pricing agent
│   │   │   └── ...
│   │   ├── models/          # SQLAlchemy models
│   │   ├── routes/          # FastAPI endpoints
│   │   ├── services/        # Business logic
│   │   │   ├── prescription_service.py  # Gemini OCR
│   │   │   ├── clinical_validator.py    # Drug matching
│   │   │   ├── medicine_search.py       # Hybrid search
│   │   │   ├── patient_profiler.py      # Intelligence engine
│   │   │   └── ...
│   │   └── config.py        # Settings
│   └── requirements.txt
│
├── frontend_v2/
│   ├── client/
│   │   ├── components/      # React components
│   │   │   ├── chat/        # Chat UI (ChatArea, ShaderCanvas, Cards)
│   │   │   └── admin/       # Admin panel components
│   │   ├── pages/           # Route pages
│   │   ├── hooks/           # Voice agent hooks
│   │   ├── services/api.ts  # API client
│   │   └── context/         # Auth, Theme providers
│   └── vercel.json
│
├── render.yaml              # Render deployment config
└── .gitignore
```

---

## 👥 Team

Built for **HackFusia 2026** 🏆

---

## 📄 License

MIT
