import React, { useCallback, useState } from 'react';
import { InputMode, VideoFile, Language } from '../types';
import { Upload, Link, AlertCircle, CloudLightning, ArrowRight } from 'lucide-react';
import { urlToFile } from '../services/utils';
import { getTranslation } from '../services/translations';

interface VideoInputProps {
  onVideoSelected: (video: VideoFile) => void;
  disabled: boolean;
  language: Language;
}

export const VideoInput: React.FC<VideoInputProps> = ({ onVideoSelected, disabled, language }) => {
  const [mode, setMode] = useState<InputMode>(InputMode.UPLOAD);
  const [urlInput, setUrlInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  
  const t = getTranslation(language);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('video/')) {
      setError(t.validFileErr);
      return;
    }
    // Limit file size to 2GB
    if (file.size > 2 * 1024 * 1024 * 1024) {
      setError(t.fileSizeLimit);
      return;
    }

    setError(null);
    const objectUrl = URL.createObjectURL(file);
    onVideoSelected({
      file,
      url: objectUrl,
      name: file.name,
      type: file.type,
      size: file.size
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [disabled, language]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput) return;

    setIsFetchingUrl(true);
    setError(null);

    try {
      if (urlInput.includes('youtube.com') || urlInput.includes('youtu.be')) {
        throw new Error(t.youtubeErr);
      }

      const file = await urlToFile(urlInput, 'video-from-url.mp4');
      handleFile(file);
    } catch (err: any) {
      setError(err.message || t.failedToFetch);
    } finally {
      setIsFetchingUrl(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Tabs */}
      <div className="flex mb-6 bg-black/40 p-1 rounded-xl w-fit mx-auto border border-white/10 backdrop-blur-md">
        <button
          onClick={() => setMode(InputMode.UPLOAD)}
          disabled={disabled}
          className={`flex items-center px-5 py-2 rounded-lg transition-all text-xs font-medium tracking-wide ${
            mode === InputMode.UPLOAD
              ? 'bg-white/10 text-white border border-white/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Upload className="w-3.5 h-3.5 mr-2" />
          {t.uploadBtn}
        </button>
        <button
          onClick={() => setMode(InputMode.URL)}
          disabled={disabled}
          className={`flex items-center px-5 py-2 rounded-lg transition-all text-xs font-medium tracking-wide ${
            mode === InputMode.URL
              ? 'bg-white/10 text-white border border-white/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Link className="w-3.5 h-3.5 mr-2" />
          {t.linkBtn}
        </button>
      </div>

      {/* Upload Area - Compact */}
      {mode === InputMode.UPLOAD && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`
            relative group border border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all duration-300
            ${dragActive 
              ? 'border-brand-500/50 bg-brand-500/10 scale-[1.01]' 
              : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer glass-panel'}
          `}
        >
          <input
            type="file"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
            disabled={disabled}
            accept="video/*"
          />
          <div className="flex flex-col items-center justify-center pointer-events-none relative z-0">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-brand-500 blur-lg opacity-20 rounded-full group-hover:opacity-30 transition-opacity"></div>
              <div className="p-3 rounded-xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 shadow-lg relative group-hover:scale-105 transition-transform">
                <CloudLightning className="w-6 h-6 text-brand-200" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">
              {t.dragDropTitle}
            </h3>
            <p className="text-slate-400 text-xs mb-4">{t.dragDropSub}</p>
          </div>
        </div>
      )}

      {/* URL Input Area - Compact */}
      {mode === InputMode.URL && (
        <div className="glass-panel rounded-2xl p-6 animate-in fade-in zoom-in-95 duration-300">
          <form onSubmit={handleUrlSubmit} className="flex flex-col gap-4">
            <div className="relative flex items-center">
              <div className="absolute left-3 flex items-center pointer-events-none">
                <Link className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/video.mp4"
                disabled={disabled || isFetchingUrl}
                className="block w-full pl-10 pr-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-all"
              />
            </div>
            <button 
              type="submit"
              disabled={disabled || isFetchingUrl || !urlInput}
              className="w-full bg-white text-black hover:bg-brand-50 disabled:opacity-50 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
            >
              {isFetchingUrl ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  {t.loadUrl}
                  <ArrowRight className="w-3 h-3" />
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Error Message - Compact */}
      {error && (
        <div className="mt-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-200 backdrop-blur-md animate-in slide-in-from-bottom-2 fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p className="text-xs font-medium">{error}</p>
        </div>
      )}
    </div>
  );
};