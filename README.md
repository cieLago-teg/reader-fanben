# Fanben Reader

把英文文章加工成一个可阅读、可查词、可沉淀的双语精读工作台。

这个项目不是“翻译一下网页”那么简单，而是把一篇普通英文文章，变成接近 Reader 使用体验的学习流程：导入正文、双语对照阅读、划词即查、段落解析、生词沉淀、阅读进度记录，最后形成完整闭环。

> 注意：当前版本默认是**匿名用户模式**（浏览器 localStorage 保存一个 `fanben_uid`），不做登录系统，先把学习闭环跑通。

---

## 1) 项目预览

### 1.1 文章库总览

<p align="center">
  <img src="docs/screenshots/library-overview.png" alt="Fanben Reader 文章库页面" width="100%" />
</p>

文章导入后会进入文章库，展示阅读进度、解析状态和文章列表，用户可以快速回到上次阅读位置。

### 1.2 双语精读阅读页

<p align="center">
  <img src="docs/screenshots/reader-bilingual.png" alt="Fanben Reader 双语精读页面" width="100%" />
</p>

用户进入阅读页后，可以直接看到英文原文与中文译文的对照结果，并在同一页面完成精读。

### 1.3 学习侧栏与段落解析

<p align="center">
  <img src="docs/screenshots/study-rail.png" alt="Fanben Reader 学习侧栏与段落解析" width="100%" />
</p>

阅读过程中，右侧学习侧栏会同步展示段落解析、重点句说明和学习辅助信息，避免频繁切页。

---

## 2) 非技术视角下，这个项目在做什么

- 把原始英文文章加工成一个更容易精读的阅读界面，而不是只给一段机翻结果。
- 让用户在阅读过程中直接完成“看懂内容、查词、理解难句、保存重点”的连续动作。
- 目标用户是想认真读英文内容的人，比如看技术博客、专栏、行业文章、学术新闻的人。
- 这个项目强调的是“学习体验设计 + AI 辅助能力落地”，而不是单点功能堆砌。

---

## 3) 这个项目能直观证明什么

- **产品感**：不是做一个零散工具页，而是围绕真实学习流程设计“导入 -> 阅读 -> 查词 -> 沉淀 -> 回看”的完整闭环。
- **AI 应用落地能力**：把翻译、词典查询、句子解析等能力组织成实际可用的学习产品，而不是只调用一次模型接口。
- **前端体验能力**：阅读页、学习侧栏、文章库、生词本形成一致的交互逻辑，重点服务“长时间阅读”的场景。
- **工程实现能力**：项目包含数据库、接口、安全边界、内容抽取、状态管理和基础测试，不只是一个静态页面 Demo。

---

## 4) 技术实现概览

- 前端：Next.js + TypeScript + Tailwind CSS
- 数据层：Prisma + PostgreSQL
- AI / 数据能力：DeepSeek、词典 API、正文抽取、句子拆分、段落对齐
- 学习闭环：文章库、阅读进度、划词查词、生词本、段落解析
- 工程边界：SSRF 防护、HTML 抓取大小限制、极简限流、基础测试覆盖

---

## 5) 运行前准备

### 5.1 Node.js
需要 Node.js 18+（建议 20+）。

### 5.2 环境变量（复制一份即可）
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

### 5.3 PostgreSQL（推荐用 Docker）
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

## 6) 启动开发服务器

```bash
npm run dev
```

浏览器打开：`http://localhost:3000`

---

## 7) 翻译服务配置

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

## 8) 主要功能入口

- `/import`：导入文章（URL / 粘贴正文）
- `/reader/[docId]`：精读阅读页（双语/纯英、联动高亮、划词查词、生词本、进度）
- `/library`：文章库（最近导入、进度）
- `/vocab`：生词本

---

## 9) 重要的安全边界（MVP）

- URL 抓取做了 SSRF 防护（阻止 localhost/内网 IP）
- HTML 抓取大小限制（>2MB 拒绝）
- 段落渲染为纯文本（避免 XSS）
- 导入/查词接口有极简内存限流（单实例有效）
