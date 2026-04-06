import { useEffect, useMemo, useState } from "react";
import {
  Banner,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Layout,
  Row,
  Space,
  Spin,
  Switch,
  Tag,
  TextArea,
  Toast,
  Typography
} from "@douyinfe/semi-ui";
import {
  IconArticle,
  IconBranch,
  IconChecklistStroked,
  IconComment,
  IconDesktop,
  IconLightningStroked,
  IconPulse,
  IconRefresh,
  IconTreeTriangleDown
} from "@douyinfe/semi-icons";

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

const NAV_ITEMS = [
  { key: "overview", label: "Overview", eyebrow: "Control room", icon: <IconDesktop /> },
  { key: "ask", label: "Ask", eyebrow: "Grounded retrieval", icon: <IconComment /> },
  { key: "update", label: "Update", eyebrow: "Stage and apply", icon: <IconArticle /> },
  { key: "review", label: "Review", eyebrow: "Branch diff and merge", icon: <IconBranch /> },
  { key: "operations", label: "Operations", eyebrow: "Status, runs, maintenance", icon: <IconTreeTriangleDown /> }
];

export function App() {
  const [activeView, setActiveView] = useState("overview");
  const [meta, setMeta] = useState({ loading: true, data: null, error: "" });
  const [status, setStatus] = useState("Loading status...");
  const [runs, setRuns] = useState("Loading recent runs...");
  const [askOutput, setAskOutput] = useState("Ask output will appear here.");
  const [updateOutput, setUpdateOutput] = useState("Update activity will appear here.");
  const [reviewOutput, setReviewOutput] = useState("Review output will appear here.");
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

  async function bootstrap() {
    await Promise.all([refreshMeta(), refreshStatus(), refreshRuns()]);
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
      request: () => api("/api/status")
    });
  }

  async function refreshRuns() {
    await runCommand({
      key: "runs",
      assign: setRuns,
      request: () => api("/api/runs?limit=12")
    });
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
        })
    });
  }

  async function handleUpdate() {
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
      request: () => api("/api/update/review")
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

  async function handleClear() {
    await runCommand({
      key: "clear",
      assign: setStatus,
      request: () => api("/api/clear", { method: "POST" }),
      onSuccess: async () => {
        await Promise.all([refreshStatus(), refreshRuns()]);
      }
    });
  }

  async function runCommand({ key, assign, request, onSuccess }) {
    setLoadingKey(key);
    assign("Working...");
    try {
      const result = await request();
      const rendered = renderResult(result);
      assign(rendered);
      if (!result.ok) {
        Toast.error({ content: result.error || "Command failed." });
      } else {
        Toast.success({ content: "Done." });
        if (onSuccess) {
          await onSuccess(result);
        }
      }
    } catch (error) {
      assign(error.message);
      Toast.error({ content: error.message });
    } finally {
      setLoadingKey("");
    }
  }

  return (
    <Layout className="admin-shell">
      <aside className="sidebar-shell">
        <div className="brand-block">
          <Text className="eyebrow">rrag gui</Text>
          <Title heading={4} className="brand-title">
            Knowledge Console
          </Title>
          <Paragraph className="brand-copy">
            A proper control plane for reasoning-native retrieval, staged updates, and review-first knowledge changes.
          </Paragraph>
        </div>

        <div className="nav-list">
          {NAV_ITEMS.map(item => (
            <button
              type="button"
              key={item.key}
              className={`nav-item${item.key === activeView ? " nav-item-active" : ""}`}
              onClick={() => setActiveView(item.key)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-copy">
                <span className="nav-label">{item.label}</span>
                <span className="nav-eyebrow">{item.eyebrow}</span>
              </span>
            </button>
          ))}
        </div>

        <Card className="sidebar-summary" shadows="never">
          {renderMetaSummary(meta)}
        </Card>
      </aside>

      <Layout className="workspace-shell">
        <Header className="workspace-header">
          <div>
            <Text className="header-kicker">{activeItem.eyebrow}</Text>
            <Title heading={3} className="workspace-title">
              {activeItem.label}
            </Title>
          </div>
          <Space wrap spacing={8}>
            <Tag color={meta.data?.llmConfigured ? "green" : "red"}>
              {meta.data?.llmConfigured ? `LLM ${meta.data.llmProvider}` : "LLM not configured"}
            </Tag>
            <Tag color={meta.data?.runsEnabled ? "blue" : "grey"}>
              Runs {meta.data?.runsEnabled ? "on" : "off"}
            </Tag>
            <Tag color={meta.data?.archiveEnabled ? "amber" : "grey"}>
              Archive {meta.data?.archiveEnabled ? "on" : "off"}
            </Tag>
          </Space>
        </Header>

        <Content className="workspace-content">
          <Banner
            type="info"
            icon={<IconDesktop />}
            description="This console operates on the same shared rrag data repo as the CLI, so terminal and GUI workflows stay synchronized."
            closeIcon={null}
          />

          {activeView === "overview" && (
            <OverviewView
              meta={meta}
              status={status}
              runs={runs}
              onRefreshMeta={() => void refreshMeta()}
              onRefreshStatus={() => void refreshStatus()}
              onRefreshRuns={() => void refreshRuns()}
              onNavigate={setActiveView}
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
              loadingKey={loadingKey}
              onUpdate={() => void handleUpdate()}
              onApply={() => void handleApply()}
            />
          )}

          {activeView === "review" && (
            <ReviewView
              reviewOutput={reviewOutput}
              loadingKey={loadingKey}
              onReview={() => void handleReview()}
              onMerge={() => void handleMerge()}
            />
          )}

          {activeView === "operations" && (
            <OperationsView
              status={status}
              runs={runs}
              loadingKey={loadingKey}
              onRefreshStatus={() => void refreshStatus()}
              onRefreshRuns={() => void refreshRuns()}
              onRebuild={() => void handleRebuild()}
              onClear={() => void handleClear()}
            />
          )}
        </Content>
      </Layout>
    </Layout>
  );
}

function OverviewView({ meta, status, runs, onRefreshMeta, onRefreshStatus, onRefreshRuns, onNavigate }) {
  return (
    <div className="page-stack">
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <MetricCard
            title="Data root"
            value={meta.data?.dataRoot || "Loading..."}
            action={<Button icon={<IconRefresh />} onClick={onRefreshMeta}>Refresh meta</Button>}
          />
        </Col>
        <Col xs={24} md={8}>
          <MetricCard
            title="Model"
            value={meta.data ? `${meta.data.llmProvider} · ${meta.data.llmModel}` : "Loading..."}
            action={<Tag color={meta.data?.llmConfigured ? "green" : "red"}>{meta.data?.llmConfigured ? "configured" : "not configured"}</Tag>}
          />
        </Col>
        <Col xs={24} md={8}>
          <MetricCard
            title="Run recording"
            value={meta.data ? `runs ${meta.data.runsEnabled ? "on" : "off"} · archive ${meta.data.archiveEnabled ? "on" : "off"}` : "Loading..."}
            action={<Tag color="light-blue">shared repo</Tag>}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8}>
          <QuickActionCard
            icon={<IconComment />}
            title="Ask something"
            description="Use the retrieval workspace when you want an answer or want to inspect the explain trace."
            buttonText="Open Ask"
            onClick={() => onNavigate("ask")}
          />
        </Col>
        <Col xs={24} xl={8}>
          <QuickActionCard
            icon={<IconArticle />}
            title="Stage and apply knowledge"
            description="Move into the update workspace to stage notes and apply them into the shared knowledge base."
            buttonText="Open Update"
            onClick={() => onNavigate("update")}
          />
        </Col>
        <Col xs={24} xl={8}>
          <QuickActionCard
            icon={<IconBranch />}
            title="Review branch changes"
            description="Inspect the update branch diff and merge it back to main from the review workspace."
            buttonText="Open Review"
            onClick={() => onNavigate("review")}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card
            className="console-card"
            title={<CardTitle icon={<IconPulse />} title="Status snapshot" subtitle="A live snapshot of the knowledge repo health" />}
            extra={<Button icon={<IconRefresh />} onClick={onRefreshStatus}>Refresh</Button>}
          >
            <OutputBlock value={status} />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card
            className="console-card"
            title={<CardTitle icon={<IconTreeTriangleDown />} title="Recent runs" subtitle="The latest ask, update, and rebuild activity" />}
            extra={<Button icon={<IconRefresh />} onClick={onRefreshRuns}>Refresh</Button>}
          >
            <OutputBlock value={runs} />
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
      title={<CardTitle icon={<IconComment />} title="Ask" subtitle="Grounded retrieval with optional explain mode" />}
    >
      <Space vertical align="start" className="full-width" spacing="medium">
        <TextArea
          value={question}
          onChange={value => setQuestion(value)}
          autosize={{ minRows: 5, maxRows: 12 }}
          placeholder="Ask something your local rrag knowledge base should answer..."
        />
        <div className="row-actions">
          <Space align="center">
            <Switch checked={explain} onChange={checked => setExplain(checked)} />
            <Text>Explain retrieval path</Text>
          </Space>
          <Button type="primary" theme="solid" icon={<IconLightningStroked />} loading={loading} onClick={onAsk}>
            Ask rrag
          </Button>
        </div>
        <OutputBlock value={askOutput} tall />
      </Space>
    </Card>
  );
}

