# Feature Implementation Prompt for PharmAI

You are tasked with implementing two major new features for **PharmAI**, an AI-powered personal pharmacy application. The application's core stack is:
-   **Backend:** FastAPI (Python), SQLAlchemy (SQLite by default), Pydantic, LangChain/LangGraph (for the Conversational Medical AI).
-   **Frontend:** React (Vite), TypeScript, Tailwind CSS, Lucide Icons.
-   **Architecture:** The conversational AI uses a side-channel (Redis) to push rich UI payloads (like medication quotes and order summaries) to the frontend in real-time alongside text responses.

## Feature 1: "Notify Me" for Out-of-Stock Medications

**User Story:** When a user asks the AI for a medication and it is currently out of stock, the AI should offer an option: *"This medication is currently out of stock. Would you like me to notify you (via email or WhatsApp) when it's back in stock?"*. If the user agrees, they are added to a waitlist. When the pharmacy restocks the item, the system should automatically send a notification to the user.

**Implementation Details:**
1.  **Database Changes (`app/models/`):**
    *   Create a `Waitlist` or `StockNotification` table linking a `user_id` to a `medicine_name` or `medicine_id`, along with the `notification_method` (email, whatsapp) and `status` (pending, notified).
2.  **Conversational Agent (`app/agents/`):**
    *   Update the `pharmacy.py` or `graph.py` tools such that when checking inventory (`check_inventory` tool), if the stock is `0`, the AI returns a state recommending the waitlist.
    *   Add an AI tool or intent to add the user to the `Waitlist` table.
3.  **Frontend Rich UI (`frontend_v2/`):**
    *   When a medication is out of stock, the AI should trigger a specific rich payload type (e.g., `type: "waitlist_offer"`).
    *   The frontend should render a beautiful "Out of Stock" card with an input for email/WhatsApp and a "Notify Me" button.
4.  **Backend Webhook / Polling mechanism (`app/routes/`):**
    *   Create a simple scheduled task or a manual admin endpoint (e.g., `/api/admin/restock`) that simulates a restock. When triggered, it checks the waitlist for the restocked item and "sends" the notification (via Twilio/SendGrid mock or actual API if configured), then marks the waitlist entry as `notified`.

---

## Feature 2: Multi-Item Shopping Cart System

**User Story:** Currently, the AI handles single-order workflows (e.g., "I need Paracetamol", which immediately yields an order quote). We need a full **Cart System**. The user can say "Add Paracetamol to my cart", "Also add a thermometer", "Show my cart", and "Checkout my cart". 

**Implementation Details:**
1.  **Database Changes (`app/models/`):**
    *   Create a `Cart` model associated with the `user_id`.
    *   Create `CartItem` model associated with the `Cart` (storing `medicine_id`, `quantity`, `price`).
2.  **Conversational Agent Integration (`app/agents/`):**
    *   Update the AI tools to support `add_to_cart`, `remove_from_cart`, `view_cart`, and `checkout_cart`.
    *   The conversational state (`ChatThreadState` / `pending_state`) should perhaps transition to tracking the `cart_id` instead of a single `pending_quote`.
3.  **Frontend UI (`frontend_v2/`):**
    *   In the rich UI payloads sent by the AI, include a `cart_summary` payload.
    *   Create a polished `CartCard` component in React. It should display a list of items, their quantities, prices, total cost, and a prominent "Proceed to Checkout" button.
    *   Create a persistent cart icon in the top navigation bar (e.g., `<ShoppingCart>`) with a badge showing the number of items. Clicking it opens a right-side drawer or modal with the cart contents.
4.  **Checkout Flow (`app/services/`):**
    *   When the user clicks "Checkout" (or asks the AI to checkout), transition the cart contents into an `Order` and trigger the existing payment mock flow. The cart should be cleared upon successful payment.

## Your Task

Please provide the implementation code for these two features. 
1.  Start with the backend database models (`models.py`).
2.  Provide the AI tools and graph state updates (`pharmacist.py`, `graph.py`).
3.  Provide the FastAPI routes for the cart and waitlist (`routes/cart.py`, etc.).
4.  Provide the React frontend components for the Cart UI and Waitlist UI (`CartCard.tsx`, `WaitlistOfferCard.tsx`).

Make sure the code is production-ready, typed, and follows the existing architectural patterns. Provide clear instructions on where to place or inject the code snippets into the existing codebase.
