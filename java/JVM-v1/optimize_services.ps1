# 以管理员身份运行此脚本
Write-Host "=== 禁用不必要的 Windows 服务 ==="

# 1. Windows Search (索引) - 搜索很快但持续占用资源
Stop-Service WSearch -Force -ErrorAction SilentlyContinue
Set-Service WSearch -StartupType Disabled -ErrorAction SilentlyContinue
Write-Host "✅ Windows Search (索引) 已禁用，节省 CPU/磁盘"

# 2. SysMain (Superfetch) - SSD 上无需预取
Stop-Service SysMain -Force -ErrorAction SilentlyContinue
Set-Service SysMain -StartupType Disabled -ErrorAction SilentlyContinue
Write-Host "✅ SysMain (Superfetch) 已禁用"

# 3. 传递优化 (P2P 更新分发)
Stop-Service DoSvc -Force -ErrorAction SilentlyContinue
Set-Service DoSvc -StartupType Disabled -ErrorAction SilentlyContinue
Write-Host "✅ 传递优化 (P2P更新) 已禁用"

# 4. 清理 QQ 电脑管家残留文件夹
$qqFolder = "C:\Program Files (x86)\Tencent\QQPCMgr"
if (Test-Path $qqFolder) {
    Remove-Item -Path $qqFolder -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✅ QQ 电脑管家残留文件夹已删除"
}

# 5. DISM 清理 WinSxS
dism /Online /Cleanup-Image /StartComponentCleanup /ResetBase
Write-Host "✅ WinSxS 已清理"

Write-Host ""
Write-Host "优化完成，重启系统后效果更佳。"