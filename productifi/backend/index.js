"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// In-memory store for session logs from the frontend or CV Python service
let sessionEvents = [];
let currentCVStatus = {
    face_present: true,
    eye_attention_score: 100,
    drowsiness_flag: false
};
// ==========================================
// FRONTEND API ROUTES (MOCK LOGGING)
// ==========================================
app.post('/api/log-distraction', (req, res) => {
    const { site, mode, timestamp } = req.body;
    const event = { type: 'distraction', site, mode, timestamp };
    sessionEvents.push(event);
    console.log(`[Event Logged] Distraction Attempt: ${site} in ${mode}`);
    res.json({ status: 'logged', event });
});
app.post('/api/end-session', (req, res) => {
    const { sessionData, finalScore } = req.body;
    console.log(`[Session Ended] ${sessionData.sessionName} | Score: ${finalScore}`);
    // In a real DB, save this session result
    res.json({ status: 'saved' });
});
// ==========================================
// COMPUTER VISION SERVICE HOOKS
// ==========================================
// The Python cv_service can POST updates to this endpoint over time
app.post('/api/cv/update', (req, res) => {
    const metrics = req.body;
    currentCVStatus = { ...currentCVStatus, ...metrics };
    res.json({ status: 'received' });
});
// The Frontend can GET this endpoint every second to update the dashboard
app.get('/api/cv/status', (req, res) => {
    res.json(currentCVStatus);
});
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Productifi Backend running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map