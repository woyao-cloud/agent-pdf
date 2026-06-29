"""用户管理 API 路由"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.schemas import UserCreate, UserUpdate, UserResponse, UserListResponse
from app.crud import (
    get_user, get_user_by_username, get_user_by_email,
    get_users, create_user, update_user, delete_user,
)
from app.utils.logger import get_logger
from app.utils.metrics import track_request

router = APIRouter()
logger = get_logger(__name__)

@router.post("/users", response_model=UserResponse, status_code=201)
@track_request("create_user")
async def create_user_endpoint(user: UserCreate, db: Session = Depends(get_db)):
    if get_user_by_username(db, user.username):
        raise HTTPException(status_code=400, detail="用户名已存在")
    if get_user_by_email(db, user.email):
        raise HTTPException(status_code=400, detail="邮箱已存在")
    db_user = create_user(db, user)
    logger.info(f"创建用户: {db_user.username} (id={db_user.id})")
    return db_user

@router.get("/users/{user_id}", response_model=UserResponse)
@track_request("get_user")
async def get_user_endpoint(user_id: int, db: Session = Depends(get_db)):
    db_user = get_user(db, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return db_user

@router.get("/users", response_model=UserListResponse)
@track_request("list_users")
async def list_users_endpoint(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    skip = (page - 1) * page_size
    total, items = get_users(db, skip=skip, limit=page_size)
    return UserListResponse(
        total=total,
        items=items,
        page=page,
        page_size=page_size,
    )

@router.put("/users/{user_id}", response_model=UserResponse)
@track_request("update_user")
async def update_user_endpoint(user_id: int, user: UserUpdate, db: Session = Depends(get_db)):
    db_user = update_user(db, user_id, user)
    if not db_user:
        raise HTTPException(status_code=404, detail="用户不存在")
    logger.info(f"更新用户: {db_user.username} (id={db_user.id})")
    return db_user

@router.delete("/users/{user_id}", status_code=204)
@track_request("delete_user")
async def delete_user_endpoint(user_id: int, db: Session = Depends(get_db)):
    if not delete_user(db, user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    logger.info(f"删除用户: id={user_id}")
