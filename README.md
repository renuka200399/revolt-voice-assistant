# Rev Voice Assistant

A real-time, multilingual voice assistant for Revolt Motors using Google's Gemini Live API.

## Features

- 🎙️ **Seamless Voice Interaction** - Natural, interruption-capable conversations
- 🌐 **Multilingual Support** - Speaks and understands 10+ Indian languages
- 🧠 **Contextual Memory** - Remembers conversation history for coherent interactions
- 💬 **Human-Like Responses** - Dynamic, personality-driven speech patterns
- ⚡ **Low Latency** - Quick response times for natural conversation flow
- 🔄 **Voice Language Switching** - Change languages mid-conversation using voice commands
- 
## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript
- **Backend**: Node.js with Express
- **WebSockets**: For real-time communication
- **Speech Recognition**: Web Speech API
- **Text-to-Speech**: Web Speech API
- **AI**: Google Gemini Live API (via server-to-server architecture)

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Google Gemini API key (from [AI Studio](https://aistudio.google.com))

### Setup Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/rev-voice-assistant.git
   cd rev-voice-assistant
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=3000
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Usage Guide

### Voice Commands

- **Start Conversation**: Click the microphone button once
- **Interrupt Assistant**: Just start speaking while the assistant is talking
- **Change Language**: Say "Switch to Hindi" or "हिंदी में बोलो" or simply "Hindi"
- **End Conversation**: Say "Goodbye" or click the microphone button again

### Language Support

The assistant supports the following languages:
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

Modify the `personalityTraits` object in the `VoiceAssistant` constructor to change the assistant's personality:

```javascript
this.personalityTraits = {
    friendliness: 0.8,  // 0.0 (formal) to 1.0 (very friendly)
    formality: 0.4,     // 0.0 (casual) to 1.0 (very formal)
    enthusiasm: 0.7,    // 0.0 (calm) to 1.0 (very enthusiastic)
    helpfulness: 0.9    // 0.0 (concise) to 1.0 (very detailed)
};
```

### Visual Theme

The assistant uses a Revolt Motors-inspired orange and dark theme by default. To change the color scheme, update the CSS variables at the top of the `style.css` file:

```css
:root {
    --primary-color: #FF5722;     /* Main accent color */
    --secondary-color: #3A3A3A;   /* Secondary color */
    --accent-color: #FF9800;      /* Highlight color */
    --light-color: #FFF4E6;       /* Background light color */
    --dark-color: #212121;        /* Text dark color */
    --bg-color: #F8F8F8;          /* Page background */
}
```

## Troubleshooting

### Speech Recognition Issues

- **Browser Compatibility**: Ensure you're using Chrome, Edge, or Safari for best compatibility
- **Microphone Access**: Make sure you've granted microphone permissions
- **Language Support**: Some browsers have limited language support for speech recognition

### Language Switching Problems

- **Can't Switch Back to English**: Use the "Force English" button in the top-right corner
- **Language Not Detected**: Try saying the language name clearly, or use the language dropdown

### Connection Issues

- **Server Connection**: Ensure the Node.js server is running
- **API Key**: Verify your Gemini API key is valid and has sufficient quota
- **CORS Issues**: If hosting on a different domain, update CORS settings in the server code

## Architecture

The application follows a server-to-server architecture:

1. **Browser**: Captures audio via Web Speech API
2. **Client**: Sends text and language info to server via WebSockets
3. **Server**: Communicates with Gemini API to generate responses
4. **Client**: Receives response text and speaks it via Web Speech API

## Production Deployment

For production use:

1. Update the Gemini model to `gemini-2.5-flash-preview-native-audio-dialog` in `geminiService.js`
2. Set up proper error handling and logging
3. Implement user authentication if needed
4. Deploy behind HTTPS for secure microphone access

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Google for the Gemini API
- Revolt Motors for inspiration
- Web Speech API contributors

---

Made with ❤️ for Revolt Motors