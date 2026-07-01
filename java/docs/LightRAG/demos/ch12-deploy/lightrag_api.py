#!/usr/bin/env python3
"""
LightRAG API 服务部署演示
使用 FastAPI 部署 LightRAG 服务
"""
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="LightRAG API", version="1.0.0")

# 内存存储（模拟）
documents = []
knowledge_graph = {"entities": {}, "relations": []}

class QueryRequest(BaseModel):
    question: str
    mode: str = "hybrid"

class InsertRequest(BaseModel):
    text: str

class QueryResponse(BaseModel):
    question: str
    answer: str
    mode: str
    sources: int

@app.post("/insert", summary="插入文档")
async def insert_document(req: InsertRequest):
    documents.append(req.text)
    return {"status": "ok", "total_docs": len(documents)}

@app.post("/query", response_model=QueryResponse, summary="查询")
async def query(req: QueryRequest):
    if not documents:
        raise HTTPException(status_code=400, detail="知识库为空")
    
    # 模拟检索
    answer = f"[{req.mode.upper()}] 基于 {len(documents)} 篇文档的回答:\n"
    answer += f"问题: {req.question}\n"
    answer += "这是模拟的 LightRAG 回答..."
    
    return QueryResponse(
        question=req.question,
        answer=answer,
        mode=req.mode,
        sources=len(documents)
    )

@app.get("/health", summary="健康检查")
async def health():
    return {"status": "healthy", "documents": len(documents)}

@app.get("/stats", summary="统计信息")
async def stats():
    return {
        "documents": len(documents),
        "entities": len(knowledge_graph["entities"]),
        "relations": len(knowledge_graph["relations"]),
    }

if __name__ == "__main__":
    print("=" * 60)
    print("LightRAG API 服务")
    print("=" * 60)
    print("\nAPI 端点:")
    print("  POST /insert - 插入文档")
    print("  POST /query  - 查询")
    print("  GET  /health - 健康检查")
    print("  GET  /stats  - 统计信息")
    print("\n启动服务: http://localhost:8000")
    print("API 文档: http://localhost:8000/docs")
    print()
    uvicorn.run(app, host="0.0.0.0", port=8000)
