import { useEffect, useMemo, useState } from 'react';
import bidLogoUrl from '../../../assets/bid-logo.svg';
import { trackPageView } from '../../../shared/analytics/analytics';
import { useToast } from '../../../shared/ui';
import type { SectionId } from '../../../shared/types/navigation';
import {
  OpenSourcePdfHighlighterPreview,
  type TemplatePdfFieldLocation,
  type TemplatePdfPageTaskAnchorTarget,
} from '../components/OpenSourcePdfHighlighterPreview';
import type {
  ProcurementAgentState,
  ProcurementTemplateItem,
  ProcurementTemplatePageTask,
  ProcurementTemplatePageTaskItem,
  ProcurementTemplatePageTaskPack,
} from '../types';

interface ProcurementDocumentGenerationPageProps {
  onNavigate: (section: SectionId) => void;
}

type GenerationStage = 'setup' | 'processing' | 'paused' | 'done' | 'preview';

interface GenerationTaskRow {
  id: string;
  page: number;
  pageTitle: string;
  label: string;
  group: string;
  type: string;
  required: boolean;
  risk: boolean;
  status: 'waiting' | 'running' | 'filled' | 'review';
  value: string;
  evidence: string;
}

const stageSteps = [
  { id: 'template', label: '选择采购模板', description: '加载模板 PDF 与页面任务包' },
  { id: 'demand', label: '上传采购需求', description: '导入本次项目需求方案' },
  { id: 'fill', label: '任务包填充', description: '逐项生成字段答案与证据' },
  { id: 'preview', label: '预览生成文件', description: '核对高亮、证据并导出' },
];

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function formatTime(value: string) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function templateTime(template: ProcurementTemplateItem) {
  const time = Date.parse(template.scannedAt || template.importedAt || '');
  return Number.isFinite(time) ? time : 0;
}

function taskTypeLabel(type: string) {
  if (type === 'calculated') return '计算';
  if (type === 'compound') return '复合';
  if (type === 'choice') return '单选';
  if (type === 'multiChoice') return '多选';
  return '填空';
}

function groupTone(group: string) {
  if (/资格|资质|业绩|人员/.test(group)) return 'warning';
  if (/评分|评审|报价/.test(group)) return 'purple';
  if (/合同|付款|商务|保证金/.test(group)) return 'green';
  return 'blue';
}

function createTaskRows(pageTaskPack: ProcurementTemplatePageTaskPack | null): GenerationTaskRow[] {
  return safeArray(pageTaskPack?.pages).flatMap((page) => safeArray(page.tasks).map((task, taskIndex) => ({
    id: `${task.key}_${String(taskIndex + 1).padStart(2, '0')}`,
    page: page.page,
    pageTitle: page.pageTitle || `第 ${page.page} 页`,
    label: task.label,
    group: task.group || task.chapter || '未分组',
    type: task.type,
    required: Boolean(task.required),
    risk: Boolean(task.risk),
    status: 'waiting' as const,
    value: createMockFilledValue(task),
    evidence: safeArray(task.anchors)[0]?.sourceText || task.prompt || '',
  })));
}

function createMockFilledValue(task: ProcurementTemplatePageTaskItem) {
  const label = task.label || '待填内容';
  if (task.type === 'choice') return safeArray(task.options)[0] || `按采购需求选择“${label}”`;
  if (task.type === 'multiChoice') return safeArray(task.options).slice(0, 2).join('、') || `按采购需求勾选“${label}”`;
  if (task.type === 'calculated') return `根据采购需求计算${label}`;
  if (task.type === 'compound') return `选择项及${label}补充内容待核对`;
  return `${label}待由采购需求提取`;
}

function buildPageTaskAnchors(pageTaskPack: ProcurementTemplatePageTaskPack | null): TemplatePdfPageTaskAnchorTarget[] {
  return safeArray(pageTaskPack?.pages).flatMap((page) => safeArray(page.tasks).flatMap((task) => safeArray(task.anchors).map((anchor, index) => ({
    id: `${task.key}_anchor_${String(index + 1).padStart(3, '0')}`,
    taskKey: task.key,
    label: task.label,
    page: anchor.pageHint || page.page,
    matchText: anchor.matchText,
    sourceText: anchor.sourceText,
  }))));
}

