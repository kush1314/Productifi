# Productifi MVP

Productifi is a productivity intelligence web app designed to act as a venture-backed startup demo. It tracks focus, blocks distractions, and provides AI-powered session reports.

## Project Structure

This monorepo contains three parts:
1. `frontend/`: The Vite + React + Tailwind + Framer Motion app.
2. `backend/`: A Node.js/Express server tracking session data.
3. `cv_service/`: The Python microservice for computer vision.

## How to Demo Productifi Tomorrow

To impress judges/investors:
1. **Frontend**: The frontend is fully mock-equipped. You do not strictly *need* the backend or Python service running to click through the beautiful demo flow.
2. Run the frontend:
   ```bash
   cd frontend
   npm run dev
   ```
3. Open `http://localhost:5173`.
4. The flow goes: Landing `->` Customization (`/customize`) `->` Active Session (`/session`) `->` AI Report (`/report`).

## Plugging in Your Own Code

### 1. Integrating OpenCV

I left a clean hook for your OpenCV code.

**Where to put it:**
Go to `cv_service/opencv_bridge.py`. Replace the logic inside `analyze_frame(frame)`.
Currently, the frontend uses `frontend/src/services/cvService.ts` which simulates a data stream.
To use your real Python code:
1. Have `main.py` in `cv_service` post its metrics to the Node backend (`http://localhost:5001/api/cv/update`).
2. Update `frontend/src/services/cvService.ts` to fetch from `http://localhost:5001/api/cv/status` instead of randomizing data.

### 2. Adding OpenAI Key for real AI Reports

Right now, the AI report provides high-quality deterministic responses. To use real generative AI:

1. Create a `.env` file inside `frontend/`:
   ```bash
   VITE_OPENAI_API_KEY=your_sk_key_here
   ```
2. The logic in `frontend/src/services/aiReportService.ts` will automatically detect the key and use the API to generate the custom summary text.

### 3. Backend (Optional for MVP Demo)

To run the event logging backend:
```bash
cd backend
npx tsx index.ts
```

Good luck with your demo!
