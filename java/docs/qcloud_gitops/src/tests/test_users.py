"""用户 API 测试"""
import pytest

def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "user-service"

def test_create_user(client, sample_user):
    response = client.post("/api/v1/users", json=sample_user)
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == sample_user["username"]
    assert data["email"] == sample_user["email"]
    assert data["is_active"] is True
    assert "id" in data

def test_create_duplicate_username(client, sample_user):
    client.post("/api/v1/users", json=sample_user)
    response = client.post("/api/v1/users", json=sample_user)
    assert response.status_code == 400
    assert "用户名已存在" in response.text

def test_get_user(client, sample_user):
    create_resp = client.post("/api/v1/users", json=sample_user)
    user_id = create_resp.json()["id"]
    response = client.get(f"/api/v1/users/{user_id}")
    assert response.status_code == 200
    assert response.json()["username"] == sample_user["username"]

def test_get_user_not_found(client):
    response = client.get("/api/v1/users/999")
    assert response.status_code == 404

def test_list_users(client, sample_user):
    client.post("/api/v1/users", json=sample_user)
    response = client.get("/api/v1/users")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1

def test_update_user(client, sample_user):
    create_resp = client.post("/api/v1/users", json=sample_user)
    user_id = create_resp.json()["id"]
    update_data = {"full_name": "Updated Name", "age": 30}
    response = client.put(f"/api/v1/users/{user_id}", json=update_data)
    assert response.status_code == 200
    assert response.json()["full_name"] == "Updated Name"
    assert response.json()["age"] == 30

def test_delete_user(client, sample_user):
    create_resp = client.post("/api/v1/users", json=sample_user)
    user_id = create_resp.json()["id"]
    response = client.delete(f"/api/v1/users/{user_id}")
    assert response.status_code == 204
    response = client.get(f"/api/v1/users/{user_id}")
    assert response.status_code == 404

def test_metrics_endpoint(client):
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "user_service_users_total" in response.text
