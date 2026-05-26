# Tasks
- [x] Task 1: 明确阅读资产的数据模型与生成状态
  - [x] SubTask 1.1: 设计句子、句子解析、解析生成状态、生成来源与重试所需的数据字段
  - [x] SubTask 1.2: 定义段落与句子的关联关系，以及查词缓存与句子解析缓存的边界
  - [x] SubTask 1.3: 约定“基础可读内容先可用，解析后补齐”的状态机与 API 返回结构

- [x] Task 2: 重构阅读器壳层，先做到接近 Reader 的主交互框架
  - [x] SubTask 2.1: 调整阅读页布局为低干扰正文区 + 顶部轻工具栏 + 可开关侧边栏
  - [x] SubTask 2.2: 实现英文模式与双语模式切换，并保持阅读位置稳定
  - [x] SubTask 2.3: 为后续段落解析、句子解析、批注或重点段落入口预留一致的交互位置

- [x] Task 3: 升级查词体验，使其成为第一优先级能力
  - [x] SubTask 3.1: 提升查词结果结构，至少支持词头、词性、核心释义、发音与加入生词本
  - [x] SubTask 3.2: 优化正文中的选词/点词交互，减少误触并缩短出结果路径
  - [x] SubTask 3.3: 建立稳定缓存策略，确保重复查词明显更快
  - [x] SubTask 3.4: 验证查词结果在不同文章、不同词形下的可用性

- [x] Task 4: 建立句子切分与 AI 解析流水线
  - [x] SubTask 4.1: 在导入阶段补充句子切分，保证每个句子具备稳定 ID
  - [x] SubTask 4.2: 设计一句话解析的结构化输出格式，覆盖断句、译文、结构说明与要点
  - [x] SubTask 4.3: 接入可缓存的 AI 解析生成流程，并支持异步补全
  - [x] SubTask 4.4: 为失败句子提供重试机制，并保留文章可读状态

- [x] Task 5: 交付句子解析卡片与侧边栏学习工作台
  - [x] SubTask 5.1: 在正文中提供句子或段落级解析入口
  - [x] SubTask 5.2: 在侧边栏中展示重点句段、译文与解析卡片，接近 Reader 的辅助学习路径
  - [x] SubTask 5.3: 确保打开解析不会打断连续阅读，可随时关闭并回到原上下文
  - [x] SubTask 5.4: 为后续人工精修或运营编辑保留替换单句解析的接口边界

- [x] Task 6: 做一轮面向“任意外部文章”的体验验证
  - [x] SubTask 6.1: 用至少两篇风格不同的英文文章验证导入、查词、句子解析与阅读切换
  - [x] SubTask 6.2: 检查长句、列表句、引号句等结构的解析稳定性
  - [x] SubTask 6.3: 记录与 Reader 仍有差距的体验点，作为下一轮优化输入

- [x] Task 7: 修复 Prisma 同步与导入链路阻塞
  - [x] SubTask 7.1: 修复运行时 Prisma Client 与最新 schema 不一致的问题
  - [x] SubTask 7.2: 打通 `import-text` 与 `import-url` 的真实导入链路
  - [x] SubTask 7.3: 回归验证导入后句子资产、解析状态与阅读页数据加载

- [x] Task 8: 补齐单句解析人工精修写接口
  - [x] SubTask 8.1: 为句子解析增加单句覆盖更新接口，支持 `sentenceId + stableKey + expectedVersion`
  - [x] SubTask 8.2: 在更新时维护版本递增、来源切换与结构化结果校验
  - [x] SubTask 8.3: 为人工精修接口补充自动化测试并重新核验 checklist 第 10 项

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 1]
- [Task 5] depends on [Task 2]
- [Task 5] depends on [Task 4]
- [Task 6] depends on [Task 7]
- [Task 6] depends on [Task 3]
- [Task 6] depends on [Task 5]
- [Task 8] depends on [Task 5]
