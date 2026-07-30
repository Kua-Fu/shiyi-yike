# 第三方资料说明

“诗意一刻”的作者简介、历代诗词原文与白话译文整理自以下开放项目：

## 繁简转换

### opencc-js

- 项目地址：https://github.com/nk2028/opencc-js
- 使用范围：扩展内全部界面、诗词原文、白话译文、标签与人物小传的离线繁简转换
- 版本：1.4.1
- License：MIT AND Apache-2.0
- 随附许可：`vendor/opencc-js/LICENSE`、`vendor/opencc-js/THIRD_PARTY_LICENSES.md`

## 作者小传

### chinese-poetry

- 项目地址：https://github.com/chinese-poetry/chinese-poetry
- 使用范围：`data/authors.json` 中的部分唐宋作者简介，以及《诗经》《楚辞》原典文本
- License：MIT
- Copyright (c) 2016 JackeyGao

### 中文维基百科

- 项目地址：https://zh.wikipedia.org/
- 使用范围：`data/sources/author-profiles.json` 与 `data/authors.json` 中标注“维基百科 · 中文版”的作者小传
- License：CC BY-SA 4.0（https://creativecommons.org/licenses/by-sa/4.0/）
- 署名：中文维基百科贡献者
- 来源定位：每条记录均保存带 `oldid` 的固定版本链接、条目名、版本号和抓取时间
- 改动：繁简转换、编辑标记清理、空白规范化与篇幅节选；每条记录同时保存具体改动说明

这些改编条目继续按 CC BY-SA 4.0 提供。条目贡献者与完整修订历史可由对应固定版本页面进入查看。

### 古文岛（原古诗文网）

- 资料页：https://www.gushiwen.cn/
- 使用范围：仅核对年代、字号、籍贯、身份与著作等人物事实
- 处理方式：不复制资料页的现代小传原文；事实经筛选后由本项目以统一模板重新表述
- 说明：资料链接用于事实溯源，不代表该网站内容采用开放许可

公开资料不足、集体署名或作者失考的条目，会明确标注“有限记载”，并结合本地收录作品给出审慎说明。

## 诗词原文与白话译文

### 《宋诗选注》书目与点名篇目参照

- 来源页：https://zh.wikipedia.org/w/index.php?title=宋詩選注&oldid=90739261
- 原书：钱锺书《宋诗选注》，人民文学出版社 1958 年初版
- 使用范围：只以来源页明确提及的入选作品作为本轮宋诗补充线索
- License：来源页文字采用 CC BY-SA 4.0（https://creativecommons.org/licenses/by-sa/4.0/）
- 署名：中文维基百科贡献者
- 处理方式：公版诗歌原文另据开放语料或公版诗集核对；白话译文由本项目重新整理
- 未使用内容：不复制原书的现代序言、诗人短论、注释、评语、现代译文或版式
- 详细记录：`data/sources/song-poetry-selection.json`

### 《全宋词》书目参照

- 书名：《全宋词》（全五册）
- 编纂：唐圭璋；王仲闻参订；孔凡礼补辑
- 出版：中华书局 1999 年增订版
- ISBN：9787101017144
- 使用方式：作为新增宋词的书目与编纂体系参照，不复制现代版本的序跋、校勘记或版式内容
- 详细记录：`data/sources/song-ci-bibliography.json`

### chinese-poetry《全宋词》开放语料

- 项目地址：https://github.com/chinese-poetry/chinese-poetry/tree/master/宋词
- 使用范围：新增 200 首宋词的作者、词牌与正文交叉核对
- 数据版本：commit `b8594f81a89752241442f2ce267d6f66f96704ee`
- License：MIT

### yht050511/gushiwen

- 项目地址：https://github.com/yht050511/gushiwen
- 使用范围：《诗经》《楚辞》逐篇白话译文，新增唐诗、宋诗、宋词，以及汉魏六朝、元、明、清诗词原文与译文
- 数据版本：commit `409df701b3f91a41c87e5979b092c8c3c42c2123`
- License：MIT

### Papersnake/gushiwen

- 项目地址：https://huggingface.co/datasets/Papersnake/gushiwen
- 使用范围：《九歌》《九章》《七谏》《九怀》《九叹》《九思》《天问》《九辩》的白话译文
- License：CC0-1.0

## 授权边界与发布策略

- 当前诗库共 4834 篇：938 篇标为“已人工校订”，2834 篇标为“待人工校订”，1062 篇标为“AI 辅助草稿”。
- 扩展默认只展示 938 篇已校精选；待校与 AI 草稿仅在用户主动选择“全库广览”后展示。
- 校订状态只描述文本质量流程，不代表版权状态。界面与复制文本会同时保留译文来源和校订状态。
- `yht050511/gushiwen` 仓库的 MIT 声明未必覆盖其上游第三方现代译文；`Papersnake/gushiwen` 的 CC0 声明也不构成对所有上游权利的保证。正式商用或商店分发前，仍应取得权利人书面确认、完成专业法律审查，或替换无法确认的现代译文。
- 详细逐项记录、风险结论和发布阻断项见 `CONTENT_LICENSE_AUDIT.md` 与 `data/sources/content-license-audit.json`。

所有译文均用于辅助阅读，不替代权威校注本。

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
