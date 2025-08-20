const geminiService = require('./geminiService');

// Initialize Gemini service
geminiService.initialize().catch(console.error);

const activeConnections = new Map();

function handleWebSocketConnection(ws) {
  const connectionId = Date.now().toString();
  activeConnections.set(connectionId, { ws, isProcessing: false, language: 'en-US' });
  
  console.log(`New WebSocket connection: ${connectionId}`);
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      const connection = activeConnections.get(connectionId);
      
      if (data.language) {
        connection.language = data.language;
        console.log(`Language updated for ${connectionId}: ${data.language}`);
      }
      
      switch (data.type) {
        case 'audio':
          await handleAudioMessage(connectionId, data.audio, connection.language);
          break;
          
        case 'text':
          await handleTextMessage(connectionId, data.text, connection.language);
          break;
          
        case 'interrupt':
          handleInterrupt(connectionId);
          break;
          
        case 'reset':
          geminiService.resetChat(connection.language);
          ws.send(JSON.stringify({ type: 'reset_complete' }));
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Failed to process message' 
      }));
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
  
  // Send initial connection success message
  ws.send(JSON.stringify({ 
    type: 'connection_established', 
    connectionId 
  }));
}

async function handleAudioMessage(connectionId, audioData, language) {
  const connection = activeConnections.get(connectionId);
  if (!connection || connection.isProcessing) return;
  
  connection.isProcessing = true;
  connection.ws.send(JSON.stringify({ type: 'processing_start' }));
  
  try {
    // In a real implementation, you'd convert audio to text here
    // For now, we'll simulate with a text message
    const response = await geminiService.processTextInput(audioData, language);
    
    if (connection.isProcessing) {
      connection.ws.send(JSON.stringify({ 
        type: 'response', 
        text: response 
      }));
    }
  } catch (error) {
    console.error('Error processing audio:', error);
    connection.ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Failed to process audio' 
    }));
  } finally {
    connection.isProcessing = false;
    connection.ws.send(JSON.stringify({ type: 'processing_end' }));
  }
}

async function handleTextMessage(connectionId, text, language) {
  const connection = activeConnections.get(connectionId);
  if (!connection || connection.isProcessing) return;
  
  connection.isProcessing = true;
  connection.ws.send(JSON.stringify({ type: 'processing_start' }));
  
  try {
    const response = await geminiService.processTextInput(text, language);
    
    if (connection.isProcessing) {
      connection.ws.send(JSON.stringify({ 
        type: 'response', 
        text: response 
      }));
    }
  } catch (error) {
    console.error('Error processing text:', error);
    connection.ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Failed to process text' 
    }));
  } finally {
    connection.isProcessing = false;
    connection.ws.send(JSON.stringify({ type: 'processing_end' }));
  }
}

function handleInterrupt(connectionId) {
  const connection = activeConnections.get(connectionId);
  if (connection) {
    connection.isProcessing = false;
    connection.ws.send(JSON.stringify({ type: 'interrupted' }));
  }
}

module.exports = { handleWebSocketConnection };