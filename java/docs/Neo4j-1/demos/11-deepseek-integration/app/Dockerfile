FROM python:3.11-slim

WORKDIR /app

# 安装依赖
RUN pip install --no-cache-dir flask neo4j openai python-dotenv

# 应用代码通过 volume 挂载
CMD ["python", "app.py"]
