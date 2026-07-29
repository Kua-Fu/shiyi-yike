# 诗意一刻 · Chrome 扩展

把“诗意一刻”带进 Chrome：每次打开新标签页，随机遇见一首唐诗或宋词。

## 功能

- 完整内置唐诗 1000 首、宋词 1000 首，无需联网
- 按唐诗/宋词、作者和主题标签筛选
- 点击诗人或词人姓名查看人物简介，并可继续赏读该作者的全部作品
- 全库搜索题目、作者、原文、白话译文与标签，并从结果直接进入诗词
- 点击“X 首可赏”查看当前筛选结果，并从列表直接打开指定诗词
- 展示完整原文与白话译文
- 收藏喜欢的篇章，通过顶部“收藏”入口集中浏览，并可继续按作者和标签筛选
- 一键复制原文、译文与标签
- 支持快捷键：`空格` / `→` 换一首，`F` 收藏，`C` 复制
- 点击浏览器工具栏中的扩展图标，可随时打开“诗意一刻”

## 安装

1. 打开 Chrome，在地址栏输入 `chrome://extensions`
2. 打开右上角的“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目文件夹
5. 打开一个新标签页

## 校验

项目不依赖第三方运行库，安装 Node.js 后可直接运行：

```bash
npm test
```

如需从开放语料重新生成作者简介：

```bash
npm run build:authors
npm run build:search
```

## 项目结构

```text
.
├── manifest.json        # Chrome Manifest V3 配置
├── background.js        # 工具栏入口
├── newtab.html          # 新标签页
├── app.js               # 诗词筛选、人物简介、随机、收藏与复制
├── styles.css           # 卷轴式视觉设计
├── assets/              # 扩展图标
├── data/authors.json    # 本地诗人、词人人物简介
├── data/poems/search.json # 本地诗词全文搜索索引
└── data/poems/          # 本地诗词索引与 20 个分卷
```

## 内容来源

本项目由 Codex Sites 中的“诗意一刻”第 4 版迁移而来。诗词译文数据中的开放语料沿用原站标注，其中 `Papersnake/gushiwen` 数据集采用 CC0-1.0。

人物简介整理自 MIT 许可的 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)
开放数据库，详细署名与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 许可证

代码依照 [MIT License](LICENSE) 发布。诗词文本、译文及其来源信息以各数据记录中的标注为准。
