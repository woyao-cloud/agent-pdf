interface Service {
  name: string;
  handler: (req: Request) => Response | Promise<Response>;
}

class MicroserviceGateway {
  private services: Map<string, Service> = new Map();

  register(service: Service): void {
    this.services.set(service.name, service);
    console.log(`Registered: ${service.name}`);
  }

  start(gatewayPort: number): void {
    Bun.serve({
      port: gatewayPort,
      fetch: async (req) => {
        const url = new URL(req.url);
        const prefix = url.pathname.split("/")[1];

        const svc = this.services.get(prefix + "-service");
        if (svc) return svc.handler(req);

        return new Response("Not Found", { status: 404 });
      },
    });
    console.log(`Gateway running on port ${gatewayPort}`);
  }
}

const gateway = new MicroserviceGateway();
gateway.register({ name: "users-service", handler: () => Response.json({ service: "users" }) });
gateway.register({ name: "orders-service", handler: () => Response.json({ service: "orders" }) });
gateway.start(3000);

// Self-test
const r1 = await fetch("http://localhost:3000/users");
const r2 = await fetch("http://localhost:3000/orders");
console.log("Gateway test:", await r1.json(), await r2.json());