function UpdateView({ note, setNote, updateOutput, loadingKey, onUpdate, onApply }) {
  return (
    <div className="page-stack">
      <Card
        className="console-card"
        title={<CardTitle icon={<IconArticle />} title="Stage note" subtitle="Add raw material into staging before running the apply flow" />}
      >
        <Space vertical align="start" className="full-width" spacing="medium">
          <TextArea
            value={note}
            onChange={value => setNote(value)}
            autosize={{ minRows: 8, maxRows: 16 }}
            placeholder="Paste a note, fact, or short document to stage into rrag..."
          />
          <div className="row-actions">
            <Text type="tertiary">You can stage multiple notes before applying them into the active update branch.</Text>
            <Button
              type="primary"
              theme="solid"
              icon={<IconChecklistStroked />}
              loading={loadingKey === "update-note"}
              onClick={onUpdate}
            >
              Add to staging
            </Button>
          </div>
        </Space>
      </Card>

      <Card
        className="console-card"
        title={<CardTitle icon={<IconPulse />} title="Apply staged update" subtitle="Run planner, executor, validation, and data-repo commit flow" />}
        extra={
          <Button icon={<IconPulse />} loading={loadingKey === "update-apply"} onClick={onApply}>
            Apply staged update
          </Button>
        }
      >
        <OutputBlock value={updateOutput} tall />
      </Card>
    </div>
  );
}

