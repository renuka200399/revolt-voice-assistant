class VoiceAssistant {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.selectedLanguage = 'en-US';
        this.isListening = false;
        this.isSpeaking = false;
        this.conversationActive = false;

        // Optional audio fields (not used for barge-in anymore)
        this.audioContext = null;
        this.audioAnalyser = null;
        this.audioDataArray = null;
        this.micStream = null;
        this.interruptionCheck = null;

        this.thinkingTimeout = null;
        this.idleTimeout = null;
        this.lastUserSpeakTime = Date.now();
        this.currentUserMessage = null;

        // Voice management
        this.availableVoices = [];
        this.selectedVoice = null;
        this.voicesReady = false;
        this.bargeInActive = false;

        this.personalityTraits = {
            friendliness: 0.8,
            formality: 0.4,
            enthusiasm: 0.7,
            helpfulness: 0.9
        };
        this.conversationContext = [];

        // DOM elements
        this.micButton = document.getElementById('mic-button');
        this.textInput = document.getElementById('text-input');
        this.sendButton = document.getElementById('send-button');
        this.chatMessages = document.getElementById('chat-messages');
        this.statusElement = document.getElementById('status');
        this.languageSelect = document.getElementById('language-select');
        this.assistantAvatar = document.getElementById('assistant-avatar');

        this.init();
    }

    init() {
        this.setupSpeechRecognition();
        this.connectWebSocket();
        this.setupEventListeners();
        this.setupAudioDetection(); // optional, not used for barge-in
        this.initVoices();

        // Welcome message with personality
        this.showWelcomeMessage();
    }

    showWelcomeMessage() {
        const welcomeMessages = [
            "Hi there! I'm Rev, your Revolt Motors assistant. Just click the mic and ask me anything!",
            "Hello! I'm ready to help with all your Revolt Motors questions. Click the mic to start chatting.",
            "Welcome! I'm Rev, your friendly Revolt Motors guide. Hit the mic button when you're ready to talk.",
            "Hey there! Ready to talk about Revolt Motors? Just click the mic button to start our conversation."
        ];

        const randomIndex = Math.floor(Math.random() * welcomeMessages.length);
        setTimeout(() => {
            this.showMessage('Rev', welcomeMessages[randomIndex], 'assistant');
            this.speakText(welcomeMessages[randomIndex]);
        }, 500);
    }

    // ---------- Voices & TTS helpers ----------
    initVoices() {
        if (!('speechSynthesis' in window)) return;

        const load = () => {
            try {
                this.availableVoices = this.synthesis.getVoices();
            } catch (e) {
                this.availableVoices = [];
            }
            this.voicesReady = this.availableVoices.length > 0;
            if (this.voicesReady) {
                this.selectedVoice = this.pickVoiceForLanguage(this.selectedLanguage);
            }
        };

        load();
        setTimeout(load, 250);
        try {
            this.synthesis.onvoiceschanged = () => load();
        } catch (e) {
            // ignore
        }
    }

    pickVoiceForLanguage(languageCode) {
        const voices = this.availableVoices || [];
        if (!voices.length) return null;

        const langLower = (languageCode || '').toLowerCase();
        const prefix = langLower.split('-')[0];

        // 1) exact match (e.g., ta-IN)
        let candidates = voices.filter(v => (v.lang || '').toLowerCase() === langLower);

        // 2) prefix match (e.g., ta-XX)
        if (!candidates.length) {
            candidates = voices.filter(v => (v.lang || '').toLowerCase().startsWith(prefix));
        }

        // 3) name hints
        const hints = {
            en: ['English'],
            hi: ['Hindi', 'हिंदी'],
            ta: ['Tamil', 'தமிழ்'],
            te: ['Telugu', 'తెలుగు'],
            kn: ['Kannada', 'ಕನ್ನಡ'],
            ml: ['Malayalam', 'മലയാളം'],
            mr: ['Marathi', 'मराठी'],
            gu: ['Gujarati', 'ગુજરાતી'],
            bn: ['Bengali', 'বাংলা'],
            pa: ['Punjabi', 'ਪੰਜਾਬੀ'],
        };
        if (!candidates.length && hints[prefix]) {
            candidates = voices.filter(v => {
                const hay = `${v.name} ${v.lang}`.toLowerCase();
                return hints[prefix].some(h => hay.includes(h.toLowerCase()));
            });
        }

        // Prefer a female voice if available
        let voice = candidates.find(v => /female/i.test(v.name)) || candidates[0];

        // 4) fallback to English
        if (!voice) {
            voice = voices.find(v => (v.lang || '').toLowerCase().startsWith('en')) || voices[0] || null;
        }
        return voice || null;
    }

    ensureRecognitionRunning() {
        if (!this.recognition) return;
        try {
            this.ensureCorrectLanguage();
            if (!this.isListening) {
                this.recognition.start();
            }
        } catch (e) {
            // InvalidStateError when already running - ignore
        }
    }

    bargeInStop() {
        if (!this.isSpeaking) return;
        this.synthesis.cancel();
        this.isSpeaking = false;

        // notify server we interrupted current answer
        this.sendMessage({ type: 'interrupt' });

        // Keep ASR running to capture user's speech
        this.ensureRecognitionRunning();

        this.updateStatus('interrupted', 'Listening to you...');
        this.assistantAvatar.className = 'assistant-avatar listening';
        this.bargeInActive = true;
    }

    // ---------- Speech Recognition ----------
    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            this.showMessage('System', 'Speech recognition is not supported in your browser. Please use Chrome or Edge.', 'system');
            return;
        }

        console.log(`Setting up speech recognition with language: ${this.selectedLanguage}`);

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
        this.recognition.lang = this.selectedLanguage;

        console.log(`Recognition language set to: ${this.recognition.lang}`);

        this.recognition.onstart = () => {
            console.log('Speech recognition started');
            this.isListening = true;
            this.updateStatus('listening', 'Listening...');
            this.assistantAvatar.className = 'assistant-avatar listening';
            this.micButton.classList.add('recording');

            if (this.idleTimeout) clearTimeout(this.idleTimeout);
        };

        // UPDATED onresult: enables barge-in using ASR only
        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // If user speaks while the assistant is speaking, stop TTS immediately
            if (this.isSpeaking && this.bargeInActive && (interimTranscript.trim().length > 1 || finalTranscript.trim().length > 0)) {
                console.log('Barge-in detected via ASR');
                this.bargeInStop();
                if (!this.currentUserMessage) {
                    this.currentUserMessage = this.showMessage('You', interimTranscript || finalTranscript, 'user');
                } else {
                    this.currentUserMessage.textContent = interimTranscript || finalTranscript;
                }
                return; // wait for more speech/finalization
            }

            // Show interim when not speaking
            if (interimTranscript && !this.isSpeaking) {
                this.lastUserSpeakTime = Date.now();
                if (!this.currentUserMessage) {
                    this.currentUserMessage = this.showMessage('You', interimTranscript, 'user');
                    this.currentUserMessage.classList.add('listening-animation');
                } else {
                    this.currentUserMessage.textContent = interimTranscript;
                }
            }

            // Final result
            if (finalTranscript) {
                console.log('Final transcript:', finalTranscript);
                this.lastUserSpeakTime = Date.now();

                if (!this.currentUserMessage) {
                    this.currentUserMessage = this.showMessage('You', finalTranscript, 'user');
                } else {
                    this.currentUserMessage.textContent = finalTranscript;
                    this.currentUserMessage.classList.remove('listening-animation');
                }

                this.processUserInput(finalTranscript);
                this.currentUserMessage = null;
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);

            if (event.error !== 'no-speech') {
                let errorMessage = 'I had trouble hearing you: ';
                switch (event.error) {
                    case 'audio-capture':
                        errorMessage += 'I can\'t access your microphone. Please check your microphone settings.';
                        break;
                    case 'not-allowed':
                        errorMessage += 'I need permission to use your microphone. Please enable it in your browser settings.';
                        break;
                    default:
                        errorMessage += 'There was a technical issue. Please try again.';
                }

                this.showMessage('Rev', errorMessage, 'assistant');
                this.speakText(errorMessage);
            } else if (this.conversationActive && Date.now() - this.lastUserSpeakTime > 10000) {
                this.offerHelp();
            }

            this.isListening = false;
            this.micButton.classList.remove('recording');
            this.assistantAvatar.className = 'assistant-avatar';
        };

        this.recognition.onend = () => {
            console.log('Speech recognition ended, conversation active:', this.conversationActive);
            this.isListening = false;
            this.micButton.classList.remove('recording');

            if (this.currentUserMessage) {
                this.currentUserMessage.classList.remove('listening-animation');
                this.currentUserMessage = null;
            }

            if (this.conversationActive && !this.isSpeaking) {
                console.log('Automatically restarting speech recognition...');
                setTimeout(() => this.startListening(), 300);
                this.setIdleTimeout();
            } else {
                this.updateStatus('connected', 'Ready');
                this.assistantAvatar.className = 'assistant-avatar';
            }
        };
    }

    setIdleTimeout() {
        if (this.idleTimeout) clearTimeout(this.idleTimeout);
        this.idleTimeout = setTimeout(() => {
            if (this.conversationActive && !this.isSpeaking &&
                Date.now() - this.lastUserSpeakTime > 30000) {
                this.offerHelp();
            }
        }, 30000);
    }

    offerHelp() {
        const promptMessages = [
            "Is there anything else you'd like to know about Revolt Motors?",
            "I'm still here if you have more questions. Just speak up!",
            "Feel free to ask me anything else about Revolt's electric motorcycles.",
            "Is there something specific about Revolt Motors you'd like to learn?"
        ];

        const randomIndex = Math.floor(Math.random() * promptMessages.length);
        this.showMessage('Rev', promptMessages[randomIndex], 'assistant');
        this.speakText(promptMessages[randomIndex]);
    }

    setupAudioDetection() {
        // Optional: not used for barge-in anymore (ASR handles it)
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
        } catch (e) {
            console.log('Web Audio API is not supported in this browser');
        }
    }

    // Legacy functions kept but not used (do not mic-open twice)
    async startListeningForInterruptions() {}
    startInterruptionCheck() {}
    stopMicrophoneListening() {}

    handleInterruption() {
        if (!this.isSpeaking) return;
        this.bargeInStop();
        this.showVisualFeedback('interrupt');
    }

    showVisualFeedback(type) {
        const feedback = document.createElement('div');
        feedback.className = `visual-feedback ${type}`;

        switch (type) {
            case 'interrupt':
                feedback.innerHTML = '<i class="fas fa-hand-paper"></i>';
                feedback.setAttribute('title', 'I heard you! Go ahead...');
                break;
            case 'thinking':
                feedback.innerHTML = '<i class="fas fa-brain"></i>';
                feedback.setAttribute('title', 'Thinking...');
                break;
            case 'language-change':
                feedback.innerHTML = '<i class="fas fa-language"></i>';
                feedback.setAttribute('title', 'Changing language...');
                break;
        }

        document.body.appendChild(feedback);

        setTimeout(() => {
            feedback.classList.add('fade-out');
            setTimeout(() => feedback.remove(), 500);
        }, 1500);
    }

    processUserInput(text) {
        this.updateConversationContext(text);

        if (this.detectLanguageChangeRequest(text)) {
            this.conversationActive = true;
            setTimeout(() => this.startListening(), 1000);
            return;
        }

        this.showThinkingIndicator();
        this.sendTextToServer(text);
        this.conversationActive = true;
    }

    updateConversationContext(text) {
        this.conversationContext.push({
            role: 'user',
            text: text,
            timestamp: Date.now()
        });

        if (this.conversationContext.length > 10) {
            this.conversationContext.shift();
        }
    }

    showThinkingIndicator() {
        if (this.thinkingTimeout) clearTimeout(this.thinkingTimeout);
        this.thinkingTimeout = setTimeout(() => {
            this.showVisualFeedback('thinking');
            this.assistantAvatar.classList.add('thinking');
        }, 500);
    }

    ensureCorrectLanguage() {
        if (this.recognition && this.recognition.lang !== this.selectedLanguage) {
            console.log(`Fixing language mismatch: ${this.recognition.lang} → ${this.selectedLanguage}`);
            this.recognition.lang = this.selectedLanguage;
        }
    }

    startListening() {
        this.ensureCorrectLanguage();

        if (this.recognition && !this.isListening) {
            try {
                this.recognition.start();
                this.assistantAvatar.className = 'assistant-avatar listening';
                console.log('Started listening for user input');
            } catch (error) {
                console.error('Error starting recognition:', error);
                if (error.name === 'InvalidStateError') {
                    console.log('Recognition was already running, resetting...');
                    this.recognition = null;
                    this.setupSpeechRecognition();
                    setTimeout(() => this.startListening(), 100);
                }
            }
        }
    }

    connectWebSocket() {
        this.updateStatus('connecting', 'Connecting...');

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.updateStatus('connected', 'Connected');
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus('error', 'Connection error');
            this.showMessage('Rev', 'I\'m having trouble connecting. Please check your internet connection and try again.', 'assistant');
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.isConnected = false;
            this.updateStatus('error', 'Disconnected');

            setTimeout(() => this.connectWebSocket(), 3000);
        };
    }

    setupEventListeners() {
        // Microphone button toggles listening mode
        this.micButton.addEventListener('click', () => {
            if (this.isListening && !this.isSpeaking) {
                this.recognition.stop();
                this.isListening = false;
                this.micButton.classList.remove('recording');
                this.assistantAvatar.className = 'assistant-avatar';
            } else {
                if (this.isSpeaking) {
                    // If speaking, interrupt
                    this.handleInterruption();
                } else {
                    this.startListening();
                    this.conversationActive = true;
                }
            }
        });

        // Text input
        this.sendButton.addEventListener('click', () => this.sendTextMessage());
        this.textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendTextMessage();
            }
        });

        // Language selector
        this.languageSelect.addEventListener('change', (e) => {
            const newLanguage = e.target.value;
            console.log(`Language changed via dropdown to: ${newLanguage}`);
            this.changeLanguage(newLanguage);
        });

        // Keyboard barge-in (spacebar)
        document.addEventListener('keydown', (e) => {
            if (e.key === ' ' && this.isSpeaking) {
                e.preventDefault();
                this.handleInterruption();
            }
        });

        // Reset button
        const resetButton = document.getElementById('reset-button');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                this.chatMessages.innerHTML = '';

                const welcomeSection = document.getElementById('chat-welcome');
                if (welcomeSection) {
                    welcomeSection.style.display = 'block';
                } else {
                    this.showWelcomeMessage();
                }

                this.assistantAvatar.className = 'assistant-avatar';

                this.synthesis.cancel();
                if (this.isListening) {
                    this.recognition.stop();
                }

                this.conversationActive = false;
                this.isSpeaking = false;
                this.conversationContext = [];

                this.sendMessage({ type: 'reset' });
            });
        }

        // Force English button
        const forceEnglishBtn = document.getElementById('force-english');
        if (forceEnglishBtn) {
            forceEnglishBtn.addEventListener('click', () => {
                this.changeLanguage('en-US');
            });
        }

        // Suggestion chips
        document.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const text = chip.textContent;
                this.textInput.value = text;
                this.sendTextMessage();
            });
        });
    }

    detectLanguageChangeRequest(text) {
        const lowerText = text.toLowerCase().trim();
        console.log("Checking for language change in:", lowerText);

        const englishKeywords = ["english", "ingles", "angrezi", "अंग्रेज़ी", "अंग्रेजी", "انگریزی", "ஆங்கிலம்", "ఇంగ్లీష్", "ಇಂಗ್ಲಿಷ್", "ഇംഗ്ലീഷ്", "इंग्लिश"];

        for (const keyword of englishKeywords) {
            if (lowerText.includes(keyword)) {
                console.log(`English keyword detected: ${keyword}`);
                this.changeLanguage('en-US');
                return true;
            }
        }

        const languageSwitchCommands = {
            'hi': [
                'hindi', 'speak in hindi', 'switch to hindi', 'change to hindi',
                'use hindi', 'talk in hindi', 'hindi please', 'in hindi',
                'हिंदी', 'हिंदी में बोलो', 'हिंदी में बात करो', 'हिंदी में'
            ],
            'ta': [
                'tamil', 'speak in tamil', 'switch to tamil', 'change to tamil',
                'use tamil', 'talk in tamil', 'tamil please', 'in tamil',
                'தமிழ்', 'தமிழில் பேசு', 'தமிழுக்கு மாறு', 'தமிழில்'
            ],
            'te': [
                'telugu', 'speak in telugu', 'switch to telugu', 'change to telugu',
                'use telugu', 'talk in telugu', 'telugu please', 'in telugu',
                'తెలుగు', 'తెలుగులో మాట్లాడు', 'తెలుగుకి మారు', 'తెలుగులో'
            ],
            'kn': [
                'kannada', 'speak in kannada', 'switch to kannada', 'change to kannada',
                'use kannada', 'talk in kannada', 'kannada please', 'in kannada',
                'ಕನ್ನಡ', 'ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡು', 'ಕನ್ನಡಕ್ಕೆ ಬದಲಿಸಿ', 'ಕನ್ನಡದಲ್ಲಿ'
            ],
            'ml': [
                'malayalam', 'speak in malayalam', 'switch to malayalam', 'change to malayalam',
                'use malayalam', 'talk in malayalam', 'malayalam please', 'in malayalam',
                'മലയാളം', 'മലയാളത്തിൽ സംസാരിക്കുക', 'മലയാളത്തിലേക്ക് മാറുക', 'മലയാളത്തിൽ'
            ]
        };

        const languageCodes = {
            'hi': 'hi-IN',
            'ta': 'ta-IN',
            'te': 'te-IN',
            'kn': 'kn-IN',
            'ml': 'ml-IN',
            'mr': 'mr-IN',
            'gu': 'gu-IN',
            'bn': 'bn-IN',
            'pa': 'pa-IN'
        };

        for (const [langCode, commands] of Object.entries(languageSwitchCommands)) {
            if (commands.some(cmd => lowerText.includes(cmd))) {
                const fullLangCode = languageCodes[langCode];
                console.log(`Language change detected: Switching to ${langCode}`);
                this.changeLanguage(fullLangCode);
                return true;
            }
        }

        return false;
    }

    changeLanguage(languageCode) {
        console.log(`Changing language to: ${languageCode}`);

        const previousLanguage = this.selectedLanguage;
        this.selectedLanguage = languageCode;
        if (this.languageSelect) this.languageSelect.value = languageCode;

        this.showVisualFeedback('language-change');

        try {
            if (this.recognition && this.isListening) {
                this.recognition.stop();
                this.isListening = false;
            }
            delete this.recognition;
        } catch (e) {
            console.error('Error cleaning up recognition:', e);
        }

        setTimeout(() => {
            this.setupSpeechRecognition();

            // Pick best voice for the new language
            this.selectedVoice = this.pickVoiceForLanguage(this.selectedLanguage);

            if (this.conversationActive) {
                setTimeout(() => this.startListening(), 300);
            }
        }, 200);

        const languageNames = {
            'en-US': 'English',
            'en-IN': 'English (India)',
            'hi-IN': 'हिंदी (Hindi)',
            'ta-IN': 'தமிழ் (Tamil)',
            'te-IN': 'తెలుగు (Telugu)',
            'kn-IN': 'ಕನ್ನಡ (Kannada)',
            'ml-IN': 'മലയാളം (Malayalam)',
            'mr-IN': 'मराठी (Marathi)',
            'gu-IN': 'ગુજરાતી (Gujarati)',
            'bn-IN': 'বাংলা (Bengali)',
            'pa-IN': 'ਪੰਜਾਬੀ (Punjabi)'
        };
        const languageChangeAnnouncements = {
            'en-US': "Now I'll speak in English. How can I help you today?",
            'en-IN': "Now I'll speak in English (India). How can I help you today?",
            'hi-IN': "अब मैं हिंदी में बात करूंगा। मैं आपकी कैसे मदद कर सकता हूं?",
            'ta-IN': "இப்போது நான் தமிழில் பேசுவேன். நான் உங்களுக்கு எப்படி உதவ முடியும்?",
            'te-IN': "ఇప్పుడు నేను తెలుగులో మాట్లాడతాను. నేను మీకు ఎలా సహాయం చేయగలను?",
            'kn-IN': "ಈಗ ನಾನು ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡುತ್ತೇನೆ. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?",
            'ml-IN': "ഇപ്പോൾ ഞാൻ മലയാളത്തിൽ സംസാരിക്കും. എനിക്ക് നിങ്ങളെ എങ്ങനെ സഹായിക്കാം?",
            'mr-IN': "आता मी मराठीत बोलेन. मी तुमची कशी मदत करू शकतो?",
            'gu-IN': "હવે હું ગુજરાતીમાં વાત કરીશ. હું તમને કેવી રીતે મદદ કરી શકું?",
            'bn-IN': "এখন আমি বাংলায় কথা বলব। আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
            'pa-IN': "ਹੁਣ ਮੈਂ ਪੰਜਾਬੀ ਵਿੱਚ ਬੋਲਾਂਗਾ। ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?"
        };

        const prevName = languageNames[previousLanguage] || previousLanguage;
        const newName = languageNames[languageCode] || languageCode;
        this.showMessage('System', `Changed from ${prevName} to ${newName}`, 'system');

        const announcement = languageChangeAnnouncements[languageCode] ||
                             `Now speaking in ${newName}. How can I help you?`;

        this.synthesis.cancel();
        setTimeout(() => this.speakText(announcement), 200);

        this.conversationActive = true;
    }

    sendTextMessage() {
        const text = this.textInput.value.trim();
        if (!text || !this.isConnected) return;

        this.showMessage('You', text, 'user');
        this.processUserInput(text);

        this.textInput.value = '';
        this.conversationActive = true;
    }

    sendTextToServer(text) {
        if (!text || !this.isConnected) return;

        const contextToSend = this.conversationContext.slice(-4);

        this.sendMessage({
            type: 'text',
            text: text,
            language: this.selectedLanguage,
            context: contextToSend
        });

        this.updateStatus('processing', 'Thinking...');
    }

    sendMessage(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.error('WebSocket not connected');
            this.updateStatus('error', 'Connection error. Reconnecting...');
            this.connectWebSocket();
            this.showMessage('Rev', "I'm having trouble connecting right now. Let me try again...", 'assistant');
        }
    }

    handleWebSocketMessage(data) {
        if (this.thinkingTimeout) {
            clearTimeout(this.thinkingTimeout);
            this.thinkingTimeout = null;
        }
        this.assistantAvatar.classList.remove('thinking');

        switch (data.type) {
            case 'connection_established':
                console.log('Connection established:', data.connectionId);
                break;

            case 'processing_start':
                this.updateStatus('processing', 'Thinking...');
                this.assistantAvatar.className = 'assistant-avatar thinking';
                break;

            case 'processing_end':
                this.updateStatus('connected', 'Ready');
                this.assistantAvatar.className = 'assistant-avatar';
                break;

            case 'response':
                this.conversationContext.push({
                    role: 'assistant',
                    text: data.text,
                    timestamp: Date.now()
                });

                const humanizedText = this.humanizeResponse(data.text);

                this.showTypingResponse('Rev', humanizedText, 'assistant');

                this.assistantAvatar.className = 'assistant-avatar speaking';

                // Speak the response in the selected language (ASR remains active for barge-in)
                this.speakText(humanizedText);
                break;

            case 'error':
                const friendlyError = this.makeErrorFriendly(data.message);
                this.showMessage('Rev', friendlyError, 'assistant');
                this.speakText(friendlyError);
                break;

            case 'interrupted':
                this.updateStatus('connected', 'I heard you!');
                this.synthesis.cancel();
                this.isSpeaking = false;
                this.assistantAvatar.className = 'assistant-avatar';

                setTimeout(() => this.startListening(), 300);
                break;
        }
    }

    humanizeResponse(text) {
        if (this.personalityTraits.friendliness > 0.7) {
            const fillers = ["Actually, ", "You know what, ", "I'd say ", "Well, ", "So, "];
            if (Math.random() < 0.3) {
                const randomFiller = fillers[Math.floor(Math.random() * fillers.length)];
                text = randomFiller + text.charAt(0).toLowerCase() + text.slice(1);
            }
        }

        if (this.personalityTraits.formality < 0.5) {
            text = text.replace("cannot", "can't")
                       .replace("will not", "won't")
                       .replace("do not", "don't");
        }

        if (this.personalityTraits.enthusiasm > 0.6 && !text.includes('!') && Math.random() < 0.3) {
            if (text.endsWith(".")) {
                text = text.slice(0, -1) + "!";
            }
        }

        return text;
    }

    makeErrorFriendly(errorMessage) {
        if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
            return "I'm taking a bit longer than usual to think. Let me try again. Could you repeat your question?";
        } else if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
            return "I've been talking quite a lot! Give me a moment to catch my breath, then we can continue.";
        } else if (errorMessage.includes('connectivity') || errorMessage.includes('network')) {
            return "I'm having trouble connecting to my brain. Let's give it another try in a moment.";
        } else {
            return "I hit a small snag. Let's try that again, maybe phrase your question a bit differently?";
        }
    }

    showTypingResponse(sender, text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type} typing`;
        messageDiv.textContent = '';
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

        let i = 0;
        const speed = 10;

        const typeWriter = () => {
            if (i < text.length) {
                messageDiv.textContent += text.charAt(i);
                i++;
                this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
                setTimeout(typeWriter, speed);
            } else {
                messageDiv.classList.remove('typing');
            }
        };

        setTimeout(typeWriter, 200);
        return messageDiv;
    }

    showMessage(sender, text, type) {
        const welcomeSection = document.getElementById('chat-welcome');
        if (welcomeSection && welcomeSection.style.display !== 'none') {
            welcomeSection.style.display = 'none';
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;

        if (type === 'system') {
            messageDiv.style.backgroundColor = '#f1f1f1';
            messageDiv.style.color = '#666';
            messageDiv.style.fontSize = '0.9em';
            messageDiv.style.padding = '8px 12px';
            messageDiv.style.margin = '5px auto';
            messageDiv.style.textAlign = 'center';
            messageDiv.style.fontStyle = 'italic';
            messageDiv.style.maxWidth = '90%';
        }

        messageDiv.textContent = text;

        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

        return messageDiv;
    }

    updateStatus(state, text) {
        this.statusElement.className = `status ${state}`;
        this.statusElement.querySelector('.status-text').textContent = text;
    }

    // UPDATED speakText: picks proper voice and allows barge-in
    async speakText(text) {
        if (!('speechSynthesis' in window)) return;

        // Cancel any ongoing speech
        this.synthesis.cancel();

        // Wait for voices if needed
        if (!this.voicesReady) {
            for (let i = 0; i < 10 && !this.voicesReady; i++) {
                await new Promise(r => setTimeout(r, 100));
                try {
                    this.availableVoices = this.synthesis.getVoices();
                    this.voicesReady = this.availableVoices.length > 0;
                } catch (e) {
                    this.voicesReady = false;
                }
            }
        }
        this.selectedVoice = this.pickVoiceForLanguage(this.selectedLanguage);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = this.selectedLanguage;
        if (this.selectedVoice) utterance.voice = this.selectedVoice;

        utterance.rate = 1.0 + (this.personalityTraits.enthusiasm * 0.2 - 0.1);
        utterance.pitch = 1.0 + (this.personalityTraits.friendliness * 0.2 - 0.1);
        utterance.volume = 1.0;

        this.isSpeaking = true;
        this.updateStatus('speaking', 'Speaking...');

        // Keep ASR running to catch interruptions while speaking
        this.ensureRecognitionRunning();

        utterance.onstart = () => {
            console.log('Speech started, ASR is armed for barge-in');
            this.bargeInActive = true;
        };

        utterance.onend = () => {
            this.isSpeaking = false;
            this.bargeInActive = false;

            if (this.conversationActive) {
                setTimeout(() => this.startListening(), 300);
            } else {
                this.updateStatus('connected', 'Ready');
                this.assistantAvatar.className = 'assistant-avatar';
            }
        };

        utterance.onerror = (e) => {
            console.warn('TTS error:', e.error);
            this.isSpeaking = false;
            this.bargeInActive = false;
            this.updateStatus('connected', 'Ready');
        };

        this.synthesis.speak(utterance);
    }
}

// Initialize voice list when available (handled in class via initVoices)

// Initialize the assistant when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Add emergency English button
    const forceEnglishBtn = document.createElement('button');
    forceEnglishBtn.id = 'force-english';
    forceEnglishBtn.innerHTML = 'Switch to English';
    forceEnglishBtn.style.position = 'fixed';
    forceEnglishBtn.style.top = '10px';
    forceEnglishBtn.style.right = '10px';
    forceEnglishBtn.style.zIndex = '1000';
    forceEnglishBtn.style.padding = '10px';
    forceEnglishBtn.style.background = '#ff5722';
    forceEnglishBtn.style.color = 'white';
    forceEnglishBtn.style.border = 'none';
    forceEnglishBtn.style.borderRadius = '5px';
    forceEnglishBtn.style.cursor = 'pointer';
    document.body.appendChild(forceEnglishBtn);

    // Create and add CSS for animations and visual feedback
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        .visual-feedback {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 87, 34, 0.9);
            color: white;
            padding: 10px 20px;
            border-radius: 30px;
            font-size: 16px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 1000;
            animation: feedback-appear 0.3s ease-out;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .visual-feedback.fade-out {
            opacity: 0;
            transition: opacity 0.5s ease;
        }

        .visual-feedback i {
            font-size: 20px;
        }

        .visual-feedback.interrupt {
            background: rgba(76, 175, 80, 0.9);
        }

        .visual-feedback.thinking {
            background: rgba(33, 150, 243, 0.9);
        }

        .visual-feedback.language-change {
            background: rgba(156, 39, 176, 0.9);
        }

        @keyframes feedback-appear {
            from {
                transform: translate(-50%, 20px);
                opacity: 0;
            }
            to {
                transform: translate(-50%, 0);
                opacity: 1;
            }
        }

        .message.typing::after {
            content: '|';
            animation: blink 1s infinite;
        }

        .message.listening-animation {
            position: relative;
        }

        .message.listening-animation::after {
            content: '';
            position: absolute;
            bottom: -5px;
            left: 0;
            width: 100%;
            height: 2px;
            background: linear-gradient(to right, #ff5722, #ff9800);
            animation: listening-pulse 1.5s infinite;
        }

        @keyframes listening-pulse {
            0%, 100% {
                opacity: 0.3;
            }
            50% {
                opacity: 1;
            }
        }

        @keyframes blink {
            0%, 100% {
                opacity: 1;
            }
            50% {
                opacity: 0;
            }
        }

        .assistant-avatar.thinking {
            position: relative;
        }

        .assistant-avatar.thinking::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border-radius: 50%;
            border: 2px solid #2196F3;
            animation: thinking-ring 1.5s infinite;
        }

        @keyframes thinking-ring {
            0% {
                transform: scale(0.8);
                opacity: 0.8;
            }
            50% {
                transform: scale(1.1);
                opacity: 0.3;
            }
            100% {
                transform: scale(0.8);
                opacity: 0.8;
            }
        }
    `;
    document.head.appendChild(styleElement);

    // Initialize font awesome for icons if not already loaded
    if (!document.querySelector('link[href*="font-awesome"]')) {
        const fontAwesome = document.createElement('link');
        fontAwesome.rel = 'stylesheet';
        fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        document.head.appendChild(fontAwesome);
    }

    // Initialize the voice assistant
    window.voiceAssistant = new (class extends VoiceAssistant {})();
});