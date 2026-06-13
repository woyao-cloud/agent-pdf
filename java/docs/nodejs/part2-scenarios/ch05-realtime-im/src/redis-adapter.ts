import Redis from 'ioredis';
import type { Message } from './types.js';

export interface MessageHandler {
  (channel: string, message: string): void;
}

export class RedisAdapter {
  private pub: Redis;
  private sub: Redis;
  private handlers = new Map<string, MessageHandler[]>();

  constructor(redisUrl?: string) {
    const url = redisUrl ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
    this.pub = new Redis(url);
    this.sub = new Redis(url);

    this.sub.on('message', (channel: string, message: string) => {
      const handlers = this.handlers.get(channel);
      if (handlers) {
        for (const handler of handlers) {
          handler(channel, message);
        }
      }
    });
  }

  async persistMessage(userId: string, message: Message): Promise<void> {
    const key = `chat:history:${userId}`;
    const pipeline = this.pub.pipeline();
    pipeline.lpush(key, JSON.stringify(message));
    pipeline.ltrim(key, 0, 999);
    await pipeline.exec();
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.pub.publish(channel, message);
  }

  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    const existing = this.handlers.get(channel) ?? [];
    existing.push(handler);
    this.handlers.set(channel, existing);

    if (existing.length === 1) {
      await this.sub.subscribe(channel);
    }
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.pub.quit(),
      this.sub.quit(),
    ]);
  }
}