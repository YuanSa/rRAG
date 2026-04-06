# rrag

[English](README.en.md) | 简体中文

`rrag` 是一个本地命令行知识库工具。

它不用向量库，而是把知识维护成一个可读的文件系统结构：

- `skills/` 存放知识内容
- `categories/` 存放分类树
- `staging/` 存放待学习材料

运行数据默认放在 `~/.rrag`，并且这个数据目录会被初始化成一个独立 git 仓库。

## 快速开始

```bash
rrag init
rrag update "Beam search should keep traversal branch budgets small."
rrag update --apply
rrag update --review
rrag update --merge
rrag ask "How should traversal branch budgets be controlled?"
```

## 常用命令

```bash
rrag update "<text>"
rrag update --file <path>
rrag update --apply
rrag update --review
rrag update --merge
rrag ask "<question>"
rrag ask --explain "<question>"
rrag rebuild [--dry-run]
rrag init
rrag config show
rrag config set <key> <value>
rrag config --file <path>
rrag status
rrag runs [limit]
rrag resume <run_id>
rrag clear
rrag delete <skill_id>
```

## 配置建议

`rrag init` 是交互式引导，现在主要问：

- LLM provider
- base URL
- model
- API key env var

常见配置方式：

- 本地 Ollama
- 本地 `llama.cpp`
- OpenAI-compatible 服务

## 重要配置项

- `llm_provider`
- `llm_base_url`
- `llm_model`
- `llm_api_key_env`
- `runs_enabled`
- `archive_enabled`
- `ask_no_answer_behavior`

其中 `ask_no_answer_behavior` 支持：

- `error`
- `reply`
- `blank`

## 更多文档

- [English README copy](README.en.md)
- [Spec](spec.md)
- [示例测试用例](../examples/test-cases/README.md)
