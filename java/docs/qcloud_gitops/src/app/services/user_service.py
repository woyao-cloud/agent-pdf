"""用户业务逻辑层"""
from sqlalchemy.orm import Session
from app.crud import get_user, get_user_by_username, get_user_by_email, get_users
from app.schemas import UserCreate, UserUpdate

class UserService:
    def __init__(self, db: Session):
        self.db = db

    def validate_unique(self, username: str = None, email: str = None, exclude_id: int = None):
        if username:
            existing = get_user_by_username(self.db, username)
            if existing and existing.id != exclude_id:
                raise ValueError(f"用户名 '{username}' 已存在")
        if email:
            existing = get_user_by_email(self.db, email)
            if existing and existing.id != exclude_id:
                raise ValueError(f"邮箱 '{email}' 已存在")
