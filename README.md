# rrag

`rrag` 是一个本地命令行知识库工具。

它不用向量库，而是把知识维护成一个可读的文件系统结构：

- `skills/` 存放知识内容
- `categories/` 存放分类树
- `staging/` 存放待学习材料

检索和整理主要依赖 LLM 的分类、规划和推理能力。

## 安装

要求：

- Node.js `>= 18`

在仓库根目录安装成全局命令：

```bash
npm install -g .
```

安装后可以直接使用：

```bash
rrag --help
```

如果你只想在当前仓库里临时开发测试，也可以用：

```bash
npm link
```

## 数据目录

`rrag` 的运行数据默认不放在当前代码仓库里，而是放在：

```bash
~/.rrag
```

也可以通过环境变量覆盖：

```bash
RRAG_HOME=~/.rrag-demo rrag status
```

数据目录里通常会有：

- `skills/`
- `categories/`
- `staging/`
- `archive/`
- `runs/`
- `config.json`

这个目录本身会被初始化成一个独立 git 仓库，用来管理知识库变更。

## 3 分钟上手

1. 初始化配置

```bash
rrag init
```

`init` 是交互式引导。现在它只会问：

- LLM provider
- base URL
- model
- API key env var

如果已经存在配置，当前配置会作为默认值；如果是全新环境，会使用推荐默认值。

2. 添加一条待学习内容

```bash
rrag update "Beam search should keep traversal branch budgets small."
```

3. 正式学习

```bash
rrag update --apply
```

4. 查看当前更新分支相对 `main` 的差异

```bash
rrag update --review
```

5. 合并到 `main`

```bash
rrag update --merge
```

6. 提问验证

```bash
rrag ask "How should traversal branch budgets be controlled?"
```

## 核心命令

### 学习知识

把一句话放进 `staging/`：

```bash
rrag update "A note to learn later"
```

把文件或目录复制到 `staging/`：

```bash
rrag update --file ./docs/some-note.md
rrag update --file ./docs/
```

执行学习：

```bash
rrag update --apply
```

查看当前 update 分支对 `main` 的 diff：

```bash
rrag update --review
```

把当前 update 分支合并回 `main`：

```bash
rrag update --merge
```

### 提问

默认只输出最终答案：

```bash
rrag ask "What does the repo know about traversal?"
```

查看解释信息、分类过程和命中证据：

```bash
rrag ask --explain "What does the repo know about traversal?"
```

### 重建分类结构

先看计划，不执行：

```bash
rrag rebuild --dry-run
```

执行保守重建：

```bash
rrag rebuild
```

### 配置

查看当前配置：

```bash
rrag config show
```

设置单个配置项：

```bash
rrag config set llm_provider ollama
rrag config set llm_base_url http://127.0.0.1:11434
rrag config set llm_model qwen2.5:7b
```

从已有 JSON 文件导入配置：

```bash
rrag config --file ./config/rrag.local.json
```

### 运行记录与状态

查看整体状态：

```bash
rrag status
```

查看最近的 run：

```bash
rrag runs
rrag runs 10
```

恢复一个未完成 run：

```bash
rrag resume <run_id>
```

清理缓存、归档和运行记录：

```bash
rrag clear
```

### 删除 skill

```bash
rrag delete <skill_id>
```

这是软删除，会移除活动链接并归档 skill，而不是直接硬删。

## 推荐配置方式

### 本地 Ollama

先启动 Ollama 和模型，再运行：

```bash
rrag init
```

在引导里填：

- provider: `ollama`
- base URL: `http://127.0.0.1:11434`
- model: 比如 `qwen2.5:7b`

### 本地 llama.cpp

```bash
rrag init
```

在引导里填：

- provider: `llama.cpp`
- base URL: 例如 `http://127.0.0.1:8080/v1`
- model: 你的本地模型名

### OpenAI-compatible 服务

先设置 API key 环境变量，然后：

```bash
rrag init
```

在引导里填：

- provider: `openai-compatible`
- base URL: 例如 `https://api.openai.com/v1`
- model: 比如 `gpt-4.1-mini`
- API key env var: 比如 `OPENAI_API_KEY`

## 重要配置项

常见配置项包括：

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

其中：

- `ask_no_answer_behavior` 支持：
  - `error`
  - `reply`
  - `blank`

默认推荐是 `error`，更适合脚本调用和自动化流程。

## 当前行为特点

现在这版已经支持：

- 用文件系统维护知识库
- 用独立数据仓库管理知识变更
- `update --apply` 走独立 update 分支并提交
- `update --review` 查看相对 `main` 的 diff
- `update --merge` 合并并切回 `main`
- `ask` 默认只输出最终答案
- `ask --explain` 查看证据和检索过程
- 本地 Ollama / 本地 `llama.cpp` / OpenAI-compatible 服务
- 可选的 `runs` 记录
- 可选的 `archive` 归档

## Demo

项目里带了一组可运行样例：

```bash
npm run demo:testcases
```

这会在隔离的临时 `RRAG_HOME` 下跑完整 demo，不会污染你自己的 `~/.rrag`。

如果你想手动看样例输入，可以参考：

- [examples/test-cases/README.md](/Users/yangzihan/Projects/rrag/examples/test-cases/README.md)

## Spec

产品 spec 在这里：

- [README/spec.md](/Users/yangzihan/Projects/rrag/README/spec.md)
