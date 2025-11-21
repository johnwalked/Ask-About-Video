import React, { useState, useRef, useEffect } from 'react';
import { VideoInput } from './components/VideoInput';
import { VideoFile, SummaryState, ChatMessage, AVAILABLE_VOICES, Language } from './types';
import { analyzeVideo, createChatSession, sendChatMessageStream, synthesizeSpeech, LiveSession } from './services/geminiService';
import { fileToBase64, downloadTextFile } from './services/utils';
import { getTranslation } from './services/translations';
import { 
  BrainCircuit, 
  Download, 
  Loader2, 
  Sparkles, 
  Video, 
  Home, 
  MessageSquare, 
  Send, 
  Volume2,
  StopCircle,
  Mic,
  Activity,
  FileText,
  Cpu,
  Radio,
  Power,
  Waves,
  Globe
} from 'lucide-react';
import { Chat } from '@google/genai';

export default function App() {
  const [video, setVideo] = useState<VideoFile | null>(null);
  const [summary, setSummary] = useState<SummaryState>({
    isLoading: false,
    text: null,
    error: null,
  });

  // Language State
  const [language, setLanguage] = useState<Language>('en');
  const t = getTranslation(language);

  // Layout State
  const [activeTab, setActiveTab] = useState<'summary' | 'chat'>('summary');

  // Chat State
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(AVAILABLE_VOICES[0].id);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Audio Context Ref for Chat TTS
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Live Mode State
  const [isLiveMode, setIsLiveMode] = useState(false);
  const liveSessionRef = useRef<LiveSession | null>(null);

  const handleVideoSelected = (selectedVideo: VideoFile) => {
    setVideo(selectedVideo);
    setSummary({ isLoading: false, text: null, error: null });
    setChatSession(null);
    setMessages([]);
    setIsLiveMode(false);
    setActiveTab('summary');
  };

  const handleAnalyze = async () => {
    if (!video || !video.file) return;

    setSummary({ isLoading: true, text: null, error: null });
    console.log("Starting processing for file:", video.name);

    try {
      // 1. Check API Key presence in UI (Optional debug)
      if (!process.env.API_KEY) {
         throw new Error("System Configuration Error: API Key is missing from the deployment.");
      }

      // 2. Convert File
      const base64Data = await fileToBase64(video.file);
      console.log("File converted to Base64. Size:", base64Data.length);
      
      // 3. Run Analysis
      const text = await analyzeVideo(base64Data, video.type, language);
      
      setSummary({ isLoading: false, text, error: null });
      setActiveTab('summary');

      // 4. Initialize Chat Session
      try {
        const session = await createChatSession(base64Data, video.type, language);
        setChatSession(session);
        setMessages([{
          id: 'init',
          role: 'model',
          text: language === 'am' ? "ቪዲዮውን አይቼዋለሁ! ማንኛውንም ነገር ይጠይቁኝ።" : "I've watched the video! Ask me anything.",
          timestamp: Date.now()
        }]);
      } catch (chatErr) {
        console.warn("Chat initialization warning:", chatErr);
      }

    } catch (error: any) {
      console.error("Analysis workflow failed:", error);
      setSummary({
        isLoading: false,
        text: null,
        error: error.message || "Failed to analyze video. Please try a smaller file or check your connection."
      });
    }
  };

  const handleDownload = () => {
    if (summary.text) {
      downloadTextFile(summary.text, `gemini-summary-${Date.now()}.txt`);
    }
  };

  const handleHome = () => {
    setVideo(null);
    setSummary({ isLoading: false, text: null, error: null });
    setChatSession(null);
    setMessages([]);
    setInputMessage('');
    stopChatAudio();
    stopLiveMode();
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'am' : 'en');
  };

  // Chat Functions
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeTab === 'chat') {
      scrollToBottom();
    }
  }, [messages, isChatLoading, activeTab]);

  const stopChatAudio = () => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current = null;
    }
    setIsPlayingAudio(false);
  };

  const playResponse = async (text: string) => {
    if (isLiveMode) return;
    stopChatAudio();
    setIsPlayingAudio(true);
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioBuffer = await synthesizeSpeech(text, selectedVoice);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setIsPlayingAudio(false);
      source.start();
      audioSourceRef.current = source;
    } catch (err) {
      console.error("Audio playback failed", err);
      setIsPlayingAudio(false);
    }
  };

  const handleSendMessage = async (overrideText?: string) => {
    const textToSend = overrideText || inputMessage;
    if (!textToSend.trim() || !chatSession) return;

    stopChatAudio();
    if (isLiveMode) stopLiveMode();

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsChatLoading(true);
    
    const responseId = (Date.now() + 1).toString();
    let fullResponseText = "";
    
    setMessages(prev => [...prev, {
      id: responseId,
      role: 'model',
      text: "", 
      timestamp: Date.now()
    }]);

    try {
      const stream = sendChatMessageStream(chatSession, textToSend);
      for await (const chunk of stream) {
         fullResponseText += chunk;
         setMessages(prev => prev.map(msg => 
           msg.id === responseId ? { ...msg, text: fullResponseText } : msg
         ));
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => prev.map(msg => 
        msg.id === responseId ? { ...msg, text: "Error generating response." } : msg
      ));
    } finally {
      setIsChatLoading(false);
    }
  };

  // Live Mode Functions
  const toggleLiveMode = async () => {
    if (isLiveMode) {
      stopLiveMode();
    } else {
      startLiveMode();
    }
  };

  const startLiveMode = () => {
    if (!summary.text) return;
    stopChatAudio();
    setActiveTab('chat');
    setIsLiveMode(true);
    try {
      liveSessionRef.current = new LiveSession(selectedVoice, summary.text, language);
    } catch (err) {
      console.error("Failed to start live session", err);
      setIsLiveMode(false);
    }
  };

  const stopLiveMode = () => {
    setIsLiveMode(false);
    if (liveSessionRef.current) {
      liveSessionRef.current.disconnect();
      liveSessionRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopLiveMode();
  }, []);

  return (
    <div className="min-h-screen font-sans selection:bg-brand-500/30 pb-4 text-slate-100 overflow-x-hidden bg-black">
      
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 glass-panel border-b-0 border-b-white/5 h-14 lg:h-16">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            {video && (
              <button 
                onClick={handleHome}
                className="glass-button p-1.5 rounded-lg text-brand-300 hover:text-white transition-all"
                aria-label="Home"
              >
                <Home className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-brand-400" />
              <h1 className="text-base font-bold text-white tracking-tight">{t.appTitle}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-all text-xs font-medium text-slate-300"
            >
              <Globe className="w-3.5 h-3.5" />
              {language === 'en' ? 'AM' : 'EN'}
            </button>
            <span className="text-[10px] text-slate-400 font-medium px-2 py-1 bg-white/5 rounded-full border border-white/5 hidden sm:inline-block">
               Gemini 3 Pro
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-20 pb-6 relative z-0">
        
        {!video ? (
          // Landing View
          <div className="flex flex-col items-center justify-center min-h-[70vh] animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="text-center mb-10 relative w-full max-w-md mx-auto">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-brand-500/20 rounded-full blur-3xl -z-10 pointer-events-none"></div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-brand-300 text-[10px] font-medium mb-6 backdrop-blur-md">
                <Video className="w-3 h-3" />
                <span>{t.subtitle}</span>
              </div>
              <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/50 mb-4 tracking-tight">
                {t.landingTitle}
              </h2>
              <p className="text-sm text-slate-400 max-w-xs mx-auto leading-relaxed">
                {t.landingDesc} <span className="text-white font-medium">2GB</span>.
              </p>
            </div>
            <div className="w-full">
              <VideoInput onVideoSelected={handleVideoSelected} disabled={summary.isLoading} language={language} />
            </div>
          </div>
        ) : (
          /* Main Workspace */
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid lg:grid-cols-12 gap-6 lg:h-[calc(100vh-7rem)]">
              
              {/* Left Panel: Video & Actions (5 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-4 lg:overflow-y-auto custom-scrollbar pr-1">
                <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 relative group shrink-0 bg-black">
                  <div className="aspect-video relative flex items-center justify-center">
                    <video 
                      src={video.url || undefined} 
                      controls 
                      className="w-full h-full object-contain max-h-[40vh] bg-black"
                    />
                  </div>
                  <div className="px-4 py-3 bg-black/80 backdrop-blur-xl border-t border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white text-sm truncate">{video.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                           <span className="text-[10px] text-brand-400 bg-brand-900/30 px-1.5 py-0.5 rounded border border-brand-500/20 font-mono">
                              {(video.size / (1024 * 1024)).toFixed(2)} MB
                           </span>
                           <span className="text-[10px] text-slate-500 uppercase font-mono">{video.type.split('/')[1]}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error Display */}
                {summary.error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-200 text-xs flex items-start gap-3 animate-in shake">
                        <Activity className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold mb-1">Analysis Failed</p>
                            <p>{summary.error}</p>
                        </div>
                    </div>
                )}

                {/* Analyze Control */}
                <button
                    onClick={handleAnalyze}
                    disabled={summary.isLoading}
                    className={`
                      w-full py-4 rounded-2xl font-bold text-sm transition-all duration-300 shrink-0 relative overflow-hidden group
                      ${summary.isLoading 
                        ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5' 
                        : 'bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white shadow-lg hover:shadow-brand-500/25 border border-brand-400/20'}
                    `}
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.1)_50%,transparent_75%)] bg-[length:250%_250%] animate-[shimmer_2s_infinite] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <span className="relative flex items-center justify-center gap-2">
                      {summary.isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t.analyzing}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          {t.analyzeBtn}
                        </>
                      )}
                    </span>
                  </button>
              </div>

              {/* Right Panel: Intelligence Hub (7 cols) */}
              <div className="lg:col-span-7 flex flex-col min-h-0 relative">
                
                {/* Tabs Header */}
                <div className="flex items-center gap-2 mb-3">
                  <button 
                    onClick={() => setActiveTab('summary')}
                    disabled={!summary.text}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                      activeTab === 'summary' 
                        ? 'bg-white text-black shadow-lg scale-[1.02]' 
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5'
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {t.tabAnalysis}
                  </button>
                  <button 
                     onClick={() => setActiveTab('chat')}
                     disabled={!summary.text}
                     className={`flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                      activeTab === 'chat' 
                        ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20 scale-[1.02]' 
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5'
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    {t.tabChat}
                  </button>
                </div>

                {/* Content Area */}
                <div 
                  className={`
                    flex-1 glass-panel rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 relative flex flex-col min-h-0 transition-all duration-500
                    ${activeTab === 'chat' ? 'max-h-[60vh]' : 'h-full'}
                  `}
                >
                  
                  {!summary.text ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/5">
                         <Cpu className="w-8 h-8 text-slate-600" />
                      </div>
                      <h3 className="text-white font-medium mb-1">{t.systemStandby}</h3>
                      <p className="text-slate-500 text-xs max-w-xs">
                        {t.systemStandbyDesc}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Tab: Summary */}
                      {activeTab === 'summary' && (
                        <div className="flex flex-col h-full animate-in fade-in zoom-in-95 duration-300">
                           <div className="border-b border-white/5 px-5 py-4 flex items-center justify-between bg-white/[0.02]">
                            <h3 className="text-sm font-bold text-white tracking-tight">{t.execSummary}</h3>
                            <button onClick={handleDownload} className="text-xs flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors bg-white/5 px-2 py-1 rounded-lg border border-white/5 hover:bg-white/10">
                              <Download className="w-3 h-3" />
                              <span>{t.export}</span>
                            </button>
                          </div>
                          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                            <div className="prose prose-invert prose-sm max-w-none prose-p:text-slate-300 prose-p:text-sm prose-p:leading-relaxed prose-headings:text-white prose-strong:text-brand-300 prose-ul:text-slate-300 font-sans">
                               <div className="whitespace-pre-wrap">{summary.text}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Tab: Chat & Live Mode */}
                      {activeTab === 'chat' && (
                         <div className="flex flex-col h-full animate-in fade-in zoom-in-95 duration-300 relative">
                           
                           {/* Live Mode Liquid Glass UI */}
                           {isLiveMode && (
                             <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-3xl flex flex-col items-center justify-center overflow-hidden transition-all duration-700">
                                
                                {/* Ambient Background Blobs */}
                                <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/30 rounded-full mix-blend-screen filter blur-[100px] animate-pulse"></div>
                                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/30 rounded-full mix-blend-screen filter blur-[100px] animate-pulse delay-1000"></div>
                                
                                {/* Main Floating Glass Orb */}
                                <div className="relative z-10">
                                  <div className="w-48 h-48 rounded-full bg-white/5 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.1)] relative overflow-hidden">
                                     
                                     {/* Internal Liquid Animation */}
                                     <div className="absolute inset-0 bg-gradient-to-br from-brand-400/20 to-purple-500/20 animate-[spin_8s_linear_infinite]"></div>
                                     
                                     {/* Pulsing Core */}
                                     <div className="w-24 h-24 rounded-full bg-white/10 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-inner animate-[pulse_2s_ease-in-out_infinite]">
                                         <Waves className="w-8 h-8 text-white/80" />
                                     </div>
                                     
                                     {/* Orbiting Rings */}
                                     <div className="absolute inset-2 rounded-full border border-white/10 border-t-white/50 animate-[spin_3s_linear_infinite]"></div>
                                     <div className="absolute inset-6 rounded-full border border-white/5 border-b-white/30 animate-[spin_5s_linear_infinite_reverse]"></div>
                                  </div>
                                  
                                  {/* Status Label */}
                                  <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
                                     <p className="text-white/90 font-medium tracking-wider text-sm mb-1 drop-shadow-md">{t.liveConnection}</p>
                                     <p className="text-white/50 text-[10px] uppercase tracking-widest">{t.listening}</p>
                                  </div>
                                </div>

                                {/* End Button */}
                                <button 
                                  onClick={stopLiveMode}
                                  className="mt-24 group relative px-6 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-md transition-all duration-300 hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                                >
                                   <div className="flex items-center gap-2 text-white/80 group-hover:text-white text-xs font-medium uppercase tracking-widest">
                                     <Power className="w-3.5 h-3.5" />
                                     <span>{t.disconnect}</span>
                                   </div>
                                </button>
                             </div>
                           )}

                           {/* Standard Chat UI */}
                           <div className="flex-1 flex flex-col min-h-0">
                             {/* Controls Header */}
                             <div className="px-4 py-3 border-b border-white/5 bg-white/5 flex items-center justify-between backdrop-blur-xl z-10 shrink-0">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-brand-400 animate-pulse"></div>
                                  <span className="font-semibold text-white text-xs tracking-wide">{t.aiOnline}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                   <div className="relative group">
                                      <select 
                                        value={selectedVoice}
                                        onChange={(e) => setSelectedVoice(e.target.value)}
                                        className="appearance-none bg-black/40 text-[10px] font-medium text-slate-300 border border-white/10 rounded-lg pl-2 pr-6 py-1.5 focus:outline-none focus:border-brand-500 hover:bg-white/5 cursor-pointer disabled:opacity-50 transition-colors w-32"
                                      >
                                        {AVAILABLE_VOICES.map(v => (
                                          <option key={v.id} value={v.id} className="bg-slate-900 text-slate-200">{v.name}</option>
                                        ))}
                                      </select>
                                      <Volume2 className="w-3 h-3 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                   </div>
                                   
                                   {isPlayingAudio && (
                                     <button 
                                       onClick={stopChatAudio}
                                       className="p-1.5 rounded-md bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
                                       title="Stop Audio"
                                     >
                                       <StopCircle className="w-3.5 h-3.5" />
                                     </button>
                                   )}
                                </div>
                             </div>

                             {/* Messages */}
                             <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar bg-black/20">
                                {messages.length === 0 && (
                                  <div className="flex flex-col items-center justify-center h-full text-center opacity-40 pb-10">
                                     <Sparkles className="w-8 h-8 text-brand-400 mb-3" />
                                     <p className="text-slate-400 text-xs max-w-[200px]">{t.chatPlaceholder}</p>
                                  </div>
                                )}
                                {messages.map((msg) => (
                                  <div 
                                    key={msg.id} 
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                  >
                                     <div className={`
                                        max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-lg
                                        ${msg.role === 'user' 
                                          ? 'bg-brand-600 text-white rounded-tr-sm' 
                                          : 'bg-white/10 text-slate-200 rounded-tl-sm border border-white/5'}
                                     `}>
                                        {msg.text}
                                     </div>
                                  </div>
                                ))}
                                {isChatLoading && !messages[messages.length - 1]?.text && (
                                   <div className="flex justify-start">
                                      <div className="bg-white/5 rounded-2xl rounded-tl-sm p-4 border border-white/5">
                                        <div className="flex gap-1.5">
                                          <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce"></div>
                                          <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce delay-75"></div>
                                          <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce delay-150"></div>
                                        </div>
                                      </div>
                                   </div>
                                )}
                                <div ref={chatEndRef} />
                             </div>

                             {/* Input Area */}
                             <div className="p-3 border-t border-white/5 bg-white/5 backdrop-blur-xl shrink-0">
                                <div className="relative flex items-center gap-2">
                                   <input
                                     type="text"
                                     value={inputMessage}
                                     onChange={(e) => setInputMessage(e.target.value)}
                                     onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                     placeholder={t.chatPlaceholder}
                                     disabled={isChatLoading && !messages[messages.length - 1]?.text} 
                                     className="w-full bg-black/40 text-white placeholder-slate-500 text-xs rounded-xl pl-4 pr-32 py-3.5 border border-white/10 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-all disabled:opacity-50"
                                   />
                                   
                                   <div className="absolute right-2 flex items-center gap-1">
                                     <button
                                       onClick={toggleLiveMode}
                                       className="relative overflow-hidden flex items-center gap-2 px-4 py-1.5 rounded-xl bg-white/5 border border-white/10 group hover:border-brand-400/50 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all duration-300 mr-1"
                                       title="Start Live Mode"
                                     >
                                        <div className="absolute inset-0 bg-gradient-to-r from-brand-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="relative flex items-center gap-2">
                                            <div className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-300 group-hover:text-white transition-colors tracking-wide uppercase">{t.liveBtn}</span>
                                        </div>
                                     </button>

                                     <button
                                       onClick={() => handleSendMessage()}
                                       disabled={!inputMessage.trim()}
                                       className="p-2 rounded-lg bg-brand-500 text-white shadow-lg hover:bg-brand-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                     >
                                       <Send className="w-3.5 h-3.5" />
                                     </button>
                                   </div>
                                </div>
                             </div>
                           </div>
                         </div>
                      )}
                    </>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}