function findPageTaskByAnchorId(pageTaskPack: ProcurementTemplatePageTaskPack | null, anchorId: string) {
  if (!anchorId) return null;
  for (const page of safeArray(pageTaskPack?.pages)) {
    for (const task of safeArray(page.tasks)) {
      const found = safeArray(task.anchors).some((_anchor, index) => `${task.key}_anchor_${String(index + 1).padStart(3, '0')}` === anchorId);
      if (found) return { page, task };
    }
  }
  return null;
}

function ProcurementDocumentGenerationPage({ onNavigate }: ProcurementDocumentGenerationPageProps) {
  const [state, setState] = useState<ProcurementAgentState | null>(null);
  const [pageTaskPack, setPageTaskPack] = useState<ProcurementTemplatePageTaskPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<GenerationStage>('setup');
  const [completedCount, setCompletedCount] = useState(0);
  const [selectedAnchorId, setSelectedAnchorId] = useState('');
  const [anchorLocations, setAnchorLocations] = useState<Record<string, TemplatePdfFieldLocation>>({});
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const { showToast } = useToast();

  useEffect(() => {
    trackPageView('procurement-document-generation');
    void loadState();
  }, []);

  const templates = useMemo(
    () => safeArray(state?.templateLibrary).sort((first, second) => templateTime(second) - templateTime(first)),
    [state?.templateLibrary],
  );
  const activeTemplate = useMemo(() => {
    if (!state) return undefined;
    return templates.find((template) => template.id === state.activeTemplateId) || templates[0];
  }, [state, templates]);
  const demandDocument = useMemo(
    () => safeArray(state?.documents).find((document) => document.role === 'demand'),
    [state?.documents],
  );
  const taskRows = useMemo(() => createTaskRows(pageTaskPack), [pageTaskPack]);
  const visibleRows = useMemo<GenerationTaskRow[]>(() => taskRows.map((row, index) => {
    let status: GenerationTaskRow['status'] = 'waiting';
    if (index < completedCount) {
      status = row.risk ? 'review' : 'filled';
    } else if (index === completedCount && stage === 'processing') {
      status = 'running';
    }
    return { ...row, status };
  }), [completedCount, stage, taskRows]);
  const pageTaskAnchors = useMemo(() => buildPageTaskAnchors(pageTaskPack), [pageTaskPack]);
  const selectedTaskContext = useMemo(() => findPageTaskByAnchorId(pageTaskPack, selectedAnchorId), [pageTaskPack, selectedAnchorId]);
  const completedPercent = taskRows.length ? Math.round((Math.min(completedCount, taskRows.length) / taskRows.length) * 100) : 0;
  const reviewCount = visibleRows.filter((row) => row.status === 'review').length;
  const currentTask = visibleRows.find((row) => row.status === 'running') || visibleRows[Math.min(completedCount, Math.max(visibleRows.length - 1, 0))];
  const locatedAnchorCount = Object.values(anchorLocations).filter((location) => location.found).length;
  const currentPageTask = safeArray(pageTaskPack?.pages).find((page) => page.page === currentPdfPage);
  const backendAvailable = Boolean(window.yibiao?.procurementAgent);

  useEffect(() => {
    if (stage !== 'processing') return undefined;
    if (!taskRows.length) return undefined;
    if (completedCount >= taskRows.length) {
      setStage('done');
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setCompletedCount((value) => Math.min(taskRows.length, value + 1));
    }, 360);
    return () => window.clearTimeout(timer);
  }, [completedCount, stage, taskRows.length]);

  useEffect(() => {
    if (!pageTaskAnchors.length) {
      setSelectedAnchorId('');
      return;
    }
    const selectedStillExists = pageTaskAnchors.some((anchor) => anchor.id === selectedAnchorId);
    if (!selectedStillExists) {
      setSelectedAnchorId(pageTaskAnchors[0].id);
    }
  }, [pageTaskAnchors, selectedAnchorId]);

  const loadState = async () => {
    if (!window.yibiao?.procurementAgent) return;
    try {
      setLoading(true);
      const loaded = await window.yibiao.procurementAgent.loadState();
      setState(loaded);
      const templateId = loaded.activeTemplateId || loaded.templateLibrary[0]?.id || '';
      if (templateId && window.yibiao.procurementAgent.readTemplatePageTasks) {
        const tasks = await window.yibiao.procurementAgent.readTemplatePageTasks({ templateId });
        setPageTaskPack(tasks);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '加载智能生成页面失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectTemplate = async (template: ProcurementTemplateItem) => {
    if (!window.yibiao?.procurementAgent.selectTemplate) return;
    try {
      setLoading(true);
      const nextState = await window.yibiao.procurementAgent.selectTemplate({ templateId: template.id });
      setState(nextState);
      setCompletedCount(0);
      setStage('setup');
      setAnchorLocations({});
      const tasks = window.yibiao.procurementAgent.readTemplatePageTasks
        ? await window.yibiao.procurementAgent.readTemplatePageTasks({ templateId: template.id })
        : null;
      setPageTaskPack(tasks);
      showToast(`已选择模板：${template.name}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '选择模板失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const uploadDemandDocument = async () => {
    if (!window.yibiao?.procurementAgent.importDemandDocument) {
      showToast('当前环境无法上传采购需求文件，请在客户端中使用。', 'info');
      return;
    }
    try {
      setLoading(true);
      const result = await window.yibiao.procurementAgent.importDemandDocument();
      setState(result.state);
      showToast(result.message || '采购需求文件已上传', result.success ? 'success' : 'error');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '上传采购需求失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const startGeneration = () => {
    if (!activeTemplate) {
      showToast('请先选择采购模板。', 'info');
      return;
    }
    if (!taskRows.length) {
      showToast('当前模板没有页面任务包，请先在模板库执行 AI 解析。', 'info');
      return;
    }
    setStage('processing');
    setCompletedCount(0);
  };

  const togglePause = () => {
    setStage((value) => value === 'processing' ? 'paused' : 'processing');
  };

  const openPreview = () => {
    if (!activeTemplate?.previewPdfUrl) {
      showToast('当前模板缺少 PDF 预览，请回到模板库重新扫描。', 'error');
      return;
    }
    setStage('preview');
  };

  if (stage === 'preview') {
    return (
      <GenerationPreview
        template={activeTemplate}
        pageTaskPack={pageTaskPack}
        pageTaskAnchors={pageTaskAnchors}
        selectedAnchorId={selectedAnchorId}
        onSelectedAnchorIdChange={setSelectedAnchorId}
        anchorLocations={anchorLocations}
        onAnchorLocationsChange={setAnchorLocations}
        currentPdfPage={currentPdfPage}
        onCurrentPdfPageChange={setCurrentPdfPage}
        selectedTaskContext={selectedTaskContext}
        currentPageTask={currentPageTask}
        visibleRows={visibleRows}
        completedCount={Math.min(completedCount, taskRows.length)}
        reviewCount={reviewCount}
        locatedAnchorCount={locatedAnchorCount}
        onBack={() => setStage(completedCount >= taskRows.length ? 'done' : 'setup')}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <div className="procurement-agent-page procurement-generation-page">
      <header className="procurement-agent-topbar procurement-generation-topbar">
        <div className="procurement-brand-lockup">
          <span className="procurement-brand-mark" aria-hidden="true">
            <img src={bidLogoUrl} alt="" />
          </span>
          <div>
            <span className="section-kicker">Document Generation</span>
            <h2>招标文件智能生成</h2>
            <p>选择采购模板并上传采购需求方案，系统按页面任务包逐项填充字段，完成后进入预览核对与导出。</p>
          </div>
        </div>
        <div className="procurement-agent-actions">
          <span className={`procurement-model-pill${backendAvailable ? '' : ' is-preview'}`}>
            {backendAvailable ? '本地工作台' : '预览模式'}
          </span>
          <button type="button" className="procurement-secondary-button" disabled={loading} onClick={() => void loadState()}>
            刷新
          </button>
        </div>
      </header>

      <nav className="procurement-generation-steps" aria-label="招标文件智能生成阶段">
        {stageSteps.map((step, index) => {
          const done = (index === 0 && Boolean(activeTemplate))
            || (index === 1 && Boolean(demandDocument))
            || (index === 2 && completedCount >= taskRows.length && taskRows.length > 0);
          const active = (index === 0 && !activeTemplate)
            || (index === 1 && Boolean(activeTemplate) && !demandDocument)
            || (index === 2 && ['processing', 'paused', 'done'].includes(stage));
          return (
            <div key={step.id} className={`procurement-generation-step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}>
              <span>{done ? '✓' : index + 1}</span>
              <strong>{step.label}</strong>
              <small>{step.description}</small>
            </div>
          );
        })}
      </nav>

      <main className="procurement-agent-body">
        <section className="procurement-generation-workbench">
          <div className="procurement-generation-summary">
            <SummaryCard
              title="采购模板"
              value={activeTemplate?.name || '未选择模板'}
              meta={activeTemplate ? `${activeTemplate.stats?.fieldCount || 0} 个字段 · ${activeTemplate.stats?.outlineCount || 0} 个大纲节点` : '从模板库选择一个模板'}
              actionLabel="查看模板库"
              onAction={() => onNavigate('procurement-template-library')}
            />
            <SummaryCard
              title="采购需求文件"
              value={demandDocument?.fileName || '未上传需求方案'}
              meta={demandDocument ? `${demandDocument.parserLabel || '文档解析'} · ${formatTime(demandDocument.importedAt)}` : '支持 Word、PDF 等需求文件'}
              actionLabel={demandDocument ? '重新上传' : '上传文件'}
              onAction={() => void uploadDemandDocument()}
              disabled={loading || !backendAvailable}
            />
            <SummaryCard
              title="任务包"
              value={pageTaskPack ? `${pageTaskPack.pageCount || safeArray(pageTaskPack.pages).length} 页页面任务` : '未加载任务包'}
              meta={pageTaskPack ? `${taskRows.length} 个任务 · ${formatTime(pageTaskPack.generatedAt)}` : '请先在模板库完成 AI 解析'}
              actionLabel="模板详情"
              onAction={() => onNavigate('procurement-template-detail')}
            />
          </div>

          <section className="procurement-generation-main-grid">
            <article className="procurement-generation-panel procurement-generation-progress-panel">
              <div className="procurement-generation-panel-head">
                <div>
                  <span>Task Pack Filling</span>
                  <h3>任务包填充进度</h3>
                </div>
                <strong>{completedPercent}%</strong>
              </div>
              <div className="procurement-generation-progress-bar">
                <i style={{ width: `${completedPercent}%` }} />
              </div>
              <div className="procurement-generation-progress-metrics">
                <span><strong>{Math.min(completedCount, taskRows.length)}</strong>已完成</span>
                <span><strong>{taskRows.length}</strong>总任务</span>
                <span><strong>{reviewCount}</strong>需确认</span>
                <span><strong>{currentTask?.label || '等待开始'}</strong>当前任务</span>
              </div>
              <GenerationGroupProgress rows={visibleRows} />
            </article>

            <aside className="procurement-generation-panel procurement-generation-ai-panel">
              <div className="procurement-generation-panel-head">
                <div>
                  <span>AI Work Status</span>
                  <h3>AI 工作状态</h3>
                </div>
                <em className={`procurement-generation-status is-${stage}`}>{stageLabel(stage)}</em>
              </div>
              <div className="procurement-generation-current-task">
                <strong>{currentTask?.label || '等待任务启动'}</strong>
                <p>{currentTask ? `第 ${currentTask.page} 页 · ${currentTask.group} · ${taskTypeLabel(currentTask.type)}` : '上传采购需求后即可开始填充任务包。'}</p>
              </div>
              <div className="procurement-generation-token-grid">
                <span><strong>{stage === 'processing' ? '18.6' : '-'}</strong>Token/s</span>
                <span><strong>{stage === 'processing' ? '0.05s' : '-'}</strong>S/Token</span>
                <span><strong>{stage === 'processing' ? '并发 4' : '待机'}</strong>执行状态</span>
              </div>
              <div className="procurement-generation-log">
                {buildGenerationLogs(stage, currentTask, completedCount, taskRows.length).map((log) => <p key={log}>{log}</p>)}
              </div>
              <div className="procurement-generation-actions">
                {stage === 'processing' || stage === 'paused' ? (
                  <button type="button" className="procurement-secondary-button" onClick={togglePause}>
                    {stage === 'processing' ? '暂停' : '继续'}
                  </button>
                ) : (
                  <button type="button" className="procurement-primary-button" disabled={loading || !taskRows.length} onClick={startGeneration}>
                    开始填充
                  </button>
                )}
                <button type="button" className="procurement-primary-button" disabled={!taskRows.length || completedCount < taskRows.length} onClick={openPreview}>
                  查看预览
                </button>
              </div>
            </aside>
          </section>

          <section className="procurement-generation-panel procurement-generation-template-picker">
            <div className="procurement-generation-panel-head">
              <div>
                <span>Template Selection</span>
                <h3>选择采购模板</h3>
              </div>
              <button type="button" className="procurement-secondary-button" onClick={() => onNavigate('procurement-template-library')}>模板库管理</button>
            </div>
            <div className="procurement-generation-template-grid">
              {templates.length ? templates.slice(0, 6).map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={`procurement-generation-template-card${template.id === activeTemplate?.id ? ' is-active' : ''}`}
                  disabled={loading}
                  onClick={() => void selectTemplate(template)}
                >
                  <strong>{template.name}</strong>
                  <span>{template.fileName}</span>
                  <small>{template.stats?.fieldCount || 0} 字段 · {template.stats?.blockCount || 0} 原文块 · {formatTime(template.scannedAt)}</small>
                </button>
              )) : (
                <div className="procurement-empty-mini">暂无模板，请先进入模板库上传并解析模板。</div>
              )}
            </div>
          </section>

          <section className="procurement-generation-panel procurement-generation-queue">
            <div className="procurement-generation-panel-head">
              <div>
                <span>Task Queue</span>
                <h3>任务队列</h3>
              </div>
              <span>{visibleRows.length} 项</span>
            </div>
            <div className="procurement-generation-table-wrap">
              <table className="procurement-generation-table">
                <thead>
                  <tr>
                    <th>页面</th>
                    <th>任务</th>
                    <th>类型</th>
                    <th>分组</th>
                    <th>状态</th>
                    <th>生成结果</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length ? visibleRows.map((row) => (
                    <tr key={row.id} className={row.status === 'running' ? 'is-running' : ''}>
                      <td>第 {row.page} 页</td>
                      <td>
                        <strong>{row.label}{row.required ? ' *' : ''}</strong>
                        <small>{row.pageTitle}</small>
                      </td>
                      <td>{taskTypeLabel(row.type)}</td>
                      <td><span className={`procurement-generation-tag is-${groupTone(row.group)}`}>{row.group}</span></td>
                      <td><span className={`procurement-generation-row-status is-${row.status}`}>{rowStatusLabel(row.status)}</span></td>
                      <td>{row.status === 'waiting' ? '等待处理' : row.value}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6}>当前模板还没有页面任务包，请先在模板库执行 AI 解析。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  meta,
  actionLabel,
  onAction,
  disabled,
}: {
  title: string;
  value: string;
  meta: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <article className="procurement-generation-summary-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{meta}</p>
      <button type="button" className="procurement-secondary-button" disabled={disabled} onClick={onAction}>
        {actionLabel}
      </button>
    </article>
  );
}

