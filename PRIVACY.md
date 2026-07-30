# 诗意一刻隐私政策

更新日期：2026 年 7 月 30 日

“诗意一刻”是一款通过工具栏图标主动打开的 Chrome 诗词阅读扩展，提供先秦至清代诗词浏览、筛选、搜索、收藏、逐句回想、间隔复习、复制与知识纠错入口。扩展不会替换或接管 Chrome 新标签页。

## 数据处理

“诗意一刻”不会收集姓名、电子邮件地址、位置、身份验证信息、财务信息、浏览记录、网页内容或其他个人身份信息。

当用户使用收藏、换肤、简繁切换、校订范围、自动下一首、阅读统计或间隔复习功能时，扩展程序仅会将已收藏诗词的内部标识、所选皮肤标识、简繁显示偏好、校订范围偏好、自动切换间隔，最近 90 天的每日阅读篇数、累计阅读篇数、当天已读作品内部标识，以及最多 200 篇精读作品的回想次数、正确率、自评结果、复习间隔和到期日期保存在用户设备上的 `chrome.storage.local` 中，用于显示收藏列表、恢复界面偏好、计算连续阅读天数并安排下一次本地复习。这些数据：

- 不会发送至开发者或任何外部服务器；
- 不会出售、共享或转移给第三方；
- 不会用于广告、用户画像、分析、信用评估或贷款；
- 不会用于与扩展程序单一用途无关的目的。

用户可以通过取消收藏、清除扩展程序数据或卸载扩展程序删除这些本地数据。

“上一篇”所需的最近阅读记录仅保存在当前阅读页的内存中，关闭或刷新页面后即清除，不会写入本地存储，也不会发送至外部。

“今日诗签”与到期复习只根据用户设备上的本地日期、内置精读诗库和本机学习记录计算，不读取位置、时区标识或网络信息，也不会将日期、答案、正确率或复习结果发送至外部。

## GitHub 知识纠错

扩展程序不会自动向 GitHub 或其他外部服务发送数据。只有当用户主动点击正文资料信息旁的“纠错”链接时，浏览器才会打开 GitHub 的新建 Issue 页面。

为方便定位问题，链接会预填当前作品的标题、朝代、作者、作品内部标识、原文/译文来源、译文校订状态和扩展数据版本，不包含完整诗文、收藏列表或设备信息。用户可以在提交前查看、修改或删除这些内容。

GitHub Issue 通常是公开内容，并由 GitHub 按其自身条款和隐私政策处理；提交可能需要 GitHub 账号。请勿在 Issue 中填写手机号、电子邮件地址等个人信息。

## 权限说明

扩展程序仅使用 Chrome 的 `storage` 权限，以便在用户设备本地保存收藏状态、皮肤、简繁显示偏好、校订范围偏好、自动切换间隔、阅读计数、学习进度与复习排期，以及用于复用阅读页的临时页签标识。临时页签标识保存在 `chrome.storage.session`，浏览器会话结束后失效。扩展程序不会读取用户访问的网站，也不会执行远程托管的代码；繁简转换、答案核对、掌握判定和复习排期完全由扩展内置的本地代码完成。

## Chrome Web Store 有限使用要求

“诗意一刻”对用户数据的使用符合 Chrome Web Store 用户数据政策及有限使用要求。扩展程序仅在提供用户可见的收藏、阅读统计与间隔复习功能所必需的范围内处理本地数据。

## 隐私政策变更

如果本政策发生变更，最新版本会发布在本页面，并更新页面顶部的日期。

## 联系方式

如对本隐私政策有任何疑问，请通过项目的 GitHub Issues 页面联系我们：

https://github.com/Kua-Fu/shiyi-yike/issues

---

# Privacy Policy for Shiyi Yike

Last updated: July 30, 2026

Shiyi Yike is a Chrome poetry-reading extension opened from its toolbar icon. It supports browsing, filtering, searching, favoriting, line-by-line recall, spaced review, copying, and reporting knowledge errors in Chinese poetry from the pre-Qin period through the Qing dynasty. It does not replace or override Chrome's New Tab page.

## Data Handling

Shiyi Yike does not collect names, email addresses, location information, authentication information, financial information, browsing history, website content, or other personally identifiable information.

When a user uses the favorites, theme, Simplified/Traditional Chinese switch, review-scope, auto-next, reading-stats, or spaced-review feature, the extension stores only the internal identifiers of favorited poems, the selected theme identifier, the script display preference, the review-scope preference, the auto-next interval, daily reading counts for up to 90 days, a lifetime reading count, the internal identifiers read today, and recall attempts, scores, self-ratings, review intervals, and due dates for up to 200 deep-reading poems in `chrome.storage.local` on the user's device. This information is used solely to display favorites, restore interface preferences, calculate a reading streak, and schedule the next local review. It:

- is not transmitted to the developer or any external server;
- is not sold, shared, or transferred to third parties;
- is not used for advertising, profiling, analytics, credit assessment, or lending;
- is not used for any purpose unrelated to the extension's single purpose.

Users can remove this local data by unfavoriting poems, clearing the extension's data, or uninstalling the extension.

The recent-reading trail used by the Previous button is kept only in the current reader page's memory. It is cleared when the page is closed or refreshed, is not written to local storage, and is not transmitted externally.

The Daily Poem and due reviews are calculated only from the device's local date, the bundled deep-reading collection, and local learning records. The extension does not read location, a time-zone identifier, or network information, and does not transmit dates, answers, scores, or review results externally.

## GitHub Knowledge Corrections

The extension does not automatically transmit data to GitHub or any other external service. GitHub is opened only when the user actively clicks the correction link beside the poem's source information.

The link pre-fills the current work's title, dynasty, author, internal work ID, original/translation sources, translation review status, and extension data version. It does not include the full poem, favorites, or device information. Users can review, edit, or remove all pre-filled content before submitting.

GitHub Issues are generally public and are processed by GitHub under its own terms and privacy policy; submission may require a GitHub account. Users should not include phone numbers, email addresses, or other personal information in an Issue.

## Permission

The extension uses only Chrome's `storage` permission to preserve favorite status, the selected visual theme, the Simplified/Traditional Chinese display preference, the review-scope preference, the auto-next interval, local reading counts, learning progress, review schedules, and a temporary tab identifier used to focus an existing reader page. The temporary identifier is stored in `chrome.storage.session` and expires with the browser session. The extension does not read websites visited by the user and does not execute remotely hosted code; script conversion, answer checking, mastery decisions, and review scheduling run entirely from code bundled with the extension.

## Chrome Web Store Limited Use

Shiyi Yike's use of user data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. The extension handles local data only as necessary to provide the user-facing favorites, reading-stats, and spaced-review features.

## Changes to This Policy

If this policy changes, the latest version will be published on this page and the date at the top will be updated.

## Contact

For questions about this privacy policy, please contact us through the project's GitHub Issues page:

https://github.com/Kua-Fu/shiyi-yike/issues
