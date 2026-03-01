# Context & Objective
You are an expert full-stack developer and AI engineer tasked with upgrading the **"AI Insights"** view in the PharmAI Admin Panel. 

The user wants to transform the current `AdminAIInsights.tsx` component into a premium, highly visual "Intelligence" view that resembles an **Obsidian knowledge graph**.

## Current State & Issues
1. **User List**: The patient list on the left is basic (just name and email). It needs to feel like an intelligence list (showing risk level, active conditions, last interaction).
2. **Patient Data Representation**: Right now, when a user is clicked, data is shown in simple cards (Conditions, Risk Factors, Top Medications).
3. **Broken AI Insights**: The user noted that "rn the ai insight isnt working". The `getPatientSummary` API call in `AdminAIInsights.tsx` might be failing, or the backend endpoint `/users/{user_id}/summary` might be throwing an error or returning empty arrays for `ai_insights`.

## The Goal

### 1. Enhanced "Population Intelligence" List (Left panel)
Upgrade the `users` list representation in `AdminAIInsights.tsx`.
- Enhance the list items to show more data: avatar, a risk indicator (Red/Yellow/Green dot), number of active prescriptions, and last active time.
- Make the selected state look premium (e.g., glowing border, emerald background).

### 2. The Obsidian-Style Graph View (Top Right panel)
When a user is clicked, replace the standard card layout with a **dynamic, interactive node graph** (similar to Obsidian).
- **Central Node**: The Patient.
- **Peripheral Nodes**: Inferred Conditions (e.g., Hypertension), Top Medications (e.g., Metformin), Allergies, Risk Factors (e.g., Polypharmacy).
- **Edges (Links)**: Connect the patient to conditions, conditions to medications, and medications to specific risk factors.
- **Implementation Advice**: Use a library like `react-force-graph-2d` (you may need to install it via `npm install react-force-graph-2d`) or build a custom SVG interactive layout using `framer-motion`. Ensure it matches the dark/light theme of the app perfectly.

### 3. The "AI Insight" Detail Box (Bottom Right panel)
Below the Obsidian graph, place a sleek, glassmorphic box dedicated to the **AI Insights**.
- It should read like a chronological or synthesized narrative from an AI agent profiling the user.
- **Fix the Backend**: You will need to investigate the FastAPI backend (`backend/app/main.py` or the router where `/users/{user_id}/summary` is defined). Identify why the AI insights aren't returning or generating correctly. It likely relies on GPT-4o analyzing the user's order history.

## Steps for Claude to Execute:

1. **Investigate the broken AI Insights API**:
   - Check `backend/app/main.py` or the respective routers for the GET summary endpoint.
   - Look at how `getPatientSummary` is implemented in `frontend_v2/client/services/api.ts`.
   - Fix any bugs in the LangChain/GPT prompting or data fetching that cause it to fail.

2. **Upgrade the User List (`AdminAIInsights.tsx`)**:
   - Rewrite the left sidebar list to include mock or real data for risk levels and active medications to make it look "intelligent".

3. **Implement the Graph Visualizer**:
   - Install `react-force-graph-2d` (or alternative).
   - Create a sub-component `<PatientGraph data={summary} />` inside `AdminAIInsights.tsx` that maps the `summary` data into `nodes` and `links`.
   - Render the interactive graph taking up the top 60% of the right panel.

4. **Style the AI Insights Panel**:
   - In the bottom 40% of the right panel, create a beautiful, scrollable text area that formats the generated `ai_insights` sentences nicely, perhaps with glowing text or a typewriter effect to emphasize the "AI profiling" aspect.

**Remember**: PharmAI is a premium hackathon demo. Everything must look stunning, sleek, and highly dynamic. Focus heavily on Tailwind styling, subtle glows, and smooth transitions.
