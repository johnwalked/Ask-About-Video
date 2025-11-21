export interface VideoFile {
  file: File | null;
  url: string | null;
  name: string;
  type: string;
  size: number;
}

export interface SummaryState {
  isLoading: boolean;
  text: string | null;
  error: string | null;
}

export enum InputMode {
  UPLOAD = 'UPLOAD',
  URL = 'URL'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isAudio?: boolean;
}

export interface Voice {
  name: string;
  id: string;
}

export type Language = 'en' | 'am';

export const AVAILABLE_VOICES: Voice[] = [
  { name: 'Puck (Playful)', id: 'Puck' },
  { name: 'Charon (Deep)', id: 'Charon' },
  { name: 'Kore (Soothing)', id: 'Kore' },
  { name: 'Fenrir (Resonant)', id: 'Fenrir' },
  { name: 'Zephyr (Calm)', id: 'Zephyr' },
];