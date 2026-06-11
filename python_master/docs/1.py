import time

def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

start = time.perf_counter()
result = fib(30)
elapsed = time.perf_counter() - start
print(f"fib(3) = {result}, 耗时: {elapsed:.3f}s")