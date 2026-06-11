"""
告警模拟生成器 — 模拟生产环境中的指标变化以触发告警

支持模拟场景：
1. 正常状态：CPU < 30%, Memory < 50%
2. 高负载：CPU > 80%（触发 HighCPULoad 告警）
3. 高内存：Memory > 85%（触发 HighMemoryLoad 告警）
4. 机房断网：DatacenterDown + HostDown（测试 Inhibition 抑制）
"""

from prometheus_client import start_http_server, Gauge, Counter
import random
import time


class AlertGenerator:
    INSTANCES = ['web-1', 'web-2', 'web-3', 'db-1', 'cache-1']
    DATACENTERS = ['dc-east', 'dc-west']

    def __init__(self):
        self.cpu = Gauge('demo_cpu_percent', 'CPU usage percent', ['instance'])
        self.memory = Gauge('demo_memory_percent', 'Memory usage percent', ['instance'])
        self.requests = Counter('demo_requests_total', 'Total requests', ['instance'])
        self.errors = Counter('demo_errors_total', 'Total errors', ['instance'])
        self.dc_down = Gauge('demo_datacenter_down', 'Datacenter down flag', ['datacenter'])
        self.host_down = Gauge('demo_host_down', 'Host down flag', ['instance', 'datacenter'])

        self.current_mode = 'normal'

    def set_mode(self, mode):
        self.current_mode = mode
        print(f"[AlertGen] Switching to mode: {mode}")

    def run_forever(self):
        tick = 0
        while True:
            if self.current_mode == 'normal':
                for inst in self.INSTANCES:
                    self.cpu.labels(instance=inst).set(random.uniform(10, 40))
                    self.memory.labels(instance=inst).set(random.uniform(30, 60))
                    self.requests.labels(instance=inst).inc(random.randint(1, 10))
                    if random.random() < 0.02:
                        self.errors.labels(instance=inst).inc(1)

            elif self.current_mode == 'high_cpu':
                for inst in self.INSTANCES:
                    self.cpu.labels(instance=inst).set(random.uniform(80, 95))
                    self.memory.labels(instance=inst).set(random.uniform(40, 60))

            elif self.current_mode == 'dc_down':
                # 模拟 dc-east 机房断网：dc-east 的所有 host 都 down
                for inst in self.INSTANCES:
                    self.cpu.labels(instance=inst).set(0)
                    self.memory.labels(instance=inst).set(0)
                self.dc_down.labels(datacenter='dc-east').set(1)
                self.dc_down.labels(datacenter='dc-west').set(0)
                for inst in self.INSTANCES:
                    self.host_down.labels(instance=inst, datacenter='dc-east').set(1)
                    self.host_down.labels(instance=inst, datacenter='dc-west').set(0)

            # 自动切换模式
            if tick % 60 == 0 and tick > 0:
                modes = ['normal', 'high_cpu', 'normal', 'dc_down', 'normal']
                next_mode = modes[(tick // 60) % len(modes)]
                self.set_mode(next_mode)

            tick += 1
            time.sleep(1)


if __name__ == '__main__':
    gen = AlertGenerator()
    start_http_server(8088)
    print("[AlertGen] Started on :8088")
    gen.run_forever()