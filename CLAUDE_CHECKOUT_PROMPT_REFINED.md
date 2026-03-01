# Context
You are tasked with designing the checkout orchestration logic for PharmAI, a clinical AI pharmacy system. Crucially, this system is driven by an **ElevenLabs Conversational Voice Agent** backed by a **LangGraph state machine** and **Redis** for fast turn-by-turn state persistence.

This is a state-driven checkout architecture. We need to implement intelligent refill prompting during checkout without causing conversation loops, repeated prompts, or relying on hardcoded conversational hacks.

-------------------------------------------------------
GOAL BEHAVIOR (VOICE-FIRST UX)
-------------------------------------------------------

When a user:
1) Adds items to their cart via voice.
2) Reaches the order summary stage.
3) Indicates intent to "Confirm order" or "Check out".

The system must:
A) Run a refill intelligence check in the background.
B) IF the user has a low-supply medicine (active alert)
   AND it is NOT already in the cart
   AND it has NOT already been offered in this session
→ Prompt the user exactly ONCE with a concise, natural voice prompt:

"I noticed you only have a few days left of your Amlodipine. Would you like me to add a refill to this order?"

If user says YES / CONFIRMS:
- Add the refill to the cart.
- Update `refill_offer_status = accepted`.
- Smoothly continue the checkout flow.

If user says NO / DECLINES:
- Update `refill_offer_status = declined`.
- Smoothly continue the checkout flow without pushing further.

If NO refill risk is detected:
- Skip the prompt and proceed directly to payment.

-------------------------------------------------------
CRITICAL: LOOP PREVENTION & STATE TRACKING
-------------------------------------------------------

Because voice LLMs can easily fall into loops if state isn't strictly managed in the LangGraph/Redis layer, you MUST design robust state tracking.

Required Session State Flags (in Redis/LangGraph state):

`checkout_state`:
- `cart_review`
- `refill_prompted`
- `refill_added`
- `refill_declined`
- `payment_pending`
- `payment_complete`
- `order_closed`

`refill_offer_status`:
- `not_checked`
- `offered`
- `accepted`
- `declined`

Rules for the Agentic Workflow:
1) The refill check runs ONLY once per checkout cycle.
2) If `refill_offer_status` is `accepted` or `declined` → NEVER ask again in the same checkout cycle.
3) If the refill medicine is organically added to the cart by the user earlier, the refill check must NOT trigger.
4) Cart updates must be idempotent.

-------------------------------------------------------
VOICE PAYMENT FLOW & UI SIDE-CHANNEL
-------------------------------------------------------

After the refill logic is resolved, the system transitions to `checkout_state = payment_pending`.

Because this is a voice agent:
1) The AI emits a UI side-channel payload to render a visual payment card on the user's screen.
2) The AI says: "Please complete the payment on your screen."
3) **IMPORTANT**: Voice TTS should temporarily pause or listen quietly while the user interacts with the payment UI.
4) Once the frontend/webhook confirms payment success:
   - System deducts inventory, creates the order record, generates Order ID.
   - Updates `checkout_state = payment_complete`.
   - The AI natively resumes the conversation: "Your order is confirmed and will arrive in about 45 minutes."

-------------------------------------------------------
POST-ORDER CUSTOMER EXPERIENCE FLOW
-------------------------------------------------------

After delivery confirmation, the AI simulates a natural pharmacy closing:
AI: "Is there anything else I can help you with today?"

If user asks for something else:
- Transition back to general assistant mode / intent classification.

If user says no / goodbye:
- AI: "Thank you for choosing PharmAI. Wishing you good health."
- Update `checkout_state = order_closed`.

-------------------------------------------------------
IMPORTANT ARCHITECTURE REQUIREMENTS
-------------------------------------------------------

1) **No string-matching hacks**: Do not use `if "confirm order" in transcript`. Use the LLM/LangGraph intent classifier to detect checkout intent.
2) **Voice-Optimized Latency**: State transitions must be explicit and fast. Database lookups for refill data should be optimized so the voice agent doesn't pause awkwardly.
3) **Refill Detection Engine**: Must rely on a combination of Active Medications, Supply Estimation, and an LLM Confidence Threshold (>70%).
4) **Double-Submit Protection**: Payment execution and cart additions must be protected against the user repeating themselves due to voice transcription delays (e.g. user says "Yes add it. I said yes add it").
5) **Graceful Interruptions**: Handle edge cases where a user interrupts the prompt ("Wait, what about my other medication?"). The state machine must park the checkout, resolve the new intent, and seamlessly return.

-------------------------------------------------------
OUTPUT REQUIRED FROM CLAUDE
-------------------------------------------------------

Please provide a comprehensive architectural design including:

1) **State Machine Diagram**: Text-based (Mermaid.js preferred) showing the LangGraph nodes and transitions.
2) **Event → State Transition Table**: Clearly mapping user voice intents to state updates.
3) **Refill Decision Algorithm Logic**: Pseudocode or Python highlighting how the LangGraph node decides to prompt.
4) **Voice Payment Sync Logic**: How to handle the handoff between voice and visual UI.
5) **Loop-Prevention Logic**: Specifics on managing the Redis state to guarantee no double-prompts.
6) **Conversational Transcripts**:
   - Happy path (refill needed & accepted).
   - User declines refill.
   - Flow interrupted mid-checkout.
7) **Implementation Guidelines**: Best practices for implementing this in a LangGraph/FastAPI/ElevenLabs stack.
