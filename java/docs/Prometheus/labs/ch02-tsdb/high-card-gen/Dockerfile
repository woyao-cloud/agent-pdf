FROM python:3.11-alpine
WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY generator.py generator.py
EXPOSE 8082
CMD ["python", "generator.py"]