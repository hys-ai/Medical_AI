# 请求管理员权限，放行 7860 端口的入站连接（内网演示用）
# 用法：双击仓库根目录的「开放内网访问.bat」
$ErrorActionPreference = "Stop"
$port = 7860
$name = "MedNexus $port"

Write-Host "正在请求管理员权限，放行 TCP $port 入站……"
$netshArgs = @(
    "advfirewall", "firewall", "add", "rule",
    "name=$name", "dir=in", "action=allow", "protocol=TCP",
    "localport=$port", "profile=any"
)
try {
    Start-Process -FilePath "netsh.exe" -ArgumentList $netshArgs -Verb RunAs -Wait -ErrorAction Stop
    Write-Host "已提交防火墙规则：$name" -ForegroundColor Green
} catch {
    Write-Host "未获得管理员权限或被取消：$($_.Exception.Message)" -ForegroundColor Red
    Write-Host "也可以手动放行：Windows 安全中心 → 防火墙和网络保护 → 高级设置 → 入站规则 → 新建规则 → 端口 → TCP 7860 → 允许"
    Read-Host "按回车关闭"
    exit 1
}

Write-Host ""
Write-Host "当前规则状态：" -ForegroundColor Cyan
& netsh advfirewall firewall show rule name="$name" | Select-Object -First 12
Write-Host ""
Write-Host "接下来："
Write-Host "  1) 保持 python server.py 7860 --host 0.0.0.0 运行"
Write-Host "  2) 把 http://<你的内网IP>:7860 发给同学"
Write-Host "  3) 查看本机内网 IP：ipconfig | findstr IPv4"
Read-Host "按回车关闭"
