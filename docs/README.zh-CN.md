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

### 1. 安装

要求：

- Node.js `>= 18`

在仓库根目录执行：

```bash
npm install -g .
```

确认命令可用：

```bash
rrag --help
```

### 2. 初始化模型配置

```bash
rrag init
```

`init` 是交互式引导，会询问：

- LLM provider
- base URL
- model
- API key env var

如果已有配置，会以当前配置为默认值。

### 3. 最小化体验一遍

先添加一条知识：

```bash
rrag update "Beam search should keep traversal branch budgets small."
```

执行学习：

```bash
rrag update --apply
```

查看这次知识更新和 `main` 的差异：

```bash
rrag update --review
```

合并回 `main`：

```bash
rrag update --merge
```

然后提问验证：

```bash
rrag ask "How should traversal branch budgets be controlled?"
```

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

如果你想看分类路径、命中 skill 和证据片段：

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
