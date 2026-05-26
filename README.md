# Fanben Reader（Reader 翻本 / MVP）

Dear cieLago，这个项目是一个“精读加工流水线”的 MVP：你输入文章 URL 或粘贴英文正文，它会生成一个类似 Reader 的双语精读阅读页（段落对齐、联动高亮、划词查词、进度、生词本、简化词根词缀提示）。

> 注意：本项目默认是**匿名用户模式**（浏览器 localStorage 保存一个 `fanben_uid`），不做登录系统，先把学习闭环跑通。

---

## 1) 运行前准备

### 1.1 Node.js
需要 Node.js 18+（建议 20+）。

### 1.2 环境变量（复制一份即可）
本项目不会把任何 API Key 提交到仓库。你需要在本地创建自己的环境变量文件：

1. 复制示例文件：

```bash
cp .env.example .env
```

Windows PowerShell 也可以用：

```powershell
Copy-Item .env.example .env
```

2. 按需修改 `.env` 里的配置（至少需要 `DATABASE_URL`）。

### 1.3 PostgreSQL（推荐用 Docker）
项目使用 Prisma + PostgreSQL。

1. 启动 Docker Desktop（Windows 上请先打开 Docker Desktop）
2. 在项目根目录执行：

```bash
docker compose up -d
```

3. 生成并应用数据库迁移：

```bash
npx prisma migrate dev --name init
```

---

## 2) 启动开发服务器

```bash
npm run dev
```

浏览器打开：`http://localhost:3000`

---

## 3) 翻译服务配置

默认使用 `deepseek`（效果最好，但需要你自己提供 `DEEPSEEK_API_KEY`）。

如果你只是想先把 Demo 跑起来、不想配 API Key，可以在 `.env` 里把 `TRANSLATE_PROVIDER` 改成下面任意一个：

在 `.env` 或启动命令里设置：

```bash
TRANSLATE_PROVIDER=mock
```

可选值：
- `deepseek`（默认）
- `mymemory`（公共免费翻译接口，质量/稳定性有限）
- `mock`

当 `TRANSLATE_PROVIDER=deepseek` 时，还需要在 `.env` 中设置：

```bash
DEEPSEEK_API_KEY=你的key
```

---

## 4) 主要功能入口

- `/import`：导入文章（URL / 粘贴正文）
- `/reader/[docId]`：精读阅读页（双语/纯英、联动高亮、划词查词、生词本、进度）
- `/library`：文章库（最近导入、进度）
- `/vocab`：生词本

---

## 5) 重要的安全边界（MVP）

- URL 抓取做了 SSRF 防护（阻止 localhost/内网 IP）
- HTML 抓取大小限制（>2MB 拒绝）
- 段落渲染为纯文本（避免 XSS）
- 导入/查词接口有极简内存限流（单实例有效）
