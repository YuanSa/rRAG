# rrag

[English](README.md) | 简体中文

`rrag` 是一个基于文件系统的本地知识库 CLI。  
它不是先靠向量相似度粗筛的传统 RAG，而是让 LLM 沿分类树逐层理解、推理、决定该看哪些 skill，再抽取相关片段回答。

## 项目亮点

- 基于推理的召回
  不是单纯依赖 embedding 和 top-k，相比传统向量召回更强调“理解问题后再决定看什么”。

- 文件系统原生知识库
  知识直接存成可读的 `skills/`、`categories/`、`staging/` 目录和文件。

- 日常使用非常轻
  一条命令添加知识，一条命令执行学习，再走 review / merge 即可。

- 知识变更可审计
  运行数据目录本身是独立 git 仓库，知识库变化可以 review、diff、merge。

- 支持本地和远程模型
  支持本地 Ollama、本地 `llama.cpp`，以及 OpenAI-compatible 服务。

## 快速开始

### 1. 安装准备

本地需要已安装 Node.js 环境。克隆本仓库后，在仓库根目录执行以下命令安装：

```bash
npm install -g .
```

之后即可在命令行使用 `rrag` APP 操作了。下面运行以下命令初始化工作区：

```bash
rrag init
```

`init` 会引导你配置模型相关信息。支持使用本地 Ollama 模型。

### 2. 功能体验

我们先问 `rrag` 一个问题：

```bash
rrag ask "How should traversal branch budgets be controlled?"
```

此时因为 `rrag` 知识库中没有任何知识，他自然也不知道上述问题的答案，所以预期没有返回结果。

现在，我们尝试添加这条知识：

```bash
rrag update "Beam search should keep traversal branch budgets small."
```

然后依次执行下列命令来学习：

```bash
rrag update --apply  # 将刚才输入的知识整合进当前知识库
rrag update --review # 检查这次知识更新和主分支的差异，确认变更符合预期
rrag update --merge  # 确认当前整合内容无误，合并进主分支
```

至此我们的 rrag 就学习到了上述内容。我们可以提问验证：

```bash
rrag ask "How should traversal branch budgets be controlled?"
```

此时 `rrag` 应该可以回答相应内容了。

`rrag update` 支持多次添加内容、还支持 `--file <file_path>` 直接导入一个文件的内容作为新知识。

## 典型使用场景

### 1. 记住一条小知识

如果你只是想快速教它一个事实：

```bash
rrag update "My preferred deployment region is us-west-2."
rrag update --apply
```

### 2. 从已有文件学习

如果你已经有一篇笔记或一整个目录：

```bash
rrag update --file ./notes/architecture.md
rrag update --file ./research/
rrag update --apply
```

### 3. 用 git 风格审查知识变更

如果你希望知识更新过程可 review：

```bash
rrag update --apply
rrag update --review
rrag update --merge
```

### 4. 正常提问，只看答案

日常使用时，`ask` 默认只输出最终答案：

```bash
rrag ask "What does the repo know about traversal?"
```

### 5. 调试召回过程

如果你想看分类路径、命中 skill 和证据片段，可以在 `ask` 时添加 `--explain` 参数：

```bash
rrag ask --explain "What does the repo know about traversal?"
```

### 6. 查看和维护知识库状态

查看整体状态：

```bash
rrag status
```

查看最近的 run：

```bash
rrag runs
rrag runs 10
```

重建分类结构：

```bash
rrag rebuild --dry-run
rrag rebuild
```

### 7. 清理缓存和临时产物

```bash
rrag clear
```

### 8. 软删除一个 skill

```bash
rrag delete <skill_id>
```

这不会直接硬删，而是移除活动链接并归档 skill。

## 运行数据目录

默认情况下，运行数据存放在：

```bash
~/.rrag
```

也可以覆盖：

```bash
RRAG_HOME=~/.rrag-demo rrag status
```

目录里通常有：

- `skills/`
- `categories/`
- `staging/`
- `archive/`
- `runs/`
- `config.json`

这个目录会被初始化成独立 git 仓库，和源码仓库分开。

## 常见配置项

- `llm_provider`
- `llm_base_url`
- `llm_model`
- `llm_api_key_env`
- `runs_enabled`
- `archive_enabled`
- `ask_no_answer_behavior`
- `branch_max_per_level`
- `branch_min_score`
- `branch_score_margin`

其中 `ask_no_answer_behavior` 支持：

- `error`
- `reply`
- `empty`

更具体一点说：

- `llm_provider`
  指定模型服务类型。当前支持：
  - `ollama`
  - `llama.cpp`
  - `openai-compatible`

- `llm_base_url`
  指定模型服务地址。
  例如：
  - Ollama 常见是 `http://127.0.0.1:11434`
  - `llama.cpp` 常见是 `http://127.0.0.1:8080/v1`
  - OpenAI-compatible 则可能是某个远程 API 地址

- `llm_model`
  指定实际使用的模型名。例如：
  - `qwen2.5:7b`
  - `gpt-4.1-mini`

- `llm_api_key_env`
  指定从哪个环境变量读取 API key。
  如果你使用的是本地 Ollama，一般这个值虽然可以保留，但通常不会真的用到。

- `runs_enabled`
  是否记录运行过程到 `runs/`。
  打开后更方便调试、回看 planner / ask 过程；关闭后更干净。

- `archive_enabled`
  是否在 `update --apply` 后把本次消费过的 `staging/` 输入归档到 `archive/`。
  如果你更在意可追溯性，可以打开；如果你只想保持目录简洁，可以关闭。

- `ask_no_answer_behavior`
  控制 `ask` 在没有匹配到 skill，或无法得出最终答案时的行为：
  - `error`：直接抛错
  - `reply`：输出 `I don't know.`
  - `empty`：不输出任何内容

- `branch_max_per_level`
  限制检索时每一层分类树最多继续展开多少个分支。
  值越大，召回范围越宽；值越小，检索越保守。

- `branch_min_score`
  分类分支最低相关性阈值。低于这个分值的分支不会继续展开。

- `branch_score_margin`
  控制“与当前最佳分支相差多少仍然可以继续保留”。
  值越大，越容易保留多个分支；值越小，越偏向只走最强分支。

## 全部命令

```bash
rrag init
rrag update "<text>"
rrag update --file <path>
rrag update --apply
rrag update --review
rrag update --merge
rrag ask "<question>"
rrag ask --explain "<question>"
rrag rebuild [--dry-run]
rrag config show
rrag config set <key> <value>
rrag config --file <path>
rrag status
rrag runs [limit]
rrag resume <run_id>
rrag clear
rrag delete <skill_id>
```

## 更多文档

- [English README](README.md)
- [Spec](spec.md)
- [示例测试用例](../examples/test-cases/README.md)
