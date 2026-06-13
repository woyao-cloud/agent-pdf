export interface SDKConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class SDK {
  constructor(config: SDKConfig);
  getUser(id: string): Promise<User>;
  getUser(query: { email: string }): Promise<User>;
  create<T extends Record<string, unknown>>(resource: string, data: T): Promise<T>;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

declare global {
  interface Window {
    __SDK_VERSION__: string;
  }
}