function ReviewView({ reviewOutput, loadingKey, onReview, onMerge }) {
  return (
    <div className="page-stack">
      <Card
        className="console-card"
        title={<CardTitle icon={<IconBranch />} title="Review current update branch" subtitle="Inspect the diff against main before promoting it" />}
        extra={
          <Space>
            <Button icon={<IconRefresh />} loading={loadingKey === "update-review"} onClick={onReview}>
              Load branch diff
            </Button>
            <Button type="secondary" theme="solid" loading={loadingKey === "update-merge"} onClick={onMerge}>
              Merge into main
            </Button>
          </Space>
        }
      >
        <OutputBlock value={reviewOutput} tall />
      </Card>
    </div>
  );
}

function OperationsView({ status, runs, loadingKey, onRefreshStatus, onRefreshRuns, onRebuild, onClear }) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={12}>
        <Card
          className="console-card"
          title={<CardTitle icon={<IconPulse />} title="Repository status" subtitle="Health, topology, LLM mode, and repo-level counters" />}
          extra={
            <Space>
              <Button icon={<IconRefresh />} loading={loadingKey === "status"} onClick={onRefreshStatus}>
                Refresh
              </Button>
              <Button loading={loadingKey === "rebuild"} onClick={onRebuild}>
                Rebuild dry run
              </Button>
            </Space>
          }
        >
          <OutputBlock value={status} tall />
        </Card>
      </Col>
      <Col xs={24} xl={12}>
        <Card
          className="console-card"
          title={<CardTitle icon={<IconTreeTriangleDown />} title="Run history" subtitle="Recent execution history across ask, update, and rebuild" />}
          extra={
            <Space>
              <Button icon={<IconRefresh />} loading={loadingKey === "runs"} onClick={onRefreshRuns}>
                Refresh
              </Button>
              <Button type="danger" theme="borderless" loading={loadingKey === "clear"} onClick={onClear}>
                Clear caches
              </Button>
            </Space>
          }
        >
          <OutputBlock value={runs} tall />
        </Card>
      </Col>
    </Row>
  );
}

