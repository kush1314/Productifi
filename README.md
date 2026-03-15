# Productifi - AI-Powered Productivity Companion

Productifi is a cutting-edge web application that revolutionizes personal productivity through advanced AI-driven focus tracking. Using computer vision, audio analysis, and machine learning, it helps users maintain deep focus during work sessions while providing intelligent coaching and distraction prevention.

## 🚀 Features

### Core Functionality
- **Real-time Attention Tracking**: Advanced computer vision monitors facial expressions, head pose, and eye gaze to assess focus levels
- **Emotion Recognition**: Detects emotional states to provide contextual productivity insights
- **Distraction Prevention**: Alerts users when conversations or looking away are detected
- **Gemini AI Coaching**: Live personalized nudges powered by Google's Gemini Vision API
- **Audio Monitoring**: Web Audio API analyzes speech patterns for sustained conversation detection

### Smart Customization
- **Flexible Session Types**: Deep Study, General Work, Creative Flow, Coding Sprint, Reading/Review, Custom
- **Focus Rules**: Strict mode, Balanced mode, Monitor only
- **Sensitivity Controls**: Adjustable detection thresholds for different work environments
- **Theme Customization**: Light/Dark themes with custom color schemes
- **Notification Preferences**: Browser notifications, sound alerts, or both

### Professional Dashboard
- **Live Session Metrics**: Real-time attention scores, distraction counters, and progress tracking
- **Comprehensive Analytics**: Session reports with focus consistency, distraction resistance, and productivity metrics
- **Streak Tracking**: Build and maintain productivity streaks with goal setting
- **Activity Feed**: Detailed timeline of session events and coaching messages

## 🛠️ Technology Stack

- **Frontend**: React 19, TypeScript, TailwindCSS, Framer Motion
- **AI/ML**: TensorFlow.js, MediaPipe, Google Generative AI (Gemini)
- **Computer Vision**: OpenCV, Face Detection, Emotion Recognition
- **Audio Processing**: Web Audio API, Real-time Frequency Analysis
- **Backend**: Python Flask, SocketIO for real-time communication
- **State Management**: Zustand for efficient React state handling

## 📋 Prerequisites

- Node.js 18+ and npm
- Python 3.8+ with pip
- Webcam and microphone access
- Modern web browser with WebRTC support

## 🚀 Quick Start

### Frontend Setup
```bash
cd productifi/frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser

### Backend Setup (Optional - for enhanced CV processing)
```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run backend server
python app.py
```

## 🎯 Usage

1. **Customize Your Session**: Choose session type, duration, and focus preferences
2. **Grant Permissions**: Allow camera and microphone access for optimal tracking
3. **Start Focusing**: Begin your session with real-time monitoring and coaching
4. **Review Progress**: Analyze your session data and build productivity streaks

## 🔧 Configuration

### Environment Variables
Create a `.env` file in the frontend directory:
```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### Model Files
Place the following files in the repository root:
- `haarcascade_frontalface_default.xml` - OpenCV face cascade
- `fer.json` and `fer.h5` - Emotion recognition model (optional)

## 🏆 Key Differentiators

- **Intelligent Coaching**: Unlike basic timers, Productifi provides AI-powered insights and personalized nudges
- **Multi-Modal Analysis**: Combines visual, audio, and behavioral data for comprehensive focus assessment
- **Privacy-First**: All processing happens locally in the browser; no data sent to external servers
- **Startup-Quality UX**: Polished interface with smooth animations and professional design
- **Extensible Architecture**: Modular design allows for easy addition of new AI features

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines and code of conduct.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Google MediaPipe for computer vision capabilities
- TensorFlow.js for browser-based ML
- Google's Gemini AI for intelligent coaching
- The open-source community for amazing tools and libraries

---

**Productifi** - Transform your productivity with AI-powered focus tracking. Stay focused, achieve more. 🚀
