#!/usr/bin/env python3
"""通知脚本 - 邮件/企业微信"""
import os
import smtplib
from email.mime.text import MIMEText
import requests
import json

class Notifier:
    def __init__(self):
        self.smtp_host = os.getenv("SMTP_HOST", "smtp.example.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "")
        self.smtp_pass = os.getenv("SMTP_PASS", "")
        self.wecom_webhook = os.getenv("WECOM_WEBHOOK_URL", "")
    
    def send_email(self, subject, body, to_emails):
        msg = MIMEText(body, "html", "utf-8")
        msg["Subject"] = subject
        msg["From"] = self.smtp_user
        msg["To"] = ", ".join(to_emails)
        
        try:
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_pass)
                server.sendmail(self.smtp_user, to_emails, msg.as_string())
            print(f"[通知] 邮件已发送: {subject}")
        except Exception as e:
            print(f"[通知] 邮件发送失败: {e}")
    
    def send_wecom(self, content):
        if not self.wecom_webhook:
            return
        data = {"msgtype": "markdown", "markdown": {"content": content}}
        try:
            requests.post(self.wecom_webhook, json=data, timeout=5)
            print(f"[通知] 企业微信已发送")
        except Exception as e:
            print(f"[通知] 企业微信发送失败: {e}")
    
    def notify_deploy(self, env, tag, status):
        subject = f"[GitOps] {env} 部署 {status}: user-service@{tag}"
        body = f"""
        <h2>GitOps 部署通知</h2>
        <p><b>服务:</b> user-service</p>
        <p><b>环境:</b> {env}</p>
        <p><b>版本:</b> {tag}</p>
        <p><b>状态:</b> {status}</p>
        """
        self.send_email(subject, body, ["sre@example.com"])
        wecom_content = f"## GitOps 部署通知\n- **服务**: user-service\n- **环境**: {env}\n- **版本**: {tag}\n- **状态**: {status}"
        self.send_wecom(wecom_content)

if __name__ == "__main__":
    import sys
    notifier = Notifier()
    if len(sys.argv) > 3:
        notifier.notify_deploy(sys.argv[1], sys.argv[2], sys.argv[3])
