// server/geminiService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Build system instruction based on language (from your original code)
function buildSystemInstruction(language = 'en-US') {
  const base = `You are Rev, the voice assistant for Revolt Motors. 
You are knowledgeable about Revolt Motors' electric motorcycles, including models like RV400, RV1, and RV1+. 
Only discuss topics related to Revolt Motors, their products, features, specifications, pricing, and services. 
If asked about unrelated topics, politely redirect the conversation back to Revolt Motors.
Keep responses concise and conversational.`;

  const lang = String(language).split('-')[0];

  switch (lang) {
    case 'hi': return `${base} You must respond in Hindi (हिंदी) language only.`;
    case 'ta': return `${base} You must respond in Tamil (தமிழ்) language only.`;
    case 'te': return `${base} You must respond in Telugu (తెలుగు) language only.`;
    case 'kn': return `${base} You must respond in Kannada (ಕನ್ನಡ) language only.`;
    case 'ml': return `${base} You must respond in Malayalam (മലയാളം) language only.`;
    case 'mr': return `${base} You must respond in Marathi (मराठी) language only.`;
    case 'gu': return `${base} You must respond in Gujarati (ગુજરાતી) language only.`;
    case 'bn': return `${base} You must respond in Bengali (বাংলা) language only.`;
    case 'pa': return `${base} You must respond in Punjabi (ਪੰਜਾਬੀ) language only.`;
    default:   return `${base} You must respond in English language only.`;
  }
}

// Convert your context array to contents for generateContent
function buildContents(userText, context = []) {
  const contents = [];
  for (const m of Array.isArray(context) ? context : []) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    contents.push({ role, parts: [{ text: m.text || '' }] });
  }
  contents.push({ role: 'user', parts: [{ text: userText }] });
  return contents;
}

function getErrorDetails(err) {
  // Library puts structured details on error.errorDetails
  return err?.errorDetails || err?.cause?.errorDetails || [];
}

function isDailyQuotaExceeded(err) {
  const details = getErrorDetails(err);
  for (const d of details) {
    if (String(d['@type'] || '').includes('google.rpc.QuotaFailure')) {
      for (const v of d.violations || []) {
        const id = String(v.quotaId || '').toLowerCase();
        const metric = String(v.quotaMetric || '').toLowerCase();
        if (id.includes('perday') || id.includes('per_day')) return true;
        if (metric.includes('free_tier') || metric.includes('free-tier')) return true;
      }
    }
  }
  return false;
}

function getRetryDelayMs(err) {
  const details = getErrorDetails(err);
  const info = details.find(d => String(d['@type'] || '').includes('google.rpc.RetryInfo'));
  const str = info?.retryDelay; // e.g., "37s"
  if (!str) return null;
  const m = /^(\d+(\.\d+)?)s$/.exec(str);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : null;
}

function getNextLocalMidnightMs() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

async function generateText({ modelId, text, language = 'en-US', context = [] }) {
  const systemInstruction = buildSystemInstruction(language);

  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction,
  });

  try {
    const res = await model.generateContent({
      contents: buildContents(text, context),
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.7,
      },
    });
    return res.response.text();
  } catch (err) {
    // Classify quota and throttling
    if (isDailyQuotaExceeded(err)) {
      const e = new Error('Daily quota exceeded');
      e.code = 'DailyQuotaExceeded';
      e.resetsAtMs = getNextLocalMidnightMs();
      throw e;
    }
    const retryAfterMs = getRetryDelayMs(err);
    if (retryAfterMs != null) {
      const e = new Error('Rate limited');
      e.code = 'RateLimited';
      e.retryAfterMs = retryAfterMs;
      throw e;
    }
    err.code = err.code || 'Unknown';
    throw err;
  }
}

module.exports = {
  generateText,
};