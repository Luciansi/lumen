/* 知识库「新建笔记」交互式向导。
 *
 * 用法(仓库根目录): pnpm new-note <库目录名>
 *
 * <库目录名> 是 src/content/ 下的一座已存在知识库。
 * 任何一个顶层目录都是一座独立的知识库,渲染在 /<库路由>/… 下
 * (路由 = 目录名 github-slug,与 src/utils/vaults.ts 的规则一致)。
 * 库 = 目录,新增库直接手动创建 src/content/<库名>/ 目录即可(集合与导航
 * 随目录自动注册,dev server 重启后生效)——本向导只负责往既有库里写笔记。
 *
 * 面向不熟悉本项目结构/路由/命名规则的人:
 *   - 通过问答选择放置位置(vault 根 / 顶层分类 / 新建多级分类路径,支持中文);
 *   - 可选择创建「目录总览页 index.md」(该目录本身成为一页,
 *     /<库路由>/<目录路径>/),或「独立笔记」;
 *   - 独立笔记可选模板:空白 / 标准 / 教程;
 *   - 自动做文件名合法性校验与全库 slug 冲突检测(撞车会导致构建失败);
 *   - 确认无误才写文件(中途 Ctrl+C / 输入中断不会留下任何文件或空目录);
 *   - 创建后自动刷新所在目录总览页的子笔记列表,并运行
 *     scripts/generate-knowledge-index.mjs 刷新该库首页索引。
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { slug as githubSlug } from "github-slugger";
import matter from "gray-matter";
import {
  CONTENT_ROOT,
  FORBIDDEN_SEG,
  vaultRouteOf,
} from "./vault-scaffold.mjs";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const GENERATOR = path.join(SCRIPTS_DIR, "generate-knowledge-index.mjs");

// ---- vault target(规则集中在 scripts/vault-scaffold.mjs,与 src/utils/vaults.ts 一致) ----
const VAULT_ARG = (process.argv[2] ?? "").trim();
const VAULT_DIR = VAULT_ARG; // 库目录名(src/content/ 下)
const URL_ROOT = vaultRouteOf(VAULT_DIR);
const KB_ROOT = path.join(CONTENT_ROOT, VAULT_DIR);
const KB_DISPLAY = `src/content/${VAULT_DIR}`; // 打印用相对路径

const CHILDREN_START = "<!-- auto-children:start -->";
const CHILDREN_END = "<!-- auto-children:end -->";
const MAX_ATTEMPTS = 5; // 单道问题最多重试次数,超限优雅退出

/* ---------- 文件系统与 slug 工具(与 Astro 内容集合规则一致) ---------- */

/** 递归收集 vault 内全部 .md 的相对路径(跳过点开头文件/目录)。 */
function listMdFiles(dir = KB_ROOT, base = "", out = []) {
  if (!fs.existsSync(dir)) return out; // 库目录缺失时视为空(main 已拦截)
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listMdFiles(full, path.posix.join(base, entry.name), out);
    else if (entry.name.endsWith(".md")) out.push(path.posix.join(base, entry.name));
  }
  return out;
}

/**
 * 按 Astro 内容集合规则计算 vault 相对路径的页面 slug:
 * 去掉扩展名 → 逐段 github-slugger(小写/去点号/保留 CJK)→ 丢弃尾部 "/index"
 * (目录总览页 = 父目录);根目录 index.md → 空串(即 /{URL_ROOT}/ 首页)。
 */
function slugOfRel(rel) {
  const segs = rel.replace(/\.(md|mdx)$/i, "").split("/");
  let joined = segs.map((s) => githubSlug(s)).join("/");
  if (joined.endsWith("/index")) joined = joined.slice(0, -"/index".length);
  if (joined === "index") joined = "";
  return joined;
}

/** 页面完整 URL(/{URL_ROOT}/…/,trailingSlash: "always")。 */
function urlForRel(rel) {
  return `/${URL_ROOT}/${slugOfRel(rel)}/`.replace(/\/{2,}/g, "/");
}

