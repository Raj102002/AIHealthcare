export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isEmergency?: boolean;
}

export interface Vitals {
  heartRate?: number;
  bloodPressure?: string;
  temperature?: number;
  oxygenSaturation?: number;
  weight?: number;
}

export interface HealthLog {
  objectId?: string;
  symptoms: string;
  vitals?: Vitals;
  severity: "low" | "medium" | "high";
  notes?: string;
  createdAt?: string;
}

export interface UserProfile {
  objectId?: string;
  username: string;
  email?: string;
  allergies: string[];
  conditions: string[];
  medications: string[];
  bloodType?: string;
  age?: number;
  preferredLanguage?: string;
}

export interface Conversation {
  objectId?: string;
  title: string;
  messages: Message[];
  lastMessage?: string;
  createdAt?: string;
}
