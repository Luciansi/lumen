---
# ============================================================================
# 站点内容配置中心(全站唯一):本文件保存即生效,无需重启 dev server。
# 语法为 YAML:注释用 #;顶层键均可省略(回退代码默认值)。
# 注意:值内含 ": "(冒号后随空格)、前导 # 或特殊字符(如 URL)时请用双引号包住。
# ============================================================================

# ===== 站点 =====
site:
  title: Lumen            # 浏览器标题 · 导航 Logo · OG site_name
  subtitle: "Blog & Knowledge Base"
  lang: en                # UI 语言:en | zh_CN | zh_TW | ja | ko | es | th | vi | tr | id
                          # (改 lang 后全站 SSR 文案即时切换;非法值回退 en 并告警)

# ===== 主题 =====
themeColor:
  hue: 250                # 主题强调色相 0–360:red:0 teal:200 cyan:250 pink:345
  fixed: false            # true = 隐藏访客色相取色器按钮

# ===== 首页横幅图 =====
banner:
  enable: false
  src: assets/images/demo-banner.png   # 以 / 开头 → 相对 public/;否则相对 src/
  position: center        # top | center | bottom(等效 object-position)
  credit:                 # 横幅版权标注(仅在 enable 且下方 enable 时显示)
    enable: false
    text: ""              # 标注文字
    url: ""               # (可选)原图/作者链接

# ===== 文章目录(右侧 TOC 卡)=====
toc:
  enable: true
  depth: 2                # 最大标题层级 1–3(知识库笔记固定全列,不受此限制)

# ===== 知识库图谱(笔记右栏)=====
graph:
  enable: true
  localDepth: 2           # 本地图展开广度 1–3
  showTags: false         # 是否显示标签伪节点

# ===== 站点图标(favicon)=====
favicon: []               # 留空 = 内置默认(public/favicon/ 的明暗双 SVG)。
                          # 需要自定义时按下面格式写:
# favicon:
#   - src: /favicon/favicon-light.svg   # 以 / 开头 → 相对 public/
#     theme: light                      # (可选) light | dark,浏览器按系统主题二选一
#     sizes: 32x32                      # (可选)仅对位图有意义

# ===== 顶部导航 =====
nav:
  # 预设项文案随界面语言自动翻译(home | archive | about);
  # 自定义项 name/url 必填,external: true = 新标签打开 + 外链图标。
  # 缺省或留空列表 → 回退默认(Home/Archive/About/GitHub),请勿清空导航。
  links:
    - preset: home
    - preset: archive
    - preset: about
    - name: GitHub
      url: "https://github.com/Luciansi/lumen"
      external: true
  vaultLinksBefore: about # 知识库链接(每座库自动生成一项)的插入点:
                          # 填预设名(home/archive/about)或某个链接的显示名;
                          # 省略或不匹配 → 追加到末尾

# ===== 文章许可协议(文章页脚)=====
license:
  enable: true
  name: CC BY-NC-SA 4.0
  url: "https://creativecommons.org/licenses/by-nc-sa/4.0/"

# ===== 个人卡(主页 hero / 侧栏)=====
profile:
  name: Lumen
  tagline: The wind stripped the trees last night. I stand alone up here, looking as far as I can see.
  bio: "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
  avatar: assets/images/avatar.jpeg   # 留空("")→ 首字母渐变色头像;否则相对 src/
  socials:                # 社交小按钮;写成 [] 可隐藏
    - name: GitHub
      icon: fa6-brands:github
      url: "https://github.com/Luciansi/lumen"

# ===== 首页界面文案(整块可选)=====
# 省略时随 lang 自动取默认集(zh_CN/zh_TW → 中文,其余 → 英文);
# 需要定制才取消注释,注释中标注默认值:中文 / 英文。
# ui:
#   statArticles: 篇文章        # 篇文章 / Posts
#   statWords: 字数             # 字数 / Words
#   statCategories: 个分类       # 个分类 / Categories
#   statTags: 个标签            # 个标签 / Tags
#   sectionAll: 全部文章         # 全部文章 / All Posts
#   sectionCategories: 分类      # 分类 / Categories
#   sectionTags: 标签           # 标签 / Tags
#   sectionRecommend: 推荐      # 推荐 / Recommend
#   searchPlaceholder: 搜索标题、标签或分类…   # 搜索… / Search titles, tags or categories…
#   found: 找到 {n} 篇           # 找到 {n} 篇 / Found {n} items
#   noResult: 没有匹配的文章，换个关键词试试   # 没有… / No matching content — try another keyword
#   wordUnit: 字                # 字 / words
#   minuteUnit: 分钟             # 分钟 / minutes
---

# 文章总览（全部文章展示顺序：列出者在前按此序，未列出者按日期续后；留空则用默认排序）

- [Getting Started with Lumen](/showcase/guide/)
- [Writing Content](/showcase/writing-content/)
- [Markdown Basics](/showcase/markdown/)
- [Markdown Extended Features](/showcase/markdown-extended/)
- [Expressive Code in Lumen](/showcase/expressive-code/)
- [Code Styler Demo](/showcase/code-styler/)
- [Image Converter Demo](/showcase/image-converter/)
- [Embedding Video](/showcase/video/)
- [Site Configuration](/showcase/site-configuration/)
- [Knowledge Vaults](/showcase/knowledge-vaults/)
- [Knowledge Graph](/showcase/knowledge-graph/)
- [Publishing Workflow](/showcase/publishing-workflow/)
- [Quartz Pipeline Features](/showcase/quartz-features/)
- [Quartz Target](/showcase/quartz-target/)
- [Draft Example](/showcase/draft/)

# 推荐（首页右侧推荐卡内容，每行一条 `- [标题](链接)`）

- [Showcase](/showcase/)
- [Getting Started with Lumen](/showcase/guide/)
- [Writing Content](/showcase/writing-content/)
- [Code Styler Demo](/showcase/code-styler/)
- [Quartz Pipeline Features](/showcase/quartz-features/)