const ciCmp = (a, b) => {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la < lb ? -1 : la > lb ? 1 : 0;
};

/** 顶层分类目录名(字母序,大小写不敏感)。 */
function topLevelDirs() {
  if (!fs.existsSync(KB_ROOT)) return [];
  return fs
    .readdirSync(KB_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort(ciCmp);
}

/** 递归统计某目录内笔记数。 */
function countMdIn(relDir) {
  return listMdFiles(path.join(KB_ROOT, relDir)).length;
}

/** 某目录的直接子笔记(不含目录、不含 index.md、跳过点开头)。 */
function directChildNotes(relDir) {
  const abs = path.join(KB_ROOT, relDir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md") && !e.name.startsWith("."))
    .map((e) => e.name.slice(0, -".md".length))
    .filter((n) => n.toLowerCase() !== "index")
    .sort(ciCmp);
}

/** 全库 slug → 冲突文件列表(构建期重复静态路径是硬错误,必须前置拦截)。 */
const existingSlugMap = (() => {
  const map = new Map();
  for (const rel of listMdFiles()) {
    const slug = slugOfRel(rel);
    if (!map.has(slug)) map.set(slug, []);
    map.get(slug).push(rel);
  }
  return map;
})();

/* ---------- 交互基础设施(按行队列消费 stdin) ----------
 * 不用 rl.question():管道输入整块到达时,question() 只挂一次 'line' 监听,
 * 后续缓冲的行会全部丢失(readline 不排队)。这里自己维护行队列,
 * 并显式记录 EOF —— 避免输入耗尽时挂死或提前误判"已取消"。 */

let stdinEnded = false;
let lineQueue = [];
let waiter = null;
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (waiter) {
    const w = waiter;
    waiter = null;
    w(line);
  } else {
    lineQueue.push(line);
  }
});
const nextLine = () =>
  new Promise((resolve) => {
    if (stdinEnded) return resolve(null);
    if (lineQueue.length > 0) return resolve(lineQueue.shift());
    waiter = resolve;
  });
process.stdin.on("end", () => {
  stdinEnded = true;
  if (waiter) {
    const w = waiter;
    waiter = null;
    w(null);
  }
});

let finished = false;
/** 优雅退出(打印消息,exit 0);确认开始写文件后置位,不再响应取消。 */
function bail(msg) {
  if (finished) return;
  finished = true;
  if (msg) console.log(msg);
  rl.close();
  process.exit(0);
}
rl.on("SIGINT", () => bail("\n已取消,未创建任何文件。"));
const EOF_MSG = "\n输入已结束(回答不足),已取消,未创建任何文件。";

async function askRaw(prompt) {
  process.stdout.write(prompt);
  const line = await nextLine();
  if (line === null) bail(EOF_MSG);
  return line ?? "";
}

/** 选择型:返回序号(from..to,含);空输入走 defaultVal(若有);非法重问。 */
async function askRange(prompt, from, to, defaultVal = null) {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const raw = (await askRaw(prompt)).trim();
    if (raw === "") {
      if (defaultVal !== null) return defaultVal;
      console.log(`输入不能为空,请输入 ${from}–${to} 之间的序号。`);
      continue;
    }
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      if (n >= from && n <= to) return n;
    }
    console.log(`输入无效,请输入 ${from}–${to} 之间的序号。`);
  }
  bail("\n重试次数过多,已取消,未创建任何文件。");
  return from;
}

/** 文本型:trim 后返回;空串重问(可用 canBeEmpty 允许返回空字符串)。 */
async function askText(prompt, { canBeEmpty = false } = {}) {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const raw = (await askRaw(prompt)).trim();
    if (raw !== "" || canBeEmpty) return raw;
    console.log("输入不能为空,请重新输入。");
  }
  bail("\n重试次数过多,已取消,未创建任何文件。");
  return "";
}

