export class SDK {
  constructor(private config: { baseUrl: string; timeout?: number }) {}

  async getUser(id: string): Promise<{ id: string; name: string; email: string }> {
    const res = await fetch(`${this.config.baseUrl}/users/${id}`);
    return res.json();
  }

  async createUser(data: { name: string; email: string }): Promise<{ id: string }> {
    const res = await fetch(`${this.config.baseUrl}/users`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  }
}
