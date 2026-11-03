# 用户研究：另一台电脑部署说明

## 1. 运行环境

- Windows、macOS 或 Linux 电脑；建议用 Windows 电脑作为收集端。
- Python 3.9 或更高版本，安装时勾选 Add Python to PATH；无需 pip 安装任何第三方包。
- 参与者仅需现代浏览器，不需要安装 Python。
- 服务器电脑连接该大学校园网，参与者与它的网络需要允许互访。
- 解压目录需要有写入权限。收集期间保持电脑开机、不休眠，并保持启动窗口打开。

不需要 Node.js、数据库、Pillow、VPN、构建步骤或管理员权限来运行程序。防火墙放行可能需要设备管理员权限。

## 2. 最简结构

```text
user-study-deploy/
├─ start-windows.cmd    # Windows 双击启动
├─ README.md            # 本说明
├─ study_server.py      # 网页服务、保存接口、CSV 汇总
└─ study-site/
   ├─ index.html
   ├─ styles.css
   ├─ app.js
   ├─ sync.js
   ├─ data.js
   └─ assets/           # 10 个样例、60 张 WebP 和对应 prompt
```

第一次启动自动创建以下目录，不需要手工创建，也不要从其他部署复制旧数据：

```text
study-data/
├─ results.csv         # 所有参与者的评分汇总
└─ sessions/           # 每人的持久进度 JSON
```

## 3. 启动

先完整解压压缩包，不要直接在压缩包预览窗口中运行文件。

Windows：双击 `start-windows.cmd`。如果无法启动，在此目录打开终端运行：

```powershell
python --version
python study_server.py --port 8080
```

安装了 Python Launcher 的 Windows 电脑也可以使用：

```powershell
py -3 study_server.py --port 8080
```

macOS / Linux：

```sh
python3 study_server.py --port 8080
```

先在服务器电脑浏览器访问 `http://localhost:8080`，确认页面能够打开。

## 4. 分享给参与者

在 Windows 终端执行 `ipconfig`，找到实际连接校园网的 WLAN 或以太网适配器的 IPv4 地址，不要使用 VPN、虚拟机适配器地址，也不要把 0.0.0.0 或 localhost 发给参与者。

例如该电脑 IPv4 为 `10.20.30.40`，则分享：

```text
http://10.20.30.40:8080/
```

Windows 防火墙如果提示 Python 网络访问，请按学校和设备的网络策略允许当前校园网连接。不要关闭整个防火墙。若本机能访问、他人不能访问，应检查 Python 的 TCP 8080 入站访问规则及校园网设备隔离。

参与者在 Windows 上可运行 `Test-NetConnection 服务器IP -Port 8080` 辅助排查。仅仅连接同一所大学的校园网，不能保证不同楼宇或不同子网之间互通。

如 8080 被其他程序占用，可改用 `python study_server.py --port 8081`，并将分享链接端口改为 8081。

## 5. 试运行与收集

1. 在另一台设备打开分享链接，输入用户名并完成一道题。
2. 等待页面显示“进度已保存到研究者电脑”。
3. 在服务器电脑检查 `study-data/results.csv` 是否出现记录。
4. 关闭参与者页面后，用同一浏览器和同一地址打开，点击“继续上次评价”，确认答案及 A–E 顺序保持不变。
5. 完成全部题目，确认页面显示完整提交成功，CSV 中该参与者的 `completed` 为 `True`。

中断续评依赖同一浏览器保存的参与标识。不要清除浏览器数据；更换设备、浏览器或服务器地址不能自动续评。用户名相同不代表同一参与记录。

## 6. 取回结果和停止服务

- 评分自动集中写入服务器电脑上的 `study-data/results.csv`，不需要参与者下载或发送文件。
- 统计完整问卷时筛选 `completed=True`，其他记录是未完成草稿。三个评价维度记录真实方法名称。
- 收集结束后，在启动窗口按 Ctrl+C 停止服务，然后复制整个 `study-data` 目录给研究者或备份。
- Excel 可能占用 CSV 文件，收集期间尽量不要一直打开它。即便 CSV 被占用，JSON 进度仍会保存；关闭 Excel 后，下一次保存或重启服务会重建汇总 CSV。
- 重新启动程序不会清空已有数据。
- 不同学校分别部署时，各自拥有独立的数据目录，结果不会自动相互同步。请分别收集并保留学校/部署来源。

仅用于可信校园网内的小规模研究，不应直接作为公网服务暴露。