/** 确认型:y/yes/是/回车(当 defaultYes)= 是;n/no/否 = 否。 */
async function askConfirm(prompt, defaultYes = true) {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const raw = (await askRaw(prompt)).trim().toLowerCase();
    if (raw === "") return defaultYes;
    if (["y", "yes", "是"].includes(raw)) return true;
    if (["n", "no", "否"].includes(raw)) return false;
    console.log('请回答 y / n(或"是"/"否")。');
  }
  bail("\n重试次数过多,已取消,未创建任何文件。");
  return false;
}

/* ---------- 名称校验 ---------- */

/** 校验单个路径段(目录段或文件名段,不含 "/")。返回错误消息或 null。 */
function validateSegment(seg, { isTitle = false } = {}) {
  if (seg === "" || /^\s+$/.test(seg)) return "不能为空或全空白";
  if (seg === "." || seg === "..") return "不能是 . 或 ..";
  if (seg.startsWith(".")) return "不能以 . 开头(点开头文件会被索引脚本跳过)";
  if (seg.endsWith(".") || seg.endsWith(" ")) return "不能以 . 或空格结尾";
  if (/[\x00-\x1f]/.test(seg)) return "不能包含控制字符";
  if (isTitle && seg.includes("/"))
    return '不能包含 "/" —— 多级目录请在"分类路径"里输入,标题本身只能是一段';
  if (FORBIDDEN_SEG.test(seg))
    return `不能包含字符 ${JSON.stringify(FORBIDDEN_SEG.source)} 中的任意一个(会破坏文件名、路径或 wikilink)`;
  if (seg.length > 120) return "太长(超过 120 字符)";
  return null;
}

/** 规范化独立笔记标题;返回 { ok, name } 或 { error }。 */
function normalizeNoteTitle(raw) {
  let name = raw.trim();
  if (/\.md$/i.test(name)) {
    name = name.slice(0, -3);
  }
  if (name.toLowerCase() === "index") {
    return { error: '不能叫 "index" —— index.md 是该目录总览页的专用名,若想给此目录建总览页,请在"页面形式"里选"总览页"' };
  }
  const err = validateSegment(name, { isTitle: true });
  if (err) return { error: `标题${err}` };
  return { ok: true, name };
}

/** 校验完整新建文件名(含目录):精确重名 / slug 撞车。返回错误消息或 null。 */
function conflictError(relDir, fileName) {
  const abs = path.join(KB_ROOT, relDir, fileName);
  if (fs.existsSync(abs)) {
    return `已存在同名文件: ${KB_DISPLAY}/${relDir ? relDir + "/" : ""}${fileName}`;
  }
  const slug = slugOfRel(`${relDir ? relDir + "/" : ""}${fileName}`);
  const clashes = (existingSlugMap.get(slug) ?? []).map((r) => path.basename(r));
  if (clashes.length > 0) {
    return `映射到同一网址(/${URL_ROOT}/${slug}/)的笔记已存在,两个文件路由相同会导致构建失败。\n    现有文件: ${clashes.join(", ")}\n    请换一个标题(文件名大小写/标点不同也可能撞车,如 vpn.md 与 VPN.md、1介绍.md 与 1.介绍.md)。`;
  }
  return null;
}

/* ---------- 内容模板 ---------- */

const yamlStr = (s) => JSON.stringify(s);

const TEMPLATES = [
  {
    name: "空白",
    desc: "无 frontmatter 的空笔记,最贴近 Obsidian 原生",
    build: () => "",
  },
  {
    name: "标准",
    desc: "带 title / description / tags / aliases",
    build: (title) =>
      `---\ntitle: ${yamlStr(title)}\ndescription: ""\ntags: []\naliases: []\n---\n\n<!-- 页面大标题已自动显示,正文请从 ## 开始写。 -->\n`,
  },
  {
    name: "教程",
    desc: "标题 + 背景 / 步骤 / 验证 / 参考 骨架",
    build: (title) =>
      `---\ntitle: ${yamlStr(title)}\n---\n\n## 背景\n\n<!-- 为什么学 / 解决什么问题 -->\n\n## 步骤\n\n<!-- 分步讲解,可插入代码块 -->\n\n## 验证\n\n<!-- 如何确认做对了:命令、现象、自测 -->\n\n## 参考\n\n<!-- - 链接或相关笔记 -->\n`,
  },
];

