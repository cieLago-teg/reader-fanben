# Tasks
- [x] Task 1: 重新定义句子解析结果的数据契约
  - [x] SubTask 1.1: 梳理现有 `chunks / structure / notes / translation` 在学习侧栏中的职责冲突
  - [x] SubTask 1.2: 设计支持“原句内多色下划线标注”的结构化字段，并明确与旧 `chunks` 的迁移关系
  - [x] SubTask 1.3: 定义句子提问输入框所需的请求、响应与状态字段，保证它只服务于当前句子上下文

- [x] Task 2: 升级 AI 句子解析生成策略
  - [x] SubTask 2.1: 改写句子解析提示词或生成策略，使其优先关注大学英语及以上层级的结构难点
  - [x] SubTask 2.2: 为“基础内容过多”的情况增加约束或后处理，确保最终输出只保留高价值观察点
  - [x] SubTask 2.3: 为简单句保留简洁输出路径，避免为了凑内容而生成低价值讲解

- [x] Task 3: 重做学习侧栏中展开句子的解析界面
  - [x] SubTask 3.1: 删除重复的黄色中文翻译框，只保留一处主释义
  - [x] SubTask 3.2: 将“推荐断句”替换为原句内结构标注 UI，并让颜色、间距和说明区接近原版 `reader`
  - [x] SubTask 3.3: 调整说明区层级与视觉密度，保证整体界面克制、清晰、不突兀

- [x] Task 4: 增加句子级 AI 提问能力
  - [x] SubTask 4.1: 在展开句子卡片底部加入提问输入框、提交状态和回答容器
  - [x] SubTask 4.2: 新增句子级问答 API 或服务编排，确保问题携带当前句子与解析上下文
  - [x] SubTask 4.3: 处理回答中的加载、失败、重试与清空状态，避免影响主阅读流

- [x] Task 5: 完成测试、构建与体验回归
  - [x] SubTask 5.1: 先补自动化测试，覆盖“删除重复翻译框”“内联结构标注”“高阶解析输出约束”“句子提问入口”
  - [x] SubTask 5.2: 回归阅读页真实交互，确认学习侧栏在不同句型下仍保持可读
  - [x] SubTask 5.3: 运行项目测试与生产构建，验证没有引入回归

- [x] Task 6: 修复本轮句子学习升级带来的测试回归与验收缺口
  - [x] SubTask 6.1: 修复 `manualRefine.test.ts` 的语法错误并恢复测试可编译状态
  - [x] SubTask 6.2: 更新 `readerClient.test.ts` 中仍指向旧“推荐断句”文案的断言
  - [x] SubTask 6.3: 排查句子问答红测，修复输入提交流程或测试等待时机
  - [x] SubTask 6.4: 补做一轮阅读页真实交互 smoke check，确保问答与结构标注都可用

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 1]
- [Task 6] depends on [Task 3]
- [Task 6] depends on [Task 4]
- [Task 5] depends on [Task 2]
- [Task 5] depends on [Task 3]
- [Task 5] depends on [Task 4]
- [Task 5] depends on [Task 6]
