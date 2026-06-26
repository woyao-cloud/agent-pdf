import time

def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

start = time.perf_counter()
result = fib(3)
elapsed = time.perf_counter() - start
print(f"fib(3) = {result}, 耗时: {elapsed:.3f}s")

def fib2(n):
    a = [1, 2, 3]
    b = a           # b 和 a 指向同一个 list 对象
    b.append(4)
    print(a)