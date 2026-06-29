"""FastAPI 用户管理微服务 - 主入口"""
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import users
from app.utils.logger import setup_logging
from app.utils.metrics import setup_metrics
from app.database import engine, Base

app = FastAPI(
    title="User Management Service",
    description="腾讯云 TKE GitOps 用户管理微服务",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    Base.metadata.create_all(bind=engine)
    setup_logging()
    setup_metrics(app)
    print("[startup] 数据库初始化完成，日志与监控已配置")

@app.on_event("shutdown")
async def shutdown():
    print("[shutdown] 服务关闭")

app.include_router(users.router, prefix="/api/v1", tags=["users"])

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "user-service", "version": "1.0.0"}

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8080, reload=True)
