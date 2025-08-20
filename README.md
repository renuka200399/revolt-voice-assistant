Here’s an updated README with a clear “Changing Models” section and a few fixes to formatting.

# Rev Voice Assistant

A real-time, multilingual voice assistant for Revolt Motors using Google’s Gemini API.

## Features

- 🎙️ Seamless Voice Interaction — Natural, interruption-capable conversations
- 🌐 Multilingual Support — Speaks and understands 10+ Indian languages
- 🧠 Contextual Memory — Remembers conversation history for coherent interactions
- 💬 Human-Like Responses — Dynamic, personality-driven speech patterns
- ⚡ Low Latency — Quick response times for natural conversation flow
- 🔄 Voice Language Switching — Change languages mid-conversation using voice commands

## Technology Stack

- Frontend: HTML5, CSS3, JavaScript
- Backend: Node.js with Express
- WebSockets: For real-time communication
- Speech Recognition: Web Speech API
- Text-to-Speech: Web Speech API
- AI: Google Gemini API (server-to-server)

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Google Gemini API key (from AI Studio)

### Setup Instructions

1) Clone the repository:
```bash
git clone https://github.com/yourusername/rev-voice-assistant.git
cd rev-voice-assistant
```

2) Install dependencies:
```bash
npm install
```

3) Create a .env file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000

# Default model (kept as Gemini 2.0 by default)
DEFAULT_GEMINI_MODEL=gemini-2.0-flash-exp

# Optional: comma-separated backup models to use when 2.0 hits daily quota
FALLBACK_MODELS=gemini-1.5-flash,gemini-1.5-flash-8b
```

4) Start the development server:
```bash
npm run dev
# or
npm start
```

5) Open your browser and navigate to:
```
http://localhost:3000
```

## Changing Models

Default: Gemini 2.0 is used by default (gemini-2.0-flash-exp). You can switch models in three ways:

1) Configure the default model (server startup)
- Set the default via environment variables (recommended):
```env
DEFAULT_GEMINI_MODEL=gemini-2.0-flash-exp
```
- Restart the server after changes.

2) Configure fallback models (automatic on daily quota)
- Define fallbacks that the server will try when the current model hits daily free‑tier limits (429 with QuotaFailure):
```env
FALLBACK_MODELS=gemini-1.5-flash,gemini-1.5-flash-8b
```
- When 2.0 hits the daily cap, the server automatically switches to the next available model and notifies the client.

3) Switch at runtime from the client
- The UI includes a “Use backup model” button that sends a WebSocket message:
```json
{ "type": "switch_model", "model": "gemini-1.5-flash" }
```
- The server replies with:
```json
{ "type": "model_switched", "model": "gemini-1.5-flash" }
```
- All subsequent requests on that connection use the new model.

Common model IDs
- gemini-2.0-flash-exp (default in this project; experimental, tighter free-tier)
- gemini-1.5-flash (fast, cost‑effective, great fallback)
- gemini-1.5-flash-8b (smaller, cheaper)
- gemini-1.5-pro (more capable; higher cost and lower free‑tier)

Verify the switch
- The server logs “Using model: …” for each request.
- After clicking “Use backup model”, you should see model_switched and new logs with the backup model.

Quota note
- Free‑tier limits are per project, per model, per day. If 2.0 is capped, switching to 1.5 models allows continued testing.
- Docs: https://ai.google.dev/gemini-api/docs/rate-limits

## Usage Guide

### Voice Commands

- Start Conversation: Click the microphone button
- Interrupt Assistant: Start speaking while the assistant is talking (barge‑in)
- Change Language: Say “Switch to Hindi” / “हिंदी में बोलो” / “Hindi”
- End Conversation: Say “Goodbye” or click the mic again

### Language Support

- English (US/India)
- Hindi (हिंदी)
- Tamil (தமிழ்)
- Telugu (తెలుగు)
- Kannada (ಕನ್ನಡ)
- Malayalam (മലയാളം)
- Marathi (मराठी)
- Gujarati (ગુજરાતી)
- Bengali (বাংলা)
- Punjabi (ਪੰਜਾਬੀ)

## Customization

### Personality Settings

Update in the VoiceAssistant constructor:
```js
this.personalityTraits = {
  friendliness: 0.8,
  formality: 0.4,
  enthusiasm: 0.7,
  helpfulness: 0.9,
};
```

### Visual Theme

Edit CSS variables in style.css:
```css
:root {
  --primary-color: #ff5722;
  --secondary-color: #3a3a3a;
  --accent-color: #ff9800;
  --light-color: #fff4e6;
  --dark-color: #212121;
  --bg-color: #f8f8f8;
}
```

## Troubleshooting

- Speech recognition not working: Use Chrome/Edge; ensure mic permissions are granted.
- “Use backup model” doesn’t switch: Ensure your server implements per‑connection model switching and check logs for the active model.
- 429 Too Many Requests:
  - Daily quota (QuotaFailure): wait for reset, enable billing, or switch to a fallback model.
  - Burst throttling: respect RetryInfo.retryDelay or exponential backoff.
- Connectivity issues: Ensure the Node server is running; verify WebSocket URL and HTTPS/WSS config.

## Architecture

- Browser: Web Speech API for ASR/TTS
- Client: Sends text + language over WebSocket
- Server: Calls Gemini API and streams responses back
- Client: Speaks the response via Web Speech API

## Production Deployment

- Keep the default at gemini-2.0-flash-exp, and configure fallbacks for reliability
- Harden error handling and logging
- Add authentication if required
- Serve over HTTPS (required for mic access on most browsers)

## License

MIT

## Acknowledgements

- Google Gemini API
- Revolt Motors (inspiration)
- Web Speech API contributors

Made with ❤️ for Revolt Motors