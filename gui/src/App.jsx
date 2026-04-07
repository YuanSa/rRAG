import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { GiAncientScrew } from "react-icons/gi";
import {
  Banner,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  TextArea,
  Toast,
  Tooltip,
  Typography
} from "@douyinfe/semi-ui";
import {
  IconArticle,
  IconBranch,
  IconChecklistStroked,
  IconCheckCircleStroked,
  IconComment,
  IconLightningStroked,
  IconPulse,
  IconRefresh,
  IconSetting,
  IconTreeTriangleDown
} from "@douyinfe/semi-icons";

const { Title, Text, Paragraph } = Typography;

const NAV_ITEMS = [
  { key: "status", label: "Status", icon: <IconPulse />, hint: "Current repo health and recent activity" },
  { key: "ask", label: "Ask", icon: <IconComment />, hint: "Grounded retrieval workspace" },
  { key: "update", label: "Update", icon: <IconArticle />, hint: "Stage content and promote changes" },
  { key: "config", label: "Config", icon: <IconSetting />, hint: "Model and runtime settings" }
];

const NO_ANSWER_OPTIONS = [
  { value: "empty", label: "empty" },
  { value: "reply", label: "reply" },
  { value: "error", label: "error" }
];

export function App() {
  const [activeView, setActiveView] = useState("status");
  const [meta, setMeta] = useState({ loading: true, data: null, error: "" });
  const [status, setStatus] = useState("Loading status...");
  const [runs, setRuns] = useState("Loading recent runs...");
  const [askOutput, setAskOutput] = useState("Ask output will appear here.");
  const [updateOutput, setUpdateOutput] = useState("Update activity will appear here.");
  const [reviewOutput, setReviewOutput] = useState("Review output will appear here.");
  const [configState, setConfigState] = useState({ loading: true, data: null, draft: null, error: "" });
  const [question, setQuestion] = useState("");
  const [note, setNote] = useState("");
  const [explain, setExplain] = useState(false);
  const [loadingKey, setLoadingKey] = useState("");

  useEffect(() => {
    void bootstrap();
  }, []);

  const activeItem = useMemo(
    () => NAV_ITEMS.find(item => item.key === activeView) || NAV_ITEMS[0],
    [activeView]
  );
  const health = deriveHealth({ meta, status });
  const parsedReview = useMemo(() => splitReviewOutput(reviewOutput), [reviewOutput]);

  async function bootstrap() {
    await Promise.all([refreshMeta(), refreshStatus(), refreshRuns(), refreshConfig()]);
  }

  async function refreshMeta() {
    setMeta(current => ({ ...current, loading: true }));
    try {
      const result = await api("/api/state");
      if (!result.ok) {
        throw new Error(result.error || "Failed to load GUI state.");
      }
      setMeta({
        loading: false,
        data: result,
        error: ""
      });
    } catch (error) {
      setMeta({
        loading: false,
        data: null,
        error: error.message
      });
    }
  }

  async function refreshStatus() {
    await runCommand({
      key: "status",
      assign: setStatus,
      request: () => api("/api/status"),
      toastOnSuccess: false,
      toastOnError: false
    });
  }

  async function refreshRuns() {
    await runCommand({
      key: "runs",
      assign: setRuns,
      request: () => api("/api/runs?limit=12"),
      toastOnSuccess: false,
      toastOnError: false
    });
  }

  async function refreshConfig() {
    setConfigState(current => ({ ...current, loading: true }));
    try {
      const result = await api("/api/config");
      if (!result.ok) {
        throw new Error(result.error || "Failed to load config.");
      }
      setConfigState({
        loading: false,
        data: result.config,
        draft: result.config,
        error: ""
      });
    } catch (error) {
      setConfigState({
        loading: false,
        data: null,
        draft: null,
        error: error.message
      });
    }
  }

  async function handleAsk() {
    if (!question.trim()) {
      Toast.warning({ content: "Please enter a question first." });
      return;
    }
    await runCommand({
      key: "ask",
      assign: setAskOutput,
      request: () =>
        api("/api/ask", {
          method: "POST",
          body: {
            question: question.trim(),
            explain
          }
        }),
      toastOnSuccess: false
    });
  }

  async function handleStageNote() {
    if (!note.trim()) {
      Toast.warning({ content: "Please add some note content first." });
      return;
    }
    await runCommand({
      key: "update-note",
      assign: setUpdateOutput,
      request: () =>
        api("/api/update/note", {
          method: "POST",
          body: { text: note.trim() }
        }),
      onSuccess: async () => {
        setNote("");
        await refreshStatus();
      }
    });
  }

  async function handleApply() {
    await runCommand({
      key: "update-apply",
      assign: setUpdateOutput,
      request: () => api("/api/update/apply", { method: "POST" }),
      onSuccess: async () => {
        await Promise.all([refreshStatus(), refreshRuns()]);
      }
    });
  }

  async function handleReview() {
    await runCommand({
      key: "update-review",
      assign: setReviewOutput,
      request: () => api("/api/update/review"),
      toastOnSuccess: false
    });
  }

  async function handleMerge() {
    await runCommand({
      key: "update-merge",
      assign: setReviewOutput,
      request: () => api("/api/update/merge", { method: "POST" }),
      onSuccess: async () => {
        await Promise.all([refreshStatus(), refreshRuns()]);
      }
    });
  }

  async function handleRebuild() {
    await runCommand({
      key: "rebuild",
      assign: setStatus,
      request: () =>
        api("/api/rebuild", {
          method: "POST",
          body: { dryRun: true }
        }),
      onSuccess: async () => {
        await Promise.all([refreshStatus(), refreshRuns()]);
      }
    });
  }

  async function handleConfigSave() {
    if (!configState.draft) {
      return;
    }
    setLoadingKey("config-save");
    try {
      const result = await api("/api/config", {
        method: "POST",
        body: {
          config: configState.draft
        }
      });
      if (!result.ok) {
        throw new Error(result.error || "Failed to save config.");
      }
      setConfigState({
        loading: false,
        data: result.config,
        draft: result.config,
        error: ""
      });
      Toast.success({ content: "Config updated." });
      await refreshMeta();
      await refreshStatus();
    } catch (error) {
      Toast.error({ content: error.message });
    } finally {
      setLoadingKey("");
    }
  }

  async function runCommand({
    key,
    assign,
    request,
    onSuccess,
    toastOnSuccess = true,
    toastOnError = true
  }) {
    setLoadingKey(key);
    assign("Working...");
    try {
      const result = await request();
      const rendered = renderResult(result);
      assign(rendered);
      if (!result.ok) {
        if (toastOnError) {
          Toast.error({ content: result.error || "Command failed." });
        }
      } else {
        if (toastOnSuccess) {
          Toast.success({ content: "Done." });
        }
        if (onSuccess) {
          await onSuccess(result);
        }
      }
    } catch (error) {
      assign(error.message);
      if (toastOnError) {
        Toast.error({ content: error.message });
      }
    } finally {
      setLoadingKey("");
    }
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="logo-block">
            <div className="logo-chip">
              <GiAncientScrew />
            </div>
            <div>
              <Title heading={5} className="brand-title">
                RRAG
              </Title>
            </div>
          </div>

          <div className="nav-section">
            {NAV_ITEMS.map(item => (
              <button
                key={item.key}
                type="button"
                className={`nav-item${item.key === activeView ? " nav-item-active" : ""}`}
                onClick={() => setActiveView(item.key)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-copy">
                  <span className="nav-label">{item.label}</span>
                  <span className="nav-hint">{item.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-bottom">
          <Tooltip content={health.tooltip} position="right">
            <div className={`status-indicator status-${health.level}`}>
              <IconCheckCircleStroked />
              <span>{health.label}</span>
            </div>
          </Tooltip>
        </div>
      </aside>

      <main className="content-area">
        <div className="content-header">
          <div>
            <Title heading={3} className="page-title">
              {pageTitle(activeView)}
            </Title>
            <Paragraph className="page-copy">{pageDescription(activeView)}</Paragraph>
          </div>
        </div>

        <Banner
          type="info"
          icon={<IconLightningStroked />}
          closeIcon={null}
          description="This console talks to the same shared data repo as the CLI, so web and terminal workflows stay synchronized."
        />

        {activeView === "status" && (
          <StatusView
            meta={meta}
            status={status}
            runs={runs}
          />
        )}

        {activeView === "ask" && (
          <AskView
            question={question}
            setQuestion={setQuestion}
            explain={explain}
            setExplain={setExplain}
            askOutput={askOutput}
            loading={loadingKey === "ask"}
            onAsk={() => void handleAsk()}
          />
        )}

        {activeView === "update" && (
          <UpdateView
            note={note}
            setNote={setNote}
            updateOutput={updateOutput}
            reviewOutput={reviewOutput}
            parsedReview={parsedReview}
            loadingKey={loadingKey}
            onStage={() => void handleStageNote()}
            onApply={() => void handleApply()}
            onReview={() => void handleReview()}
            onMerge={() => void handleMerge()}
          />
        )}

        {activeView === "config" && (
          <ConfigView
            configState={configState}
            loadingKey={loadingKey}
            onRefresh={() => void refreshConfig()}
            onChange={(key, value) =>
              setConfigState(current => ({
                ...current,
                draft: {
                  ...(current.draft || {}),
                  [key]: value
                }
              }))
            }
            onSave={() => void handleConfigSave()}
          />
        )}
      </main>
    </div>
  );
}

function StatusView({ meta, status, runs }) {
  return (
    <div className="page-stack">
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <MetricCard title="Data root" value={meta.data?.dataRoot || "Loading..."} />
        </Col>
        <Col xs={24} md={8}>
          <MetricCard title="Model route" value={meta.data ? `${meta.data.llmProvider} · ${meta.data.llmModel}` : "Loading..."} />
        </Col>
        <Col xs={24} md={8}>
          <MetricCard title="Background recording" value={meta.data ? `runs ${meta.data.runsEnabled ? "on" : "off"} · archive ${meta.data.archiveEnabled ? "on" : "off"}` : "Loading..."} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card
            className="console-card"
            title={<SectionTitle icon={<IconPulse />} title="Current status" subtitle="A concise health view of the repo, retrieval pipeline, and LLM route" />}
          >
            <OutputBlock value={status} tall />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card
            className="console-card"
            title={<SectionTitle icon={<IconTreeTriangleDown />} title="Recent runs" subtitle="A lightweight timeline of recent ask, update, and rebuild activity" />}
          >
            <OutputBlock value={runs} tall />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function AskView({ question, setQuestion, explain, setExplain, askOutput, loading, onAsk }) {
  return (
    <Card
      className="console-card accent-card"
      title={<SectionTitle icon={<IconComment />} title="Ask the knowledge base" subtitle="Ask normally, or enable explain mode to inspect the retrieval route" />}
    >
      <Space vertical align="start" className="full-width" spacing="medium">
        <TextArea
          value={question}
          onChange={setQuestion}
          autosize={{ minRows: 6, maxRows: 14 }}
          placeholder="Ask something your local rrag knowledge base should answer..."
        />
        <div className="row-actions">
          <Space align="center">
            <Switch checked={explain} onChange={setExplain} />
            <Text>Explain retrieval path</Text>
          </Space>
          <Button type="primary" theme="solid" icon={<IconComment />} loading={loading} onClick={onAsk}>
            Ask rrag
          </Button>
        </div>
        <OutputBlock value={askOutput} tall />
      </Space>
    </Card>
  );
}

function UpdateView({
  note,
  setNote,
  updateOutput,
  reviewOutput,
  parsedReview,
  loadingKey,
  onStage,
  onApply,
  onReview,
  onMerge
}) {
  return (
    <div className="page-stack">
      <Card
        className="console-card"
        title={<SectionTitle icon={<IconChecklistStroked />} title="Stage content" subtitle="Collect new raw material into staging before you run the update workflow" />}
      >
        <Space vertical align="start" className="full-width" spacing="medium">
          <TextArea
            value={note}
            onChange={setNote}
            autosize={{ minRows: 8, maxRows: 16 }}
            placeholder="Paste a note, fact, or short document to stage into rrag..."
          />
          <div className="row-actions">
            <Text type="tertiary">This area is only for adding staging content. You can add several notes before applying them.</Text>
            <Button type="primary" theme="solid" icon={<IconChecklistStroked />} loading={loadingKey === "update-note"} onClick={onStage}>
              Add to staging
            </Button>
          </div>
          <OutputBlock value={updateOutput} />
        </Space>
      </Card>

      <Card
        className="console-card"
        title={<SectionTitle icon={<IconBranch />} title="Apply, review, merge" subtitle="Run the branch workflow end to end, then inspect the diff in an editor-style review panel" />}
      >
        <Space vertical align="start" className="full-width" spacing="medium">
          <Space wrap>
            <Button icon={<IconPulse />} loading={loadingKey === "update-apply"} onClick={onApply}>
              Apply staged update
            </Button>
            <Button icon={<IconBranch />} loading={loadingKey === "update-review"} onClick={onReview}>
              Review diff
            </Button>
            <Button type="secondary" theme="solid" loading={loadingKey === "update-merge"} onClick={onMerge}>
              Merge into main
            </Button>
          </Space>

          <Row gutter={[16, 16]} className="full-width">
            <Col xs={24} xl={9}>
              <OutputBlock value={updateOutput} tall />
            </Col>
            <Col xs={24} xl={15}>
              <ReviewPanel reviewOutput={reviewOutput} parsedReview={parsedReview} />
            </Col>
          </Row>
        </Space>
      </Card>
    </div>
  );
}

function ReviewPanel({ reviewOutput, parsedReview }) {
  const { header, diff } = parsedReview;

  return (
    <div className="review-shell">
      <div className="review-header-copy">
        <Text strong>Review output</Text>
        <Text type="tertiary">Branch metadata stays readable above, while the diff body is rendered in a code-oriented editor.</Text>
      </div>

      {header ? (
        <pre className="review-meta">{header}</pre>
      ) : (
        <div className="review-meta-empty">No branch review metadata yet.</div>
      )}

      <div className="editor-shell">
        <Editor
          height="420px"
          defaultLanguage="diff"
          language="diff"
          value={diff || reviewOutput || "No diff loaded yet."}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            wordWrap: "on",
            lineNumbers: "on",
            renderLineHighlight: "all",
            folding: true,
            glyphMargin: false
          }}
          theme="vs-dark"
        />
      </div>
    </div>
  );
}

function ConfigView({ configState, loadingKey, onRefresh, onChange, onSave }) {
  if (configState.loading) {
    return (
      <Card className="console-card">
        <div className="loading-block">
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (configState.error || !configState.draft) {
    return (
      <Card className="console-card">
        <Empty image={null} title="Unable to load config" description={configState.error || "No config available."} />
      </Card>
    );
  }

  const draft = configState.draft;

  return (
    <div className="page-stack">
      <Card
        className="console-card"
        title={<SectionTitle icon={<IconSetting />} title="Model connection" subtitle="Most important first: provider, endpoint, model, and auth env var" />}
        extra={
          <Space>
            <Button icon={<IconRefresh />} onClick={onRefresh}>Reload</Button>
            <Button type="primary" theme="solid" loading={loadingKey === "config-save"} onClick={onSave}>
              Save config
            </Button>
          </Space>
        }
      >
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <ConfigField
              label="LLM provider"
              help="Choose the backend your GUI and CLI should talk to."
              control={
                <Select value={draft.llm_provider} onChange={value => onChange("llm_provider", value)} style={{ width: "100%" }}>
                  <Select.Option value="ollama">ollama</Select.Option>
                  <Select.Option value="llama.cpp">llama.cpp</Select.Option>
                  <Select.Option value="openai-compatible">openai-compatible</Select.Option>
                </Select>
              }
            />
          </Col>
          <Col span={24}>
            <ConfigField
              label="Model name"
              help="The model identifier used for ask, planning, and branch selection."
              control={<Input value={draft.llm_model} onChange={value => onChange("llm_model", value)} />}
            />
          </Col>
          <Col span={24}>
            <ConfigField
              label="Base URL"
              help="Usually the local Ollama or llama.cpp endpoint, or a remote OpenAI-compatible endpoint."
              control={<Input value={draft.llm_base_url} onChange={value => onChange("llm_base_url", value)} />}
            />
          </Col>
          <Col span={24}>
            <ConfigField
              label="API key env var"
              help="The environment variable name that stores the API key."
              control={<Input value={draft.llm_api_key_env} onChange={value => onChange("llm_api_key_env", value)} />}
            />
          </Col>
        </Row>
      </Card>

      <Card
        className="console-card"
        title={<SectionTitle icon={<IconSetting />} title="Behavior" subtitle="User-visible defaults and operational toggles" />}
      >
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <ConfigField
              label="No-answer behavior"
              help="Decide whether ask should stay silent, reply with 'I don't know', or surface an error."
              control={
                <Select value={draft.ask_no_answer_behavior} onChange={value => onChange("ask_no_answer_behavior", value)} style={{ width: "100%" }}>
                  {NO_ANSWER_OPTIONS.map(option => (
                    <Select.Option key={option.value} value={option.value}>
                      {option.label}
                    </Select.Option>
                  ))}
                </Select>
              }
            />
          </Col>
          <Col span={24}>
            <ConfigField
              label="Record runs"
              help="Keep run artifacts for debugging and history views."
              control={<Switch checked={Boolean(draft.runs_enabled)} onChange={value => onChange("runs_enabled", value)} />}
            />
          </Col>
          <Col span={24}>
            <ConfigField
              label="Archive staging"
              help="Archive consumed staging inputs instead of clearing them directly."
              control={<Switch checked={Boolean(draft.archive_enabled)} onChange={value => onChange("archive_enabled", value)} />}
            />
          </Col>
        </Row>
      </Card>

      <Card
        className="console-card"
        title={<SectionTitle icon={<IconTreeTriangleDown />} title="Retrieval tuning" subtitle="Lower-priority tuning for branch expansion, depth, and passage collection" />}
      >
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <ConfigField
              label="branch_max_per_level"
              help="How many category branches remain alive at each tree level."
              control={<Input value={String(draft.branch_max_per_level)} onChange={value => onChange("branch_max_per_level", toNumber(value, draft.branch_max_per_level))} />}
            />
          </Col>
          <Col span={24}>
            <ConfigField
              label="branch_min_score"
              help="Minimum branch score before a category is explored further."
              control={<Input value={String(draft.branch_min_score)} onChange={value => onChange("branch_min_score", toNumber(value, draft.branch_min_score))} />}
            />
          </Col>
          <Col span={24}>
            <ConfigField
              label="branch_score_margin"
              help="How far behind the best branch another branch may fall while still staying alive."
              control={<Input value={String(draft.branch_score_margin)} onChange={value => onChange("branch_score_margin", toNumber(value, draft.branch_score_margin))} />}
            />
          </Col>
          <Col span={24}>
            <ConfigField
              label="max_depth"
              help="How deep retrieval may descend in the category tree."
              control={<Input value={String(draft.max_depth)} onChange={value => onChange("max_depth", toNumber(value, draft.max_depth))} />}
            />
          </Col>
          <Col span={24}>
            <ConfigField
              label="max_total_nodes"
              help="Overall traversal budget across the retrieval pass."
              control={<Input value={String(draft.max_total_nodes)} onChange={value => onChange("max_total_nodes", toNumber(value, draft.max_total_nodes))} />}
            />
          </Col>
          <Col span={24}>
            <ConfigField
              label="max_passages_per_skill"
              help="How many evidence passages to keep from each matched skill."
              control={<Input value={String(draft.max_passages_per_skill)} onChange={value => onChange("max_passages_per_skill", toNumber(value, draft.max_passages_per_skill))} />}
            />
          </Col>
        </Row>
      </Card>
    </div>
  );
}

function MetricCard({ title, value }) {
  return (
    <Card className="metric-card" shadows="hover">
      <Space vertical align="start" spacing="medium" className="full-width">
        <Text type="tertiary">{title}</Text>
        <Text strong className="metric-value">
          {value}
        </Text>
      </Space>
    </Card>
  );
}

function SectionTitle({ icon, title, subtitle }) {
  return (
    <div className="section-title">
      <div className="section-title-main">
        <span className="section-icon">{icon}</span>
        <span>{title}</span>
      </div>
      <Text type="tertiary">{subtitle}</Text>
    </div>
  );
}

function ConfigField({ label, help, control }) {
  return (
    <div className="config-field">
      <Text strong>{label}</Text>
      <Text type="tertiary">{help}</Text>
      {control}
    </div>
  );
}

function OutputBlock({ value, tall = false }) {
  return <pre className={`output-block${tall ? " output-block-tall" : ""}`}>{value || "No output yet."}</pre>;
}

function deriveHealth({ meta, status }) {
  if (meta.error) {
    return {
      level: "issue",
      label: "Issue detected",
      tooltip: meta.error
    };
  }
  if (meta.loading) {
    return {
      level: "checking",
      label: "Checking",
      tooltip: "The console is still checking the local data repo and model connection."
    };
  }
  if (!meta.data?.llmConfigured) {
    return {
      level: "issue",
      label: "Needs attention",
      tooltip: "The local knowledge repo is reachable, but the current LLM connection is not configured correctly."
    };
  }
  if (String(status).includes("failed")) {
    return {
      level: "issue",
      label: "Needs attention",
      tooltip: "The repo loaded, but the latest status snapshot reports at least one failed run or validation issue."
    };
  }
  return {
    level: "ok",
    label: "All good",
    tooltip: "The local data repo is reachable, the model route looks configured, and no obvious status issue is currently surfaced."
  };
}

function pageTitle(activeView) {
  switch (activeView) {
    case "status":
      return "Repository status";
    case "ask":
      return "Ask the knowledge base";
    case "update":
      return "Update workflow";
    case "config":
      return "Runtime configuration";
    default:
      return "rrag console";
  }
}

function pageDescription(activeView) {
  switch (activeView) {
    case "status":
      return "A concise but useful view of repo health, model reachability, and recent execution history.";
    case "ask":
      return "Ask a grounded question and optionally inspect the retrieval path, matched skills, and evidence passages.";
    case "update":
      return "First add new material into staging, then apply, review, and merge the resulting branch changes from the same page.";
    case "config":
      return "The most important settings come first: model route, visible behavior toggles, then lower-priority retrieval tuning.";
    default:
      return "";
  }
}

function renderResult(result) {
  if (!result.ok) {
    return [result.error, result.stderr, result.stdout].filter(Boolean).join("\n\n");
  }
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim() || "Done.";
}

function splitReviewOutput(value) {
  const text = String(value || "");
  const marker = "\ndiff --git ";
  const inlineMarkerIndex = text.indexOf("diff --git ");
  if (inlineMarkerIndex === -1) {
    return {
      header: text.trim(),
      diff: ""
    };
  }
  const splitIndex = text.indexOf(marker);
  if (splitIndex === -1) {
    return {
      header: "",
      diff: text.trim()
    };
  }
  return {
    header: text.slice(0, splitIndex).trim(),
    diff: text.slice(splitIndex + 1).trim()
  };
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return response.json();
}

function toNumber(raw, fallback) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
