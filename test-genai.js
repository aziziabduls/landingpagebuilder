import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: 'dummy-key' });

try {
  const request = {
    model: 'gemini-3.1-pro-preview',
    contents: { parts: [{ text: 'Hello' }] },
    config: {
      systemInstruction: 'You are an AI.',
      temperature: 0.7,
    }
  };
  console.log("Request constructed ok");
  
  // just printing, won't actually fetch without valid key but we can see if it throws validation error locally
  // or we can test if the model is valid? No, model validation is on server.
} catch(e) {
  console.error(e);
}
