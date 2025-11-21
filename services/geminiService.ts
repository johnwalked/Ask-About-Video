import { GoogleGenAI, Chat, Modality, GenerateContentResponse, LiveServerMessage } from "@google/genai";
import { Language } from "../types";

// Initialize the Gemini API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Type definition for the Live Session since it's not exported directly from the SDK
type GenAILiveSession = Awaited<ReturnType<typeof ai.live.connect>>;

/**
 * Analyzes a video using the Gemini 3 Pro model.
 */
export const analyzeVideo = async (base64Data: string, mimeType: string, language: Language = 'en'): Promise<string> => {
  try {
    const modelId = 'gemini-3-pro-preview'; 
    const finalMimeType = mimeType || 'video/mp4';

    const langInstruction = language === 'am' 
      ? "Provide the output strictly in Amharic language." 
      : "Provide the output in English.";

    const response = await ai.models.generateContent({
      model: modelId,
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: finalMimeType,
                data: base64Data
              }
            },
            {
              text: `Analyze this video content. ${langInstruction}`
            }
          ]
        }
      ],
      config: {
        temperature: 0.2,
        // Thinking mode configuration for deep analysis
        thinkingConfig: { thinkingBudget: 32768 }, 
        systemInstruction: `You are an expert video analyst. 
        Analyze the provided video content and generate a very clear, short, and optimized summary.
        
        Format your response strictly as follows (Translate headers if in Amharic):

        ### 🎯 Executive Summary
        [A single, powerful sentence describing the video's core message]

        ### 🔑 Key Highlights
        * [Key point 1]
        * [Key point 2]
        * [Key point 3]

        ### 💡 Takeaway
        [A brief concluding insight]
        
        Keep the tone professional, clear, and objective. ${langInstruction}`
      }
    });

    if (response.text) {
      return response.text;
    }
    
    if (response.candidates?.[0]?.finishReason) {
        console.warn("Analysis stopped. Reason:", response.candidates[0].finishReason);
        return `Analysis stopped. Reason: ${response.candidates[0].finishReason}`;
    }

    return "No summary generated.";
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to analyze video.");
  }
};

/**
 * Creates a chat session initialized with the video context.
 */
export const createChatSession = async (base64Data: string, mimeType: string, language: Language = 'en'): Promise<Chat> => {
  const modelId = 'gemini-3-pro-preview';
  
  const langInstruction = language === 'am' 
    ? "You must answer in Amharic language." 
    : "Answer in English.";

  const chat = ai.chats.create({
    model: modelId,
    config: {
        temperature: 0.4,
        systemInstruction: `You are a helpful AI video assistant. You have watched the video provided by the user. Answer their questions about the video details, visuals, audio, and meaning accurately and concisely. Keep answers short and to the point. ${langInstruction}`
    },
    history: [
      {
        role: 'user',
        parts: [
            { inlineData: { mimeType: mimeType || 'video/mp4', data: base64Data } },
            { text: "Here is the video I want to talk about." }
        ]
      },
      {
        role: 'model',
        parts: [{ text: language === 'am' ? "ቪዲዮውን አይቼዋለሁ። ምን ልርዳዎት?" : "I have analyzed the video. What would you like to know about it?" }]
      }
    ]
  });

  return chat;
};

/**
 * Sends a message to an existing chat session using streaming.
 */
export const sendChatMessageStream = async function* (chat: Chat, message: string) {
  try {
    const result = await chat.sendMessageStream({ message });
    for await (const chunk of result) {
      const c = chunk as GenerateContentResponse;
      if (c.text) {
        yield c.text;
      }
    }
  } catch (error: any) {
    console.error("Chat Stream Error:", error);
    throw error;
  }
};

/**
 * Helper to decode base64 string to byte array
 */
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Helper to decode audio data for the browser
 */
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Assuming 16-bit PCM
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Encode Float32Array from AudioBuffer to PCM Base64 for Gemini
 */
function base64EncodeAudio(float32Array: Float32Array): string {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  let binary = '';
  const bytes = new Uint8Array(int16Array.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Synthesizes speech from text using Gemini TTS.
 */
export const synthesizeSpeech = async (text: string, voiceName: string = 'Puck'): Promise<AudioBuffer> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName }
            },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
        throw new Error("No audio data received from API");
    }

    const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
    const audioBuffer = await decodeAudioData(
      decode(base64Audio),
      outputAudioContext,
      24000,
      1,
    );

    return audioBuffer;

  } catch (error: any) {
    console.error("TTS Error:", error);
    throw error;
  }
};

/**
 * LIVE API IMPLEMENTATION
 */
export class LiveSession {
  private session: Promise<GenAILiveSession>;
  private inputContext: AudioContext;
  private outputContext: AudioContext;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private nextStartTime: number = 0;
  private voiceName: string;
  private contextText: string;
  private language: Language;

  constructor(voiceName: string, contextText: string, language: Language = 'en') {
    this.voiceName = voiceName;
    this.contextText = contextText;
    this.language = language;
    
    this.inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

    const langInstruction = this.language === 'am' 
      ? "Speak in Amharic. Translate your insights into Amharic." 
      : "Speak in English.";

    this.session = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voiceName } },
        },
        systemInstruction: `You are a helpful, specialized video analysis AI. 
        You are talking with a user about a specific video.
        Here is the Summary/Analysis of the video content:
        "${this.contextText}"
        
        Answer the user's questions based on this summary. 
        Be conversational, concise, and friendly. Do not use markdown in your speech.
        
        IMPORTANT: ${langInstruction}`,
      },
      callbacks: {
        onopen: this.onOpen.bind(this),
        onmessage: this.onMessage.bind(this),
        onclose: () => console.log("Live session closed"),
        onerror: (err) => console.error("Live session error:", err),
      }
    });
  }

  private async onOpen() {
    console.log("Live Session Connected");
    // Start Audio Stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.inputSource = this.inputContext.createMediaStreamSource(stream);
      this.processor = this.inputContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const base64Data = base64EncodeAudio(inputData);
        
        this.session.then(s => {
            s.sendRealtimeInput({
                media: {
                    mimeType: 'audio/pcm;rate=16000',
                    data: base64Data
                }
            });
        });
      };

      this.inputSource.connect(this.processor);
      this.processor.connect(this.inputContext.destination);
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  }

  private async onMessage(message: LiveServerMessage) {
    // Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    
    if (base64Audio) {
      try {
        const audioBuffer = await decodeAudioData(
          decode(base64Audio),
          this.outputContext,
          24000,
          1
        );
        
        const source = this.outputContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputContext.destination);
        
        this.nextStartTime = Math.max(this.outputContext.currentTime, this.nextStartTime);
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        
      } catch (e) {
        console.error("Error decoding audio chunk", e);
      }
    }
  }

  public async disconnect() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
    await this.inputContext.close();
    await this.outputContext.close();
    
    // Close session
    // Note: The SDK currently doesn't expose a clean .close() on the promise result directly in all versions, 
    // but dropping references and stopping media stream usually suffices for client cleanup.
    // Ideally: (await this.session).close(); if supported.
  }
}