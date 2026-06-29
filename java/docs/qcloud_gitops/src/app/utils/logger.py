"""CLS 日志集成 - 结构化 JSON 日志"""
import json
import logging
import sys
import os
from datetime import datetime

class CLSJsonFormatter(logging.Formatter):
    """CLS 兼容的 JSON 日志格式化器"""
    def format(self, record):
        log_entry = {
            "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
            "level": record.levelname,
            "service": os.getenv("SERVICE_NAME", "user-service"),
            "traceId": getattr(record, "trace_id", ""),
            "spanId": getattr(record, "span_id", ""),
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry, ensure_ascii=False)

def setup_logging():
    """配置日志（输出到 stdout，CLS LogListener 采集）"""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(CLSJsonFormatter())
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.handlers.clear()
    root.addHandler(handler)
    logging.getLogger("uvicorn").setLevel(logging.WARNING)

def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