function renderMetaSummary(meta) {
  if (meta.loading) {
    return (
      <div className="meta-loading">
        <Spin size="large" />
      </div>
    );
  }

  if (meta.error) {
    return <Empty title="Unable to load state" description={meta.error} image={null} />;
  }

  const data = meta.data;
  return (
    <Space vertical spacing="medium" align="start" className="full-width">
      <Text strong>Current workspace</Text>
      <Tag color={data.llmConfigured ? "green" : "red"}>
        {data.llmConfigured ? `LLM ${data.llmProvider}` : "LLM not configured"}
      </Tag>
      <Divider margin="6px" />
      <MetaLine label="Data root" value={data.dataRoot} />
      <MetaLine label="Model" value={data.llmModel} />
      <MetaLine label="Runs" value={data.runsEnabled ? "enabled" : "disabled"} />
      <MetaLine label="Archive" value={data.archiveEnabled ? "enabled" : "disabled"} />
    </Space>
  );
}

function MetricCard({ title, value, action }) {
  return (
    <Card className="metric-card" shadows="hover">
      <Space vertical align="start" spacing="medium" className="full-width">
        <Text type="tertiary">{title}</Text>
        <Text strong className="metric-value">
          {value}
        </Text>
        {action}
      </Space>
    </Card>
  );
}

function QuickActionCard({ icon, title, description, buttonText, onClick }) {
  return (
    <Card className="console-card quick-card" shadows="hover">
      <Space vertical align="start" spacing="medium">
        <span className="quick-card-icon">{icon}</span>
        <div>
          <Title heading={5}>{title}</Title>
          <Paragraph className="quick-card-copy">{description}</Paragraph>
        </div>
        <Button type="primary" theme="light" onClick={onClick}>
          {buttonText}
        </Button>
      </Space>
    </Card>
  );
}

function MetaLine({ label, value }) {
  return (
    <div className="meta-line">
      <Text type="tertiary">{label}</Text>
      <Text strong>{value}</Text>
    </div>
  );
}

function CardTitle({ icon, title, subtitle }) {
  return (
    <div className="card-title">
      <div className="card-title-main">
        <span className="card-title-icon">{icon}</span>
        <span>{title}</span>
      </div>
      <Text type="tertiary">{subtitle}</Text>
    </div>
  );
}

function OutputBlock({ value, tall = false }) {
  return <pre className={`output-block${tall ? " output-block-tall" : ""}`}>{value || "No output yet."}</pre>;
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

function renderResult(result) {
  if (!result.ok) {
    return [result.error, result.stderr, result.stdout].filter(Boolean).join("\n\n");
  }
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim() || "Done.";
}