function GenerationGroupProgress({ rows }: { rows: GenerationTaskRow[] }) {
  const groups = ['基础信息', '资格条件', '评分办法', '商务条款'];
  const groupRows = groups.map((label) => {
    const matched = rows.filter((row) => {
      if (label === '基础信息') return /基础|项目信息|封面|公告/.test(row.group) || row.page <= 5;
      if (label === '资格条件') return /资格|资质|业绩|人员/.test(row.group);
      if (label === '评分办法') return /评分|评审|报价/.test(row.group);
      return /合同|付款|商务|保证金|履约/.test(row.group);
    });
    const total = matched.length;
    const done = matched.filter((row) => row.status === 'filled' || row.status === 'review').length;
    return { label, total, done, percent: total ? Math.round((done / total) * 100) : 0 };
  });

  return (
    <div className="procurement-generation-group-list">
      {groupRows.map((group) => (
        <div key={group.label} className="procurement-generation-group-row">
          <div>
            <strong>{group.label}</strong>
            <span>{group.done}/{group.total || 0}</span>
          </div>
          <i><b style={{ width: `${group.percent}%` }} /></i>
        </div>
      ))}
    </div>
  );
}

function buildGenerationLogs(stage: GenerationStage, currentTask: GenerationTaskRow | undefined, completed: number, total: number) {
  if (!total) return ['等待加载页面任务包。'];
  if (stage === 'done') return [`任务包填充完成，共处理 ${total} 项。`, '已生成预览核对数据，可进入预览页面。'];
  if (stage === 'paused') return [`已暂停在第 ${Math.min(completed + 1, total)} 项：${currentTask?.label || '任务'}`];
  if (stage === 'processing') return [
    `正在处理第 ${Math.min(completed + 1, total)}/${total} 项：${currentTask?.label || '任务'}`,
    '正在匹配需求方案证据并生成字段值。',
    '高风险字段将标记为人工确认。',
  ];
  return ['工作台已就绪，点击开始填充后会逐项执行任务包。'];
}