/**
 * auto-children 标记区:直接子笔记 wikilink 列表。
 * 用同目录 basename 写法 —— 站内链接按"相对当前文件目录"解析,这样精确命中;
 * 空目录时区域为空(不留孤零零的 ## 笔记)。
 */
function childrenRegion(relDir) {
  const children = directChildNotes(relDir);
  const inner = children.length
    ? "## 笔记\n" + children.map((c) => `- [[${c}]]`).join("\n") + "\n"
    : "";
  return `${CHILDREN_START}\n${inner}${CHILDREN_END}`;
}

/** 目录总览页 index.md 的完整内容。 */
function overviewFileContent(relDir, title, listChildren) {
  const url = urlForRel(`${relDir}/index.md`);
  const lines = [
    "---",
    `title: ${yamlStr(title)}`,
    "---",
    "",
    `<!-- 本文件是 ${relDir} 目录的总览页,网址 ${url},可在 Obsidian 中直接编辑正文。`,
  ];
  if (listChildren) {
    lines.push(
      '"auto-children" 标记区由 pnpm new-note 自动维护(本目录新增笔记后自动刷新),请勿手改。 -->',
      "",
      childrenRegion(relDir),
      "",
    );
  } else {
    lines.push(
      '若想自动罗列子笔记,请重跑 pnpm new-note 并选择"总览页"后按提示重建。 -->',
      "",
    );
  }
  return lines.join("\n");
}

/* ---------- 向导主流程 ---------- */

