// server/websocketHandler.js
const { generateText } = require('./geminiService');

const activeConnections = new Map();

// Default model (you can change this to gemini-1.5-flash if you prefer)
const DEFAULT_MODEL = 'gemini-2.0-flash-exp';
// Example backup: 'gemini-1.5-flash' or 'gemini-1.5-flash-8b'

function handleWebSocketConnection(ws) {
  const connectionId = Date.now().toString();
  activeConnections.set(connectionId, {
    ws,
    isProcessing: false,
    language: 'en-US',
    modelId: DEFAULT_MODEL,
  });

  console.log(`New WebSocket connection: ${connectionId}`);
  ws.send(JSON.stringify({ type: 'connection_established', connectionId }));

  ws.on('message', async (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    const conn = activeConnections.get(connectionId);
    if (!conn) return;

    if (data.language) {
      conn.language = data.language;
      console.log(`Language updated for ${connectionId}: ${data.language}`);
    }

    switch (data.type) {
      case 'switch_model': {
        // Client requests a backup model
        conn.modelId = data.model || 'gemini-1.5-flash';
        ws.send(JSON.stringify({ type: 'model_switched', model: conn.modelId }));
        console.log(`[${connectionId}] Switched model -> ${conn.modelId}`);
        break;
      }

      case 'text': {
        if (conn.isProcessing) return;
        conn.isProcessing = true;
        ws.send(JSON.stringify({ type: 'processing_start' }));

        const { text, context } = data;
        console.log(`[${connectionId}] Using model: ${conn.modelId}`);

        try {
          const answer = await generateText({
            modelId: conn.modelId,
            text,
            language: conn.language,
            context: Array.isArray(context) ? context.slice(-6) : [],
          });

          ws.send(JSON.stringify({ type: 'response', text: answer }));
        } catch (e) {
          if (e.code === 'DailyQuotaExceeded') {
            // Tell client to lock UI and show countdown
            ws.send(JSON.stringify({
              type: 'quota_exceeded',
              model: conn.modelId,
              resetsAtMs: e.resetsAtMs,
            }));
          } else if (e.code === 'RateLimited') {
            ws.send(JSON.stringify({
              type: 'error',
              code: 'RateLimited',
              message: 'Rate limited by the API',
              retryAfterMs: e.retryAfterMs,
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              code: e.code || 'Unknown',
              message: e.message || 'Failed to process text',
            }));
          }
        } finally {
          conn.isProcessing = false;
          ws.send(JSON.stringify({ type: 'processing_end' }));
        }
        break;
      }

      case 'audio': {
        // If you later implement ASR server-side, hook it here
        if (conn.isProcessing) return;
        conn.isProcessing = true;
        ws.send(JSON.stringify({ type: 'processing_start' }));

        try {
          const answer = await generateText({
            modelId: conn.modelId,
            text: String(data.audio || ''),
            language: conn.language,
            context: [],
          });
          ws.send(JSON.stringify({ type: 'response', text: answer }));
        } catch (e) {
          if (e.code === 'DailyQuotaExceeded') {
            ws.send(JSON.stringify({
              type: 'quota_exceeded',
              model: conn.modelId,
              resetsAtMs: e.resetsAtMs,
            }));
          } else if (e.code === 'RateLimited') {
            ws.send(JSON.stringify({
              type: 'error',
              code: 'RateLimited',
              message: 'Rate limited by the API',
              retryAfterMs: e.retryAfterMs,
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              code: e.code || 'Unknown',
              message: e.message || 'Failed to process audio',
            }));
          }
        } finally {
          conn.isProcessing = false;
          ws.send(JSON.stringify({ type: 'processing_end' }));
        }
        break;
      }

      case 'interrupt': {
        // No streaming server-side here; we just signal the client
        ws.send(JSON.stringify({ type: 'interrupted' }));
        break;
      }

      case 'reset': {
        // If you keep server-side context, clear it here
        ws.send(JSON.stringify({ type: 'reset_complete' }));
        break;
      }

      default:
        console.log('Unknown message type:', data.type);
        break;
    }
  });

  ws.on('close', () => {
    activeConnections.delete(connectionId);
    console.log(`WebSocket connection closed: ${connectionId}`);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for ${connectionId}:`, error);
    activeConnections.delete(connectionId);
  });
}

module.exports = { handleWebSocketConnection };