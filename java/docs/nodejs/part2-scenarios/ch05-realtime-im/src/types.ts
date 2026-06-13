export interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  type: 'text' | 'image' | 'system';
  timestamp: number;
}

export interface AckMessage {
  messageId: string;
  status: 'received' | 'read' | 'failed';
  timestamp: number;
}

export interface ClientInfo {
  userId: string;
  connections: number;
  lastSeen: number;
}