function stageLabel(stage: GenerationStage) {
  if (stage === 'processing') return '处理中';
  if (stage === 'paused') return '已暂停';
  if (stage === 'done') return '已完成';
  if (stage === 'preview') return '预览中';
  return '待开始';
}

function rowStatusLabel(status: GenerationTaskRow['status']) {
  if (status === 'running') return '处理中';
  if (status === 'filled') return '已填充';
  if (status === 'review') return '待确认';
  return '等待';
}

function GenerationPreview({
  template,
  pageTaskPack,
  pageTaskAnchors,
  selectedAnchorId,
  onSelectedAnchorIdChange,
  anchorLocations,
  onAnchorLocationsChange,
  currentPdfPage,
  onCurrentPdfPageChange,
  selectedTaskContext,
  currentPageTask,
  visibleRows,
  completedCount,
  reviewCount,
  locatedAnchorCount,
  onBack,
  onNavigate,
}: {
  template?: ProcurementTemplateItem;
  pageTaskPack: ProcurementTemplatePageTaskPack | null;
  pageTaskAnchors: TemplatePdfPageTaskAnchorTarget[];
  selectedAnchorId: string;
  onSelectedAnchorIdChange: (anchorId: string) => void;
  anchorLocations: Record<string, TemplatePdfFieldLocation>;
  onAnchorLocationsChange: (locations: Record<string, TemplatePdfFieldLocation>) => void;
  currentPdfPage: number;
  onCurrentPdfPageChange: (page: number) => void;
  selectedTaskContext: { page: ProcurementTemplatePageTask; task: ProcurementTemplatePageTaskItem } | null;
  currentPageTask?: ProcurementTemplatePageTask;
  visibleRows: GenerationTaskRow[];
  completedCount: number;
  reviewCount: number;
  locatedAnchorCount: number;
  onBack: () => void;
  onNavigate: (section: SectionId) => void;
}) {
  const currentRows = visibleRows.filter((row) => row.page === currentPdfPage);
  const selectedRow = selectedTaskContext
    ? visibleRows.find((row) => row.page === selectedTaskContext.page.page && row.label === selectedTaskContext.task.label)
    : undefined;

  return (
    <section className="procurement-template-reader-page procurement-generation-preview-page">
      <header className="procurement-template-reader-toolbar procurement-generation-preview-toolbar">
        <div className="procurement-template-reader-title">
          <button type="button" className="procurement-secondary-button" onClick={onBack}>
            返回处理进度
          </button>
          <div>
            <h2>生成文件预览</h2>
            <p>{template?.name || '未选择模板'} · 基于任务包填充结果核对</p>
          </div>
        </div>
        <div className="procurement-generation-preview-actions">
          <span className="procurement-template-reader-chip">已生成</span>
          <span className="procurement-template-reader-chip">{completedCount}/{visibleRows.length} 任务完成</span>
          <span className="procurement-template-reader-chip">{reviewCount} 项需人工确认</span>
          <button type="button" className="procurement-secondary-button" onClick={() => onNavigate('procurement-template-detail')}>查看模板详情</button>
          <button type="button" className="procurement-secondary-button">重新生成</button>
          <button type="button" className="procurement-primary-button">导出 Word</button>
          <button type="button" className="procurement-secondary-button">导出 PDF</button>
        </div>
      </header>

      <main className="procurement-generation-preview-layout">
        <article className="procurement-generation-preview-document">
          {template?.previewPdfUrl ? (
            <OpenSourcePdfHighlighterPreview
              pdfUrl={template.previewPdfUrl}
              templateId={template.id}
              fields={[]}
              selectedFieldId=""
              onSelectedFieldChange={() => undefined}
              onFieldLocationsChange={() => undefined}
              onPageChange={onCurrentPdfPageChange}
              pageTaskAnchors={pageTaskAnchors}
              selectedPageTaskAnchorId={selectedAnchorId}
              onPageTaskAnchorLocationsChange={onAnchorLocationsChange}
            />
          ) : (
            <div className="procurement-empty-mini">当前模板缺少 PDF 预览，请返回模板库重新扫描。</div>
          )}
        </article>

        <aside className="procurement-generation-review-panel">
          <div className="procurement-generation-review-head">
            <div>
              <strong>填充结果核对</strong>
              <span>第 {currentPdfPage} 页 · {locatedAnchorCount}/{pageTaskAnchors.length} 锚点定位</span>
            </div>
            <button type="button" className="procurement-secondary-button" onClick={() => onNavigate('procurement-template-detail')}>
              原模板定位
            </button>
          </div>

          <div className="procurement-generation-review-tabs">
            <button type="button" className="is-active">当前页</button>
            <button type="button">需确认</button>
            <button type="button">全部任务</button>
          </div>

          <div className="procurement-generation-review-list">
            {safeArray(currentPageTask?.tasks).length ? safeArray(currentPageTask?.tasks).map((task) => (
              <PreviewTaskCard
                key={task.key}
                page={currentPageTask?.page || currentPdfPage}
                task={task}
                row={currentRows.find((item) => item.label === task.label)}
                active={safeArray(task.anchors).some((_anchor, index) => `${task.key}_anchor_${String(index + 1).padStart(3, '0')}` === selectedAnchorId)}
                locations={anchorLocations}
                onSelect={(anchorId) => onSelectedAnchorIdChange(anchorId)}
              />
            )) : (
              <div className="procurement-empty-mini">当前页没有待核对任务。</div>
            )}
          </div>

          <div className="procurement-generation-evidence-strip">
            <strong>证据溯源</strong>
            <p>{selectedTaskContext?.task.anchors[0]?.sourceText || selectedRow?.evidence || '点击右侧任务后，这里会显示对应模板原文锚点和需求文件证据。'}</p>
          </div>
        </aside>
      </main>
    </section>
  );
}

