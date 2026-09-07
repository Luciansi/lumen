# Lumen

> **Blog & Knowledge Base** —— 一个内容模型、纯静态的个人站点：用 Obsidian 风格 Markdown 写作，自动成为博客 + Wiki + 知识图谱。

![Lumen 首页](screenshots/home-light.png)

**Lumen** 基于 [Astro](https://astro.build) 与博客模板 [Fuwari](https://github.com/saicaca/fuwari) 深度定制：内置一条 Quartz 风格的 Markdown 渲染管线（wikilink / Callout / KaTeX / mermaid / 代码增强），并围绕「**目录即一切**」的内容模型重构——没有专门的「博客文章」集合，没有默认知识库，甚至没有独立的页面模板：配置、页面、文章、笔记全部是 `src/content/` 里的 Markdown，其余交给代码自动推导。

<p align="center">
  <img src="screenshots/reading-dark.png" width="32%" alt="阅读页（暗色）" />
  <img src="screenshots/knowledge-drawer.png" width="32%" alt="知识库笔记抽屉" />
  <img src="screenshots/graph.png" width="32%" alt="知识图谱" />
</p>

⚡ 纯静态输出（可放任何静态托管） · 📝 Obsidian 语法原样写作 · 🔍 全文搜索 · 🕸 知识图谱 · ⚙️ 单文件配置热生效

---

## 🖼 界面预览

移动端单列总览、全文搜索面板与扩展语法排版：

<p align="center">
  <img src="screenshots/overview-mobile.png" width="30%" alt="移动端首页单列总览（占位图）" />
  <img src="screenshots/search-light.png" width="30%" alt="Pagefind 全文搜索面板（占位图）" />
  <img src="screenshots/markdown-light.png" width="30%" alt="Callout / 公式 / mermaid 排版（占位图）" />
</p>

代码块增强（行号/高亮/标题，明暗双主题）、按年份分组的归档页，以及「目录即页面」的 about：

<p align="center">
  <img src="screenshots/code-dark.png" width="30%" alt="代码块明暗双主题高亮（占位图）" />
  <img src="screenshots/archive-light.png" width="30%" alt="归档页按年份分组（占位图）" />
  <img src="screenshots/extended-light.png" width="30%" alt="extended 为目录根 index.md（占位图）" />
</p>

> 📷 上排为**占位图**。替换为实机截图:把同名 PNG 放入 `screenshots/` 即自动生效(README 引用同名文件);占位图可用 `node scripts/gen-readme-screenshots.mjs` 一键重新生成。

---

## 🗺 内容模型：一切皆 Markdown

| 想做什么 | 做法 | 结果 |
| --- | --- | --- |
| 站点配置 | 编辑 `src/content/index.md`（YAML + 正文列表） | 标题、主题、导航、许可……保存即生效 |
| 一篇文章 | 任意 vault 笔记 frontmatter 加 `published:` | 进首页总览 / 归档 / RSS，自动获得文章页眉、许可卡、结构化数据与上一篇/下一篇 |
| 一个静态页 | `src/content/<名字>/index.md` | 直接成为 `/<名字>/`（`/about/` 就是这么来的） |
| 一座知识库 | `mkdir src/content/<库名>` | 集合、路由、导航、图谱节点全部自动注册 |
| 一篇知识笔记 | 往库里丢一个 `.md`（任意层级、支持中文名） | `/<库slug>/<slug>/` 立即可读 |

规则只有一条：**目录 = 路由，目录根 `index.md` = 页面**。除真实代码路由（`archive`）外没有任何保留名；库目录、文章、页面之间没有任何区别对待。

## ✨ 功能特性

### 📝 Quartz 风格 Markdown 渲染管线

所有笔记共用同一条基于 unified 的管线（`@quartz-community/*` 插件 + 仓库内适配层，见 `src/integrations/quartz-pipeline/`）：

- **Obsidian 风格语法**：`[[wikilink]]`（跨库、按别名/文件名解析）、`![[嵌入]]` 转译、Callout / Admonition、高亮标记、块引用
- **数学与图表**：LaTeX（KaTeX 渲染，自动排除出 Pagefind 索引）、Mermaid（可全屏）、GFM、smartypants
- **标题系统**：自动锚点、sectionize 段落结构、站内目录（知识笔记右侧栏全层级列出）
- **代码块**：明暗双主题高亮、移植的 code-styler 方言（行号、高亮行、行区间、标题、折叠……）、行内代码样式
- **图片**：仓库内/嵌入图片路径解析与守护（大小写不敏感兜底查找）、移植的 image-converter（对齐/尺寸/圆角标记）
- **其他**：指令式组件（`:github` 仓库卡片等）、raw HTML 保留（视频/iframe 直接粘贴）

### 🗄 知识库（Obsidian 风格多库）

- `src/content/` 下每个顶层目录都是一座知识库：路由 = 目录名 github-slug，中文目录/文件名自由
- 双链与嵌入**跨库解析**（构建期统一解析为目标 URL，`aliases` / `permalink` 均被理解）
- 每座库的根 `index.md` 是自动维护的库首页：带标记区域随笔记增删自动刷新，**手写内容绝不覆盖**（`pnpm index-vaults` 于 `predev`/`prebuild` 自动执行）
- **知识图谱**：全站链接数据（`/linkgraph.json`）+ 每个笔记页的本地邻域图 + `Ctrl/Cmd+G` 全局图谱（草稿在产物中自动剔除，与页面一致）
- 笔记页侧栏抽屉导航（`KbSidebarDrawer`），长笔记与深层级友好

### 🎨 博客体验

- 亮 / 暗 / 跟随系统三态主题，站点级主题色（hue）可调、访客也可自选
- swup 驱动的页面转场、缓存与预加载；响应式三栏布局
- Pagefind 全文搜索（KaTeX 噪声自动豁免）；归档页按年份分组、标签/分类过滤
- RSS / sitemap / robots.txt；图片灯箱（PhotoSwipe）
- 界面文案 10 种语言（`en / zh_CN / zh_TW / ja / ko / es / th / vi / tr / id`），随 `site.lang` 即时切换
- 文章页能力：文章页眉（字数/阅读时间/日期/分类/标签）、许可协议卡、BlogPosting 结构化数据、上一篇/下一篇

## 🚀 快速开始

要求：**Node.js ≥ 22.12**、**pnpm 9**（仓库通过 `only-allow` 强制使用 pnpm）。

```bash
git clone https://github.com/Luciansi/lumen.git
cd lumen
pnpm install
pnpm dev          # http://localhost:4321
```

生产构建（自动附带 Pagefind 索引）并本地预览：

```bash
pnpm build
pnpm preview      # 产物在 dist/
```

首次部署前记得在 `astro.config.mjs` 把 `site` 换成正式域名（canonical / RSS / sitemap 均以其为基准）。

## ✍️ 写内容

### 一篇文章 = 带日期的笔记

没有单独的「博客文章」概念。用任意方式写好一篇笔记，然后给 frontmatter 加上 `published`：

```yaml
---
title: My First Article
published: 2026-09-07        # 笔记带上它即成为「文章」
description: One line for cards and meta tags.
image: images/cover.png      # 封面: http(s):// URL、/public 路径或笔记相对路径
tags: [Foo, Bar]
category: Front-end           # 可选分组(文章页眉显示)
draft: false                 # true = 仅 dev 可见,产物/归档/搜索/图谱中剔除
original: true               # 可选: 首页列表置顶(「随笔」分类自动视同原创)
aliases: [alternate-name]    # 可选: 额外的 wikilink 目标
---
```

schema 宽松——任意 Obsidian/自定义键都会被保留（Quartz 的 `permalink`、`cssclasses`、`created`、`modified` 等也被渲染管线理解）。

### 知识库笔记

在 `src/content/` 下创建目录即建库，库内文件结构自由分层（目录总览页 = 任意目录的 `index.md`）：

- 库名/文件名均支持中文与多级路径，路由自动 github-slug 化；避免与真实页面路由（`archive`）重名
- **新库目录需重启 dev server 注册**（集合与导航按目录自动推导）；已注册库内新增文件即时生效
- 用 [Obsidian](https://obsidian.md) 直接打开 `src/content/` 写作即可，或使用命令：

| 命令 | 作用 |
| --- | --- |
| `pnpm new-note <库名>` | 交互式向导：选位置/分类路径 → 目录总览页或独立笔记 → 空白/标准/教程模板；自动做文件名与 slug 冲突校验，中断不留脏文件 |
| `pnpm index-vaults` | 手动刷新全部库首页的自动索引区域 |

## ⚙️ 配置中心（`src/content/index.md`）

全站配置集中在这一个文件（正文还承载首页「文章总览顺序」与「推荐卡片」列表），保存即生效、无需重启：

| 分组 | 控制 |
| --- | --- |
| `site` | 浏览器标题 / 副标题 / UI 语言 |
| `themeColor` | 主题色相 `0–360`、是否允许访客自选 |
| `banner` | 首页横幅图、对齐方式与版权标注 |
| `toc` / `graph` | 目录开关与深度 / 图谱开关与邻域广度、标签伪节点 |
| `favicon` | 亮暗主题图标（留空用内置） |
| `nav` | 导航链接：自动翻译的预设（home/archive/about）+ 自定义项 + 知识库链接插入点 |
| `license` / `profile` | 文章页脚许可协议 / 主页个人卡（头像、社交按钮） |
| `ui` | 可选首页文案覆盖（缺省随语言自动取默认集） |

> 少数设置仍在代码侧：渲染管线配置（`src/integrations/quartz-pipeline/config.ts`）与 `astro.config.mjs`（`site` 域名、`base` 子路径、集成项）——改它们需要重启 dev server。

## 📖 内置文档（showcase 示例库）

`src/content/showcase/` 是一套**可运行的引导与功能演示**——笔记本身即文档，构建后站内浏览 `/showcase/`。建议从首页的阅读路径（guide → writing-content → knowledge-vaults → site-configuration）进入，各篇内容速览：

| 文档 | 主题 |
| --- | --- |
| `guide` | 上手：内容地图、常用 frontmatter、日常命令、首日清单 |
| `writing-content` | 写作语法全解：wikilink/嵌入/Callout/代码块/图片指令 |
| `markdown` / `markdown-extended` | 基础与扩展 Markdown（表格、脚注、删除线、属性列表……） |
| `expressive-code` / `code-styler` / `image-converter` | 代码块与图片方言：与上游表达式的对照、参数与坑 |
| `video` | YouTube / Bilibili 视频嵌入 |
| `knowledge-vaults` / `knowledge-graph` | 库模型与图谱机制 |
| `site-configuration` | 配置文件逐项说明 |
| `publishing-workflow` | 构建、搜索索引与部署 |
| `quartz-features` / `quartz-target` | 渲染管线回归测试页与转译锚点(夹具) |
| `draft` | 草稿机制活演示（dev 可见、产物不可见） |

## 📦 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 本地开发（启动前自动刷新库索引） |
| `pnpm build` | 生产构建 + Pagefind 索引 → `dist/` |
| `pnpm preview` | 本地预览构建产物 |
| `pnpm check` / `pnpm type-check` | Astro 内容与类型校验 / TypeScript 检查 |
| `pnpm new-note <库名>` | 向既有库写入笔记或目录总览页（交互向导） |
| `pnpm index-vaults` | 刷新全部库的自动索引 |
| `pnpm format` / `pnpm lint` | Biome 格式化 / 检查（--write） |
| `node scripts/gen-readme-screenshots.mjs` | 重新生成 README 占位截图 |

## 🗂 目录结构

```
lumen/
├── astro.config.mjs            # site/base、swup/astro-icon/quartz-pipeline/svelte/sitemap
├── src/
│   ├── content/                # 全部内容与站点配置(目录即库)
│   │   ├── index.md            #   配置中心 + 首页总览/推荐排序
│   │   ├── about/              #   静态页示例: 目录 + 根 index.md = /about/
│   │   └── showcase/…          #   内置文档示例库(每座库一个顶层目录)
│   ├── integrations/quartz-pipeline/  # Quartz 渲染管线: Astro 集成 + 适配插件
│   ├── pages/                  # 路由: 首页/归档/[vault]/…slug/linkgraph/rss/sitemap
│   ├── content.config.ts       # 集合注册(每库一个,随目录自动推导)
│   ├── components/  layouts/   # Astro + Svelte 组件与布局
│   └── styles/  i18n/  utils/  constants/  types/
├── scripts/                    # 写作向导、索引刷新、示例资产生成
├── public/                     # 静态资源(favicon 等)
└── docs/                       # 截图、中文版 README 与上游模板 README 译文
```

## 🧰 技术栈

[Astro](https://astro.build) 7（unified 管线）· [Tailwind CSS](https://tailwindcss.com) 4 · [Svelte](https://svelte.dev) 5 · TypeScript strict；[Pagefind](https://pagefind.app)（搜索）、[swup](https://swup.js.org)（转场）、KaTeX、Mermaid、PhotoSwipe、d3 + PixiJS（图谱，按需加载）；`@quartz-community/*` Markdown 生态；[Biome](https://biomejs.dev)（格式化与 lint）；pnpm。

## ☁️ 部署

`dist/` 是纯静态产物（含 Pagefind 索引），无任何服务端运行时：

- **Vercel**：`vercel.json` 留空即可，构建命令 `pnpm build`、输出目录 `dist`
- Netlify / Cloudflare Pages / GitHub Pages / 任意静态托管同理
- 子路径部署只需设置 `astro.config.mjs` 的 `base`，站内链接自动加上前缀

## ❓ 常见问题

- **为什么没有 `posts` 集合 / `new-post` 命令？** 因为不需要：带 `published` 日期的笔记就是文章，文章能力（许可卡、JSON-LD、上一篇/下一篇）已内建在笔记页。单一模型换掉的是首页/归档/RSS 里成套的「post vs note」分支。
- **新建库后页面 404？** 集合按目录注册于 dev server 启动时：新建目录后重启一次 dev server 即可；库内新增文件无需重启。
- **想先看效果再定制？** `showcase` 库就是演示：`pnpm dev` 后访问 `/showcase/`，删除或改造它即可开始自己的站点。

## 📄 致谢与许可证

- 承自 [Fuwari](https://github.com/saicaca/fuwari)（MIT License © 2024 saicaca）
- Markdown 管线复用 [Quartz](https://quartz.jzhao.xyz) 社区生态的 `@quartz-community/*` 包；代码块/图片方言移植自 Obsidian 插件 Code Styler 与 Image Converter
- 本仓库采用 MIT License（见 [LICENSE](../LICENSE)，保留上游版权声明）；`docs/` 内含上游模板 README 的多语言译文（以原模板为准）
