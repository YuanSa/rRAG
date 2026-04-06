import { useEffect, useState } from "react";
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

export function App() {
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

  const metaCard = renderMetaCard(meta);

  return (
    <Layout className="app-shell">
      <Header className="hero-shell">
        <div className="hero-grid">
          <div>
            <Text className="eyebrow">rrag gui</Text>
            <Title heading={2} className="hero-title">
              React + Semi console for reasoning-native knowledge operations
            </Title>
            <Paragraph className="hero-paragraph">
              Ask grounded questions, stage notes, apply updates, inspect branch diffs, and merge reviewed knowledge
              updates from one local control room.
            </Paragraph>
            <Space wrap spacing={8}>
              <Tag color="light-blue" prefixIcon={<IconLightningStroked />}>Ask + Explain</Tag>
              <Tag color="green" prefixIcon={<IconBranch />}>Review before merge</Tag>
              <Tag color="orange" prefixIcon={<IconTreeTriangleDown />}>Taxonomy-aware retrieval</Tag>
            </Space>
          </div>
          <Card className="meta-card" shadows="hover">
            {metaCard}
          </Card>
        </div>
      </Header>

      <Content className="content-shell">
        <Banner
          type="info"
          icon={<IconDesktop />}
          description="This console talks to the same local rrag data repo your CLI uses, so actions here and terminal actions stay in sync."
          closeIcon={null}
        />

        <Row gutter={[16, 16]} className="main-grid">
          <Col xs={24} xl={12}>
            <Card
              title={<CardTitle icon={<IconComment />} title="Ask" subtitle="Grounded retrieval with optional explain mode" />}
              headerLine={false}
              className="console-card accent-card"
            >
              <Space vertical align="start" className="full-width" spacing="medium">
                <TextArea
                  value={question}
                  onChange={value => setQuestion(value)}
                  autosize={{ minRows: 4, maxRows: 10 }}
                  placeholder="Ask something your local rrag knowledge base should answer..."
                />
                <div className="row-actions">
                  <Space align="center">
                    <Switch checked={explain} onChange={checked => setExplain(checked)} />
                    <Text>Explain retrieval path</Text>
                  </Space>
                  <Button
                    type="primary"
                    theme="solid"
                    icon={<IconLightningStroked />}
                    loading={loadingKey === "ask"}
                    onClick={() => void handleAsk()}
                  >
                    Ask rrag
                  </Button>
                </div>
                <OutputBlock value={askOutput} />
              </Space>
            </Card>
          </Col>

          <Col xs={24} xl={12}>
            <Card
              title={<CardTitle icon={<IconArticle />} title="Update" subtitle="Stage notes directly into the shared workspace" />}
              headerLine={false}
              className="console-card"
            >
              <Space vertical align="start" className="full-width" spacing="medium">
                <TextArea
                  value={note}
                  onChange={value => setNote(value)}
                  autosize={{ minRows: 5, maxRows: 12 }}
                  placeholder="Paste a note, fact, or short document to stage into rrag..."
                />
                <div className="row-actions">
                  <Space wrap>
                    <Button
                      type="primary"
                      theme="solid"
                      icon={<IconChecklistStroked />}
                      loading={loadingKey === "update-note"}
                      onClick={() => void handleUpdate()}
                    >
                      Add to staging
                    </Button>
                    <Button
                      icon={<IconPulse />}
                      loading={loadingKey === "update-apply"}
                      onClick={() => void handleApply()}
                    >
                      Apply staged update
                    </Button>
                  </Space>
                </div>
                <OutputBlock value={updateOutput} />
              </Space>
            </Card>
          </Col>

          <Col xs={24} xl={12}>
            <Card
              title={<CardTitle icon={<IconBranch />} title="Review and merge" subtitle="Inspect the current update branch before it lands in main" />}
              headerLine={false}
              className="console-card"
            >
              <Space vertical align="start" className="full-width" spacing="medium">
                <Space wrap>
                  <Button icon={<IconRefresh />} loading={loadingKey === "update-review"} onClick={() => void handleReview()}>
                    Load branch diff
                  </Button>
                  <Button type="secondary" theme="solid" loading={loadingKey === "update-merge"} onClick={() => void handleMerge()}>
                    Merge into main
                  </Button>
                </Space>
                <OutputBlock value={reviewOutput} />
              </Space>
            </Card>
          </Col>

          <Col xs={24} xl={12}>
            <Card
              title={<CardTitle icon={<IconPulse />} title="Repository state" subtitle="Inspect the local knowledge repo and run lightweight maintenance" />}
              headerLine={false}
              className="console-card"
            >
              <Space vertical align="start" className="full-width" spacing="medium">
                <Space wrap>
                  <Button icon={<IconRefresh />} loading={loadingKey === "status"} onClick={() => void refreshStatus()}>
                    Refresh status
                  </Button>
                  <Button loading={loadingKey === "rebuild"} onClick={() => void handleRebuild()}>
                    Rebuild dry run
                  </Button>
                  <Button type="danger" theme="borderless" loading={loadingKey === "clear"} onClick={() => void handleClear()}>
                    Clear caches
                  </Button>
                </Space>
                <OutputBlock value={status} />
              </Space>
            </Card>
          </Col>

          <Col span={24}>
            <Card
              title={<CardTitle icon={<IconTreeTriangleDown />} title="Recent runs" subtitle="The latest ask / update / rebuild execution history" />}
              headerLine={false}
              className="console-card"
              extra={
                <Button icon={<IconRefresh />} loading={loadingKey === "runs"} onClick={() => void refreshRuns()}>
                  Refresh runs
                </Button>
              }
            >
              <OutputBlock value={runs} tall />
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}

function renderMetaCard(meta) {
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
      <Space wrap spacing={8}>
        <Tag color={data.llmConfigured ? "green" : "red"}>
          {data.llmConfigured ? `LLM: ${data.llmProvider}` : "LLM not configured"}
        </Tag>
        <Tag color={data.runsEnabled ? "blue" : "grey"}>Runs: {data.runsEnabled ? "on" : "off"}</Tag>
        <Tag color={data.archiveEnabled ? "amber" : "grey"}>Archive: {data.archiveEnabled ? "on" : "off"}</Tag>
      </Space>
      <Divider margin="8px" />
      <MetaLine label="Data root" value={data.dataRoot} />
      <MetaLine label="Provider" value={data.llmProvider} />
      <MetaLine label="Model" value={data.llmModel} />
    </Space>
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