function PreviewTaskCard({
  page,
  task,
  row,
  active,
  locations,
  onSelect,
}: {
  page: number;
  task: ProcurementTemplatePageTaskItem;
  row?: GenerationTaskRow;
  active: boolean;
  locations: Record<string, TemplatePdfFieldLocation>;
  onSelect: (anchorId: string) => void;
}) {
  const anchors = safeArray(task.anchors);
  const firstAnchorId = anchors.length ? `${task.key}_anchor_001` : '';
  const locatedCount = anchors.filter((_anchor, index) => locations[`${task.key}_anchor_${String(index + 1).padStart(3, '0')}`]?.found).length;
  return (
    <article className={`procurement-generation-review-card${active ? ' is-active' : ''}${task.risk ? ' has-risk' : ''}`}>
      <div>
        <strong>{task.label}{task.required ? ' *' : ''}</strong>
        <span>{taskTypeLabel(task.type)}</span>
      </div>
      <p>{row?.value || createMockFilledValue(task)}</p>
      <small>第 {page} 页 · {task.group || task.chapter || '未分组'} · {locatedCount}/{anchors.length} 锚点</small>
      <div className="procurement-generation-review-card-actions">
        <button type="button" className="procurement-secondary-button">确认</button>
        <button type="button" className="procurement-secondary-button">编辑</button>
        <button type="button" className="procurement-primary-button" disabled={!firstAnchorId} onClick={() => onSelect(firstAnchorId)}>
          定位
        </button>
      </div>
    </article>
  );
}

export default ProcurementDocumentGenerationPage;