async function main() {
  // 库必须已存在:库 = src/content 下的顶层目录,集合与导航随目录自动注册,
  // 建库 = 手动 mkdir(dev server 重启后生效),本向导不再代建。
  if (!VAULT_DIR) {
    console.error("用法: pnpm new-note <库目录名>(src/content/ 下已存在的知识库目录)");
    process.exit(1);
  }
  if (!fs.existsSync(KB_ROOT) || !fs.statSync(KB_ROOT).isDirectory()) {
    console.error(`库目录 "${VAULT_DIR}" 不存在。`);
    console.error(`${hint}知识库 = src/content 下的一个目录(自动注册):`);
    console.error(`  请手动创建: mkdir -p ${KB_DISPLAY}`);
    console.error(`  (可选)放一个根 index.md 作为库首页 /${URL_ROOT}/;创建后重启 dev server 生效。`);
    process.exit(1);
  }
  console.log(`\n=== 新建笔记向导 · ${KB_DISPLAY}(网址 /${URL_ROOT}/…) ===\n`);

  if (!fs.existsSync(path.join(KB_ROOT, "index.md"))) {
    console.log(`注: ${KB_DISPLAY}/index.md 不存在,/${URL_ROOT}/ 将显示空库首页。\n`);
  }

  let relDir = null;
  while (relDir === null) {
    // Q1: 放置位置(0=vault 根 / 顶层分类 / 最后一项=新建或进入子目录)
    const dirs = topLevelDirs();
    console.log("笔记放在哪个位置?");
    console.log("  0) vault 根目录(直接放,与根目录笔记同级)");
    dirs.forEach((d, i) => console.log(`  ${i + 1}) ${d}(${countMdIn(d)} 篇)`));
    console.log(`  ${dirs.length + 1}) 新建分类 / 进入子目录(可输入多级路径,如 Conputer/操作系统)`);
    const pick = await askRange("请输入序号 > ", 0, dirs.length + 1);

    if (pick === 0) {
      relDir = "";
    } else if (pick <= dirs.length) {
      relDir = dirs[pick - 1];
    } else {
      // Q2: 分类路径(目标可不存在,创建延迟到最终确认之后)
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const raw = (await askText("分类路径(空行返回上一级)> ", { canBeEmpty: true })).trim();
        if (raw === "") break; // 返回 Q1 重新选择
        const parts = raw.replace(/^\/+|\/+$/g, "").split("/").filter((s) => s !== "");
        let err = null;
        if (parts.length === 0) {
          err = "路径为空,请重新输入。";
        } else {
          for (const seg of parts) {
            const e = validateSegment(seg);
            if (e) {
              err = `路径段 "${seg}"${e}。`;
              break;
            }
          }
        }
        // 祖先段不能命中已存在的"文件"
        let abs = KB_ROOT;
        for (let j = 0; j < parts.length && !err; j++) {
          abs = path.join(abs, parts[j]);
          if (j < parts.length - 1 && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
            err = `路径上的 "${parts[j]}" 是一个已存在的文件,不能作为目录。`;
          }
        }
        if (!err && parts.length > 0 && fs.existsSync(abs) && !fs.statSync(abs).isDirectory()) {
          err = `目标 "${raw}" 是一个已存在的文件,请换个路径。`;
        }
        if (!err) {
          relDir = parts.join("/");
          break;
        }
        console.log(`分类路径无效:${err}`);
      }
    }
  }

  // Q3: 页面形式(vault 根跳过:根的总览页就是 /{URL_ROOT}/ 首页 index.md)
  let form = "note"; // "overview" | "note"
  let listChildren = true;
  if (relDir !== "") {
    console.log("\n页面形式?");
    console.log(`  1) 总览页 index.md —— 目录本身成为一个页面(${urlForRel(relDir + "/index.md")})`);
    console.log("  2) 独立笔记 —— 在目录里新建一篇笔记");
    form = (await askRange("请输入序号 > ", 1, 2)) === 1 ? "overview" : "note";
  }

  let fileName = "";
  let templateIdx = -1;
  let rebuildExistingOverview = false;
  const indexAbs = path.join(KB_ROOT, relDir, "index.md");
  const indexExists = relDir !== "" && fs.existsSync(indexAbs);

  if (form === "overview" && indexExists) {
    // 已有总览页:只做"更新列表"或"整文件重建"(均需确认),不悄悄覆盖未知内容
    console.log(`\n该目录已有总览页:${urlForRel(relDir + "/index.md")}`);
    const content = fs.readFileSync(indexAbs, "utf8");
    if (content.includes(CHILDREN_START) && content.includes(CHILDREN_END)) {
      if (await askConfirm("\n是否刷新其中的子笔记列表?[Y/n] > ", true)) {
        fileName = "index.md";
        rebuildExistingOverview = true;
      } else {
        return bail("\n未做任何修改。");
      }
    } else {
      console.log("现有 index.md 没有 auto-children 标记,无法只刷新列表。");
      if (await askConfirm("要整文件重建为带自动罗列的形式吗?会覆盖手写正文与 frontmatter[y/N] > ", false)) {
        fileName = "index.md";
        rebuildExistingOverview = true;
      } else {
        return bail("\n未做任何修改。");
      }
    }
  } else if (form === "overview") {
    // Q4a: 是否自动罗列直接子笔记(只列本目录 .md;子文件夹需各自建总览页)
    listChildren = await askConfirm(
      "\n自动在总览页里罗列本目录的直接子笔记吗?(新增笔记后会自动刷新)[Y/n] > ",
      true,
    );
    fileName = "index.md";
  } else {
    // Q4b: 标题
    let title = "";
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const raw = await askText("笔记标题 > ");
      const res = normalizeNoteTitle(raw);
      if (res.error) {
        console.log(res.error);
        continue;
      }
      const err = conflictError(relDir, `${res.name}.md`);
      if (err) {
        console.log(`无法创建:${err}`);
        continue;
      }
      title = res.name;
      break;
    }
    if (!title) return bail("\n重试次数过多,已取消,未创建任何文件。");

    // Q5: 模板
    console.log("\n用哪个模板?");
    TEMPLATES.forEach((t, i) => console.log(`  ${i + 1}) ${t.name} —— ${t.desc}`));
    templateIdx = (await askRange("请输入序号(回车 = 2 标准)> ", 1, TEMPLATES.length, 2)) - 1;
    fileName = `${title}.md`;
  }

  // Q6: 最终确认(此刻才开始产生任何文件系统改动)
  const relPath = relDir ? `${relDir}/${fileName}` : fileName;
  const url = urlForRel(relPath);
  const kindLabel =
    fileName.toLowerCase() === "index.md"
      ? "总览页(index.md)" + (rebuildExistingOverview ? " · 刷新/重建已有文件" : "")
      : `独立笔记 · ${TEMPLATES[templateIdx].name}模板`;
  console.log("\n确认创建:");
  console.log(`  位置: ${KB_DISPLAY}/${relDir || "(vault 根)"}/`);
  console.log(`  文件: ${fileName}`);
  console.log(`  形式: ${kindLabel}`);
  console.log(`  网址: ${url}`);
  if (!(await askConfirm("回车确认,n 取消> ", true))) {
    return bail("\n已取消,未创建任何文件。");
  }

  // 写文件(目录此刻才创建;之后不再响应"输入已结束"类取消)
  finished = true;
  rl.close();
  const absDir = path.join(KB_ROOT, relDir);
  fs.mkdirSync(absDir, { recursive: true });

  let content;
  if (form === "overview") {
    if (rebuildExistingOverview) {
      const existing = fs.readFileSync(indexAbs, "utf8");
      if (existing.includes(CHILDREN_START) && existing.includes(CHILDREN_END)) {
        // 只重写标记区,保留手写正文
        const start = existing.indexOf(CHILDREN_START);
        const end = existing.indexOf(CHILDREN_END) + CHILDREN_END.length;
        content = existing.slice(0, start) + childrenRegion(relDir) + existing.slice(end);
      } else {
        // 无标记 → 整文件重建;frontmatter 的 title 尽量沿用旧值
        let title = relDir.split("/").pop();
        try {
          const parsed = matter(existing);
          if (typeof parsed.data?.title === "string" && parsed.data.title) {
            title = parsed.data.title;
          }
        } catch {}
        content = overviewFileContent(relDir, title, true);
      }
    } else {
      content = overviewFileContent(relDir, relDir.split("/").pop(), listChildren);
    }
  } else {
    content = TEMPLATES[templateIdx].build(fileName.replace(/\.md$/, ""));
  }
  fs.writeFileSync(path.join(absDir, fileName), content, "utf8");
  console.log(`\n✔ 已创建 ${KB_DISPLAY}/${relPath}`);

  // 新建独立笔记时,若本目录有带标记的总览页 → 自动刷新其子笔记列表
  if (form === "note" && relDir !== "" && indexExists) {
    const cur = fs.readFileSync(indexAbs, "utf8");
    if (cur.includes(CHILDREN_START) && cur.includes(CHILDREN_END)) {
      const start = cur.indexOf(CHILDREN_START);
      const end = cur.indexOf(CHILDREN_END) + CHILDREN_END.length;
      fs.writeFileSync(
        indexAbs,
        cur.slice(0, start) + childrenRegion(relDir) + cur.slice(end),
        "utf8",
      );
      console.log(`✔ 已刷新 ${relDir}/index.md 的子笔记列表`);
    }
  }

  // 刷新该库首页(根 index.md 自动索引区域)
  const genArg = VAULT_ARG ? ` ${VAULT_ARG}` : "";
  const res = spawnSync(process.execPath, [GENERATOR, VAULT_DIR], { stdio: "inherit" });
  if (res.status !== 0) {
    console.error(
      `\n⚠ 首页索引刷新失败(status ${res.status})——文件已创建,请手动运行 node scripts/generate-knowledge-index.mjs${genArg} 修复。`,
    );
    process.exit(1);
  }

  console.log(`→ 页面地址: ${url}\n`);
}

main().catch((err) => {
  console.error("向导出错:", err);
  process.exit(1);
});
