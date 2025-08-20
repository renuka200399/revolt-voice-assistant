const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = null;
    this.chat = null;
    this.currentLanguage = 'en-US';
  }

  async initialize(language = 'en-US') {
    try {
      this.currentLanguage = language;
      
      // For development, use the flash model to avoid rate limits
      // For production, switch to: gemini-2.5-flash-preview-native-audio-dialog
      this.model = this.genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash-exp",
        systemInstruction: this.getSystemInstruction(language)
      });
      
      this.chat = this.model.startChat({
        history: [],
        generationConfig: {
          maxOutputTokens: 150,
          temperature: 0.7,
        },
      });
      
      console.log(`Gemini service initialized with language: ${language}`);
    } catch (error) {
      console.error('Failed to initialize Gemini service:', error);
      throw error;
    }
  }

  getSystemInstruction(language) {
    const baseInstruction = `You are Rev, the voice assistant for Revolt Motors. 
    You are knowledgeable about Revolt Motors' electric motorcycles, including models like RV400, RV1, and RV1+. 
    Only discuss topics related to Revolt Motors, their products, features, specifications, pricing, and services. 
    If asked about unrelated topics, politely redirect the conversation back to Revolt Motors.
    Keep responses concise and conversational.`;
    
    // Add language-specific instructions
    const languageCode = language.split('-')[0];
    
    switch (languageCode) {
      case 'hi':
        return `${baseInstruction} You must respond in Hindi (हिंदी) language only.`;
      case 'ta':
        return `${baseInstruction} You must respond in Tamil (தமிழ்) language only.`;
      case 'te':
        return `${baseInstruction} You must respond in Telugu (తెలుగు) language only.`;
      case 'kn':
        return `${baseInstruction} You must respond in Kannada (ಕನ್ನಡ) language only.`;
      case 'ml':
        return `${baseInstruction} You must respond in Malayalam (മലയാളം) language only.`;
      case 'mr':
        return `${baseInstruction} You must respond in Marathi (मराठी) language only.`;
      case 'gu':
        return `${baseInstruction} You must respond in Gujarati (ગુજરાતી) language only.`;
      case 'bn':
        return `${baseInstruction} You must respond in Bengali (বাংলা) language only.`;
      case 'pa':
        return `${baseInstruction} You must respond in Punjabi (ਪੰਜਾਬੀ) language only.`;
      default:
        return `${baseInstruction} You must respond in English language only.`;
    }
  }

  async processTextInput(text, language = null) {
    try {
      // If language changed, reinitialize the chat
      if (language && language !== this.currentLanguage) {
        await this.initialize(language);
      }
      
      const response = await this.chat.sendMessage(text);
      return response.response.text();
    } catch (error) {
      console.error('Error processing text:', error);
      throw error;
    }
  }

  resetChat(language = 'en-US') {
    this.initialize(language);
  }
}

module.exports = new GeminiService();