import { useEffect, useMemo, useState } from 'react';
import { trackPageView } from '../../../shared/analytics/analytics';
import { useToast } from '../../../shared/ui';
import bidLogoUrl from '../../../assets/bid-logo.svg';
import { OpenSourcePdfHighlighterPreview, type TemplatePdfFieldLocation } from '../components/OpenSourcePdfHighlighterPreview';
import type {
  ProcurementActionResult,
  ProcurementAgentState,
  ProcurementAnswer,
  ProcurementField,
  ProcurementFieldStatus,
  ProcurementSourceBlock,
  ProcurementTemplateBlock,
  ProcurementTemplateField,
  ProcurementTask,
  ProcurementTemplateQuestion,
} from '../types';

type ProcurementStepId = 'workspace' | 'new-task' | 'upload' | 'fields' | 'preview' | 'quality';
type TemplateFieldViewMode = 'page' | 'chapter' | 'json';

interface ProcurementStep {
  id: ProcurementStepId;
  label: string;
  description: string;
}

interface TemplateFieldGroup {
  id: string;
  title: string;
  order: number;
  fields: ProcurementTemplateField[];
}

const procurementSteps: ProcurementStep[] = [
  { id: 'workspace', label: '模板库', description: '上传扫描并加载模板' },
  { id: 'new-task', label: '新建任务', description: '配置采购文件基础信息' },
  { id: 'upload', label: '上传解析', description: '上传需求方案并切分证据' },
  { id: 'fields', label: '模板答题', description: '填空选择并定位溯源' },
  { id: 'preview', label: '文件预览', description: '按章节预览采购文件' },
  { id: 'quality', label: '质检导出', description: '检查风险并导出成果' },
];

const emptyState: ProcurementAgentState = {
  task: {
    id: '',
    projectName: '',
    projectCode: '',
    procurementType: '工程类',
    procurementMethod: '询比采购',
    reviewMethod: '经评审的最低投标价法',
    templateName: '工程类询比采购文件模板',
    owner: '',
    status: 'draft',
    createdAt: '',
    updatedAt: '',
  },
  documents: [],
  templateLibrary: [],
  activeTemplateId: '',
  templateOutline: [],
  templateBlocks: [],
  templateFields: [],
  templateTaskPack: {
    templateId: '',
    templateName: '',
    schemaVersion: '1.0.0',
    taskCount: 0,
    generatedAt: '',
    tasks: [],
  },
  templateScan: {
    status: 'idle',
    message: '请先上传询比采购文件模板',
    scannedAt: '',
    normalizedAt: '',
    outlineCount: 0,
    blockCount: 0,
    fieldCount: 0,
    warningCount: 0,
    normalizedHeadingCount: 0,
    warnings: [],
  },
  questions: [],
  sourceBlocks: [],
  answers: [],
  fields: [],
  extraction: {
    status: 'idle',
    message: '等待上传采购需求方案',
    extractedAt: '',
    fieldCount: 0,
    missingCount: 0,
    riskCount: 0,
    pendingCount: 0,
  },
  markdownPreview: '',
  logs: [],
};

const statusLabels: Record<ProcurementFieldStatus, string> = {
  confirmed: '已确认',
  pending: '待确认',
  risk: '高风险',
  missing: '缺失',
};

function createCoverBlockIdSet(blocks: ProcurementTemplateBlock[]) {
  const firstHeading = blocks.find((block) => block.isHeading && block.outlineId !== 'tpl_out_root');
  const firstHeadingOrder = firstHeading?.order ?? Number.POSITIVE_INFINITY;
  return new Set(
    blocks
      .filter((block) => block.outlineId === 'tpl_out_root' || block.order < firstHeadingOrder)
      .map((block) => block.id),
  );
}

function buildTemplateFieldGroups(state: ProcurementAgentState): TemplateFieldGroup[] {
  const outlineById = new Map(state.templateOutline.map((node) => [node.id, node]));
  const coverBlockIds = createCoverBlockIdSet(state.templateBlocks);
  const groupMap = new Map<string, TemplateFieldGroup>();

  state.templateFields.forEach((field) => {
    const isCoverField = coverBlockIds.has(field.blockId);
    const outline = outlineById.get(field.outlineId);
    const groupId = isCoverField ? 'cover' : field.outlineId || 'ungrouped';
    const groupTitle = isCoverField ? '封面' : outline?.title || '未归类章节';
    const groupOrder = isCoverField ? -1 : outline?.order ?? 9999;
    const group = groupMap.get(groupId) || {
      id: groupId,
      title: groupTitle,
      order: groupOrder,
      fields: [],
    };
    group.fields.push(field);
    groupMap.set(groupId, group);
  });

  return [...groupMap.values()]
    .map((group) => ({
      ...group,
      fields: [...group.fields].sort((first, second) => first.blockOrder - second.blockOrder),
    }))
    .sort((first, second) => first.order - second.order);
}

function createTemplateFieldJson(groups: TemplateFieldGroup[]) {
  const result: Record<string, Record<string, string>> = {};
  groups.forEach((group) => {
    let groupKey = group.title;
    if (Object.prototype.hasOwnProperty.call(result, groupKey)) {
      groupKey = `${group.title}_${group.id}`;
    }
    const groupValue: Record<string, string> = {};
    group.fields.forEach((field) => {
      let fieldKey = field.key;
      if (Object.prototype.hasOwnProperty.call(groupValue, fieldKey)) {
        fieldKey = `${field.key}_${field.blockId}`;
      }
      groupValue[fieldKey] = '';
    });
    result[groupKey] = groupValue;
  });
  return result;
}

function ProcurementAgentPage() {
  const [activeStep, setActiveStep] = useState<ProcurementStepId>('workspace');
  const [state, setState] = useState<ProcurementAgentState>(emptyState);
  const [taskDraft, setTaskDraft] = useState<Partial<ProcurementTask>>(emptyState.task);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({});
  const [selectedChapter, setSelectedChapter] = useState('');
  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const backendAvailable = Boolean(window.yibiao?.procurementAgent);

  const currentStep = useMemo(() => procurementSteps.find((step) => step.id === activeStep) ?? procurementSteps[0], [activeStep]);
  const answerByQuestion = useMemo(() => buildAnswerMap(state), [state]);
  const chapters = useMemo(() => [...new Set(state.questions.map((question) => question.chapter))], [state.questions]);
  const activeChapter = selectedChapter || chapters[0] || '';
  const visibleQuestions = useMemo(
    () => state.questions.filter((question) => !activeChapter || question.chapter === activeChapter),
    [activeChapter, state.questions],
  );
  const selectedQuestion = useMemo(
    () => state.questions.find((question) => question.id === selectedQuestionId) || visibleQuestions[0] || state.questions[0],
    [selectedQuestionId, state.questions, visibleQuestions],
  );
  const selectedAnswer = selectedQuestion ? answerByQuestion.get(selectedQuestion.id) : undefined;
  const highlightedSourceIds = selectedAnswer?.sourceBlockIds || [];
  const selectedSourceBlock = state.sourceBlocks.find((block) => block.id === selectedBlockId)
    || state.sourceBlocks.find((block) => highlightedSourceIds.includes(block.id));

  useEffect(() => {
    trackPageView('procurement-agent');
    void loadState();
  }, []);

  useEffect(() => {
    setTaskDraft(state.task);
    setQuestionDrafts(Object.fromEntries(state.questions.map((question) => {
      const answer = answerByQuestion.get(question.id);
      return [question.id, answer?.confirmedValue || answer?.value || ''];
    })));
    if (!selectedChapter && state.questions.length) {
      setSelectedChapter(state.questions[0].chapter);
    }
    if (!selectedQuestionId && state.questions.length) {
      setSelectedQuestionId(state.questions[0].id);
    }
  }, [answerByQuestion, selectedChapter, selectedQuestionId, state]);

  const loadState = async () => {
    if (!window.yibiao?.procurementAgent) {
      return;
    }

    try {
      const loaded = await window.yibiao.procurementAgent.loadState();
      if (loaded) {
        setState(loaded);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '加载采购智能体状态失败', 'error');
    }
  };

  const runAction = async (
    action: () => Promise<ProcurementAgentState | ProcurementActionResult>,
    successFallback: string,
  ) => {
    if (!window.yibiao?.procurementAgent) {
      showToast('当前是浏览器预览模式，请在 Electron 客户端中使用上传文件、解析和模型抽取能力。', 'info', { title: '预览模式' });
      return null;
    }

    try {
      setLoading(true);
      const result = await action();
      const nextState = 'state' in result ? result.state : result;
      setState(nextState);
      const success = 'success' in result ? result.success : true;
      const message = 'message' in result ? result.message : successFallback;
      showToast(message || successFallback, success ? 'success' : 'error');
      return result;
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const saveTask = async () => {
    if (!backendAvailable) {
      setState((prev) => ({
        ...prev,
        task: {
          ...prev.task,
          ...taskDraft,
          updatedAt: new Date().toISOString(),
        },
      }));
      setActiveStep('upload');
      showToast('已在前端预览中暂存任务信息。真实上传解析请使用 Electron 客户端。', 'info', { title: '预览模式' });
      return;
    }

    const result = await runAction(
      () => window.yibiao!.procurementAgent.saveTask(taskDraft),
      '任务信息已保存',
    );
    if (result) {
      setActiveStep('upload');
    }
  };

  const importTemplateDocument = async () => {
    const result = await runAction(
      () => window.yibiao!.procurementAgent.importTemplateDocument(),
      '模板导入并扫描完成',
    );
    if (result && 'success' in result && result.success) {
      setActiveStep('workspace');
    }
  };

  const importDemandDocument = async () => {
    const result = await runAction(
      () => window.yibiao!.procurementAgent.importDemandDocument(),
      '采购需求方案解析完成',
    );
    if (result && 'success' in result && result.success) {
      setActiveStep('upload');
    }
  };

  const extractFields = async () => {
    const result = await runAction(
      () => window.yibiao!.procurementAgent.extractFields(),
      '模板题目答题完成',
    );
    if (result && 'success' in result && result.success) {
      setActiveStep('fields');
    }
  };

  const updateQuestion = async (questionId: string, status?: ProcurementFieldStatus, valueOverride?: string) => {
    const value = valueOverride ?? questionDrafts[questionId] ?? '';
    const nextStatus = status || (value.trim() ? 'confirmed' : 'missing');
    if (!backendAvailable) {
      setState((prev) => updateQuestionLocally(prev, questionId, value, nextStatus));
      return;
    }

    const nextState = await window.yibiao?.procurementAgent.updateField({
      id: questionId,
      confirmedValue: value,
      status: nextStatus,
    });
    if (nextState) {
      setState(nextState);
    }
  };

  const acceptHighConfidence = async () => {
    await runAction(
      () => window.yibiao!.procurementAgent.acceptHighConfidence(90),
      '已接受高置信模板答案',
    );
  };

  const clearTask = async () => {
    await runAction(
      () => window.yibiao!.procurementAgent.clear(),
      '已清空当前采购任务',
    );
    setActiveStep('workspace');
  };

  const selectQuestion = (question: ProcurementTemplateQuestion) => {
    setSelectedQuestionId(question.id);
    setSelectedChapter(question.chapter);
    const answer = answerByQuestion.get(question.id);
    if (answer?.sourceBlockIds?.length) {
      setSelectedBlockId(answer.sourceBlockIds[0]);
    }
  };

  const selectSourceBlock = (blockId: string) => {
    setSelectedBlockId(blockId);
    const linkedAnswer = state.answers.find((answer) => answer.sourceBlockIds.includes(blockId));
    const linkedQuestion = linkedAnswer ? state.questions.find((question) => question.id === linkedAnswer.questionId) : undefined;
    if (linkedQuestion) {
      setSelectedQuestionId(linkedQuestion.id);
      setSelectedChapter(linkedQuestion.chapter);
    }
  };

  return (
    <div className="procurement-agent-page">
      <header className="procurement-agent-topbar">
        <div className="procurement-brand-lockup">
          <span className="procurement-brand-mark" aria-hidden="true">
            <img src={bidLogoUrl} alt="" />
          </span>
          <div>
            <span className="section-kicker">Procurement Agent</span>
            <h2>询比采购文件智能体</h2>
            <p>把模板拆成填空题和选择题，从采购需求方案中提取答案，并在原始文件预览中定位来源证据。</p>
          </div>
        </div>
        <div className="procurement-agent-actions">
          <span className={`procurement-model-pill${backendAvailable ? '' : ' is-preview'}`}>
            {backendAvailable ? '本地模型：Gemma 4 31B' : '预览模式：请使用 Electron 启用后端'}
          </span>
          <button type="button" className="procurement-secondary-button" disabled={loading || !backendAvailable} onClick={importTemplateDocument}>
            {loading ? '扫描中...' : '上传模板'}
          </button>
          <button type="button" className="procurement-primary-button" onClick={() => setActiveStep('new-task')}>新建采购任务</button>
        </div>
      </header>

      <nav className="procurement-step-tabs" aria-label="询比采购文件生成步骤">
        {procurementSteps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            className={`procurement-step-tab${step.id === activeStep ? ' is-active' : ''}`}
            onClick={() => setActiveStep(step.id)}
          >
            <span>{index + 1}</span>
            <strong>{step.label}</strong>
            <small>{step.description}</small>
          </button>
        ))}
      </nav>

      <main className="procurement-agent-body" aria-label={currentStep.label}>
        {activeStep === 'workspace' && (
          <TemplateLibraryPanel
            state={state}
            onImport={importTemplateDocument}
            onNext={() => setActiveStep('new-task')}
            loading={loading}
            backendAvailable={backendAvailable}
          />
        )}
        {activeStep === 'new-task' && (
          <NewTaskPanel taskDraft={taskDraft} setTaskDraft={setTaskDraft} onNext={saveTask} loading={loading} />
        )}
        {activeStep === 'upload' && (
          <UploadPanel
            state={state}
            loading={loading}
            backendAvailable={backendAvailable}
            onImport={importDemandDocument}
            onExtract={extractFields}
            onNext={() => setActiveStep('fields')}
          />
        )}
        {activeStep === 'fields' && (
          <FieldConfirmPanel
            state={state}
            chapters={chapters}
            activeChapter={activeChapter}
            visibleQuestions={visibleQuestions}
            selectedQuestion={selectedQuestion}
            selectedAnswer={selectedAnswer}
            selectedSourceBlock={selectedSourceBlock}
            highlightedSourceIds={highlightedSourceIds}
            questionDrafts={questionDrafts}
            setQuestionDrafts={setQuestionDrafts}
            setSelectedChapter={setSelectedChapter}
            selectQuestion={selectQuestion}
            selectSourceBlock={selectSourceBlock}
            updateQuestion={updateQuestion}
            acceptHighConfidence={acceptHighConfidence}
            onNext={() => setActiveStep('preview')}
            loading={loading}
          />
        )}
        {activeStep === 'preview' && <PreviewPanel state={state} onNext={() => setActiveStep('quality')} />}
        {activeStep === 'quality' && <QualityExportPanel state={state} onFields={() => setActiveStep('fields')} />}
      </main>
    </div>
  );
}

function TemplateLibraryPanel({
  state,
  onImport,
  onNext,
  loading,
  backendAvailable,
}: {
  state: ProcurementAgentState;
  onImport: () => void;
  onNext: () => void;
  loading: boolean;
  backendAvailable: boolean;
}) {
  const activeTemplate = state.templateLibrary.find((item) => item.id === state.activeTemplateId) || state.templateLibrary[0];
  const [selectedTemplateFieldId, setSelectedTemplateFieldId] = useState('');
  const [templateFieldLocations, setTemplateFieldLocations] = useState<Record<string, TemplatePdfFieldLocation>>({});
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [fieldViewMode, setFieldViewMode] = useState<TemplateFieldViewMode>('chapter');
  const fieldGroups = useMemo(() => buildTemplateFieldGroups(state), [state]);
  const templateFieldJson = useMemo(() => createTemplateFieldJson(fieldGroups), [fieldGroups]);
  const currentPageFields = useMemo(
    () => state.templateFields.filter((field) => templateFieldLocations[field.id]?.page === currentPdfPage),
    [currentPdfPage, state.templateFields, templateFieldLocations],
  );
  const locatedFieldCount = Object.values(templateFieldLocations).filter((location) => location.found).length;
  const stats = [
    { label: '模板文件', value: String(state.templateLibrary.length), tone: 'info' },
    { label: '大纲节点', value: String(state.templateScan.outlineCount || 0), tone: 'success' },
    { label: '原文块', value: String(state.templateScan.blockCount || 0), tone: 'muted' },
    { label: '待填字段', value: String(state.templateScan.fieldCount || 0), tone: 'warning' },
  ];

  useEffect(() => {
    if (!state.templateFields.length) {
      setSelectedTemplateFieldId('');
      return;
    }
    if (!state.templateFields.some((field) => field.id === selectedTemplateFieldId)) {
      setSelectedTemplateFieldId(state.templateFields[0].id);
    }
  }, [selectedTemplateFieldId, state.templateFields]);

  if (!activeTemplate) {
    return (
      <section className="procurement-template-empty">
        <div className="procurement-panel procurement-template-empty-card">
          <span className="section-kicker">Template Library</span>
          <h3>先上传询比采购文件模板</h3>
          <p>系统会全面扫描模板，补齐可识别章节的标题样式，生成大纲树、模板原文块和待填字段清单。原始模板不会被覆盖。</p>
          <div className="procurement-page-actions">
            <button type="button" className="procurement-primary-button" disabled={loading || !backendAvailable} onClick={onImport}>
              {loading ? '扫描中...' : '上传并扫描模板'}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="procurement-template-workspace">
      <div className="procurement-stat-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={`procurement-stat-card is-${stat.tone}`}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>模板库扫描</small>
          </article>
        ))}
      </div>

      <div className="procurement-panel procurement-template-summary">
        <div className="procurement-panel-head">
          <div>
            <h3>{activeTemplate.name}</h3>
            <p>{state.templateScan.message || '模板已加载，可按大纲查看原文和字段。'}</p>
          </div>
          <div className="procurement-agent-actions">
            <StatusBadge label={activeTemplate.status === 'loaded' ? '已加载' : '待扫描'} />
            <button type="button" className="procurement-secondary-button" disabled={loading || !backendAvailable} onClick={onImport}>重新上传模板</button>
            <button type="button" className="procurement-primary-button" onClick={onNext}>进入新建任务</button>
          </div>
        </div>
        <div className="procurement-template-paths">
          <span>原始文件：{activeTemplate.fileName}</span>
          <span>规范化标题：{activeTemplate.stats.normalizedHeadingCount || 0} 处</span>
          <span>扫描时间：{formatTime(activeTemplate.scannedAt)}</span>
        </div>
        {(state.templateScan.warnings || []).length > 0 && (
          <div className="procurement-template-warning-list">
            {state.templateScan.warnings!.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        )}
      </div>

      <section className="procurement-template-layout">
        <article className="procurement-template-original">
          <div className="procurement-template-column-head">
            <div>
              <h3>模板原文</h3>
              <p>开源 PDF 阅读器，目录以阅读器为准</p>
            </div>
            <StatusBadge label={activeTemplate.previewPdfUrl ? '开源阅读器' : '缺少 PDF'} />
          </div>
          {activeTemplate.previewPdfUrl ? (
            <div className="procurement-template-pdf-preview">
              <OpenSourcePdfHighlighterPreview
                pdfUrl={activeTemplate.previewPdfUrl}
                templateId={activeTemplate.id}
                fields={state.templateFields}
                onFieldLocationsChange={setTemplateFieldLocations}
                selectedFieldId={selectedTemplateFieldId}
                onSelectedFieldChange={setSelectedTemplateFieldId}
                onPageChange={setCurrentPdfPage}
              />
            </div>
          ) : (
            <div className="procurement-template-pdf-preview">
              <div className="procurement-empty-mini">当前模板缺少 PDF 预览，请重新扫描模板</div>
            </div>
          )}
        </article>

        <aside className="procurement-template-fields">
          <div className="procurement-template-column-head">
            <div>
              <h3>模板字段地图</h3>
              <p>{fieldViewMode === 'page' ? `当前第 ${currentPdfPage} 页` : '按章节组织模板空位'}</p>
            </div>
            <StatusBadge label={`${locatedFieldCount}/${state.templateFields.length} 已定位`} />
          </div>
          <div className="procurement-template-field-tabs">
            <button
              type="button"
              className={fieldViewMode === 'page' ? 'is-active' : ''}
              onClick={() => setFieldViewMode('page')}
            >
              当前页
            </button>
            <button
              type="button"
              className={fieldViewMode === 'chapter' ? 'is-active' : ''}
              onClick={() => setFieldViewMode('chapter')}
            >
              按章节
            </button>
            <button
              type="button"
              className={fieldViewMode === 'json' ? 'is-active' : ''}
              onClick={() => setFieldViewMode('json')}
            >
              JSON
            </button>
          </div>
          <div className="procurement-template-field-list">
            {fieldViewMode === 'json' && (
              <pre className="procurement-template-json-preview">{JSON.stringify(templateFieldJson, null, 2)}</pre>
            )}
            {fieldViewMode === 'page' && (
              currentPageFields.length ? currentPageFields.map((field) => (
                <TemplateFieldCard
                  key={field.id}
                  field={field}
                  location={templateFieldLocations[field.id]}
                  active={field.id === selectedTemplateFieldId}
                  onClick={() => setSelectedTemplateFieldId(field.id)}
                />
              )) : <div className="procurement-empty-mini">当前页暂无已定位字段</div>
            )}
            {fieldViewMode === 'chapter' && (
              fieldGroups.length ? fieldGroups.map((group) => (
                <section key={group.id} className="procurement-template-field-group">
                  <div className="procurement-template-field-group-head">
                    <strong>{group.title}</strong>
                    <span>{group.fields.length} 项</span>
                  </div>
                  {group.fields.map((field) => (
                    <TemplateFieldCard
                      key={field.id}
                      field={field}
                      location={templateFieldLocations[field.id]}
                      active={field.id === selectedTemplateFieldId}
                      onClick={() => setSelectedTemplateFieldId(field.id)}
                    />
                  ))}
                </section>
              )) : <div className="procurement-empty-mini">暂未识别到模板空位字段</div>
            )}
          </div>
        </aside>
      </section>
    </section>
  );
}

function TemplateFieldCard({
  field,
  location,
  active,
  onClick,
}: {
  field: ProcurementTemplateField;
  location?: TemplatePdfFieldLocation;
  active: boolean;
  onClick: () => void;
}) {
  const locationLabel = location?.found ? `第 ${location.page} 页` : '待定位';
  return (
    <button
      type="button"
      className={`procurement-template-field-card${field.risk ? ' has-risk' : ''}${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      <div>
        <strong>{field.label}{field.required ? ' *' : ''}</strong>
        <StatusBadge label={field.type === 'choice' ? '选择题' : '填空题'} />
      </div>
      <p>{field.sourceText}</p>
      <span>{field.key} · {field.blockId} · {locationLabel}</span>
    </button>
  );
}

function WorkspacePanel({
  state,
  onCreate,
  onContinue,
  onClear,
  loading,
  backendAvailable,
}: {
  state: ProcurementAgentState;
  onCreate: () => void;
  onContinue: () => void;
  onClear: () => void;
  loading: boolean;
  backendAvailable: boolean;
}) {
  const confirmedCount = state.answers.filter((answer) => answer.status === 'confirmed').length
    || state.fields.filter((field) => field.status === 'confirmed').length;
  const pendingCount = state.answers.filter((answer) => answer.status === 'pending' || answer.status === 'risk' || answer.status === 'missing').length;
  const stats = [
    { label: '已解析文件', value: String(state.documents.length), tone: 'info' },
    { label: '源文件片段', value: String(state.sourceBlocks.length || 0), tone: 'muted' },
    { label: '已回答题目', value: String(state.extraction.fieldCount || 0), tone: 'success' },
    { label: '待处理题目', value: String(pendingCount || state.extraction.missingCount || 0), tone: 'warning' },
  ];

  return (
    <section className="procurement-workspace">
      <div className="procurement-stat-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={`procurement-stat-card is-${stat.tone}`}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>模板答题与溯源</small>
          </article>
        ))}
      </div>

      <section className="procurement-panel">
        <div className="procurement-panel-head">
          <div>
            <h3>{state.task.projectName || '当前采购文件任务'}</h3>
            <p>{state.extraction.message || '上传采购需求方案后，系统会切分源文件证据块，再调用本地 Gemma 回答模板题目。'}</p>
          </div>
          <div className="procurement-agent-actions">
            <button type="button" className="procurement-secondary-button" disabled={loading || !backendAvailable} onClick={onClear}>清空任务</button>
            <button type="button" className="procurement-primary-button" onClick={onCreate}>新建/编辑任务</button>
          </div>
        </div>

        <div className="procurement-table-wrap">
          <table className="procurement-table">
            <tbody>
              <tr>
                <th>项目编号</th>
                <td>{state.task.projectCode || '未填写'}</td>
                <th>采购方式</th>
                <td>{state.task.procurementMethod || '询比采购'}</td>
              </tr>
              <tr>
                <th>模板</th>
                <td>{state.task.templateName || '工程类询比采购文件模板'}</td>
                <th>评审办法</th>
                <td>{state.task.reviewMethod || '待确认'}</td>
              </tr>
              <tr>
                <th>确认进度</th>
                <td>{confirmedCount}/{state.questions.length || state.fields.length || 18} 个题目</td>
                <th>最近更新</th>
                <td>{formatTime(state.task.updatedAt)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="procurement-log-list">
          {(state.logs.length ? state.logs : [{ id: 'empty', time: '', message: '暂无操作记录' }]).slice(0, 5).map((log) => (
            <div key={log.id} className="procurement-log-row">
              <span>{formatTime(log.time)}</span>
              <strong>{log.message}</strong>
            </div>
          ))}
        </div>

        <div className="procurement-page-actions">
          <button type="button" className="procurement-secondary-button" onClick={onCreate}>编辑基础信息</button>
          <button type="button" className="procurement-primary-button" onClick={onContinue}>继续处理</button>
        </div>
      </section>
    </section>
  );
}

function NewTaskPanel({
  taskDraft,
  setTaskDraft,
  onNext,
  loading,
}: {
  taskDraft: Partial<ProcurementTask>;
  setTaskDraft: (task: Partial<ProcurementTask>) => void;
  onNext: () => void;
  loading: boolean;
}) {
  const update = (patch: Partial<ProcurementTask>) => setTaskDraft({ ...taskDraft, ...patch });

  return (
    <section className="procurement-two-column">
      <aside className="procurement-side-steps">
        {['基本信息', '上传资料', '模板答题', '溯源确认', '生成文件', '质检导出'].map((label, index) => (
          <div key={label} className={index === 0 ? 'is-current' : ''}>
            <span>{index + 1}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </aside>

      <div className="procurement-panel">
        <div className="procurement-panel-head">
          <div>
            <h3>新建采购文件任务</h3>
            <p>先固定项目、模板和采购方式。后续需求方案解析结果会回填到同一套模板题目中。</p>
          </div>
          <StatusBadge label="草稿" />
        </div>

        <div className="procurement-form-grid">
          <label><span>项目名称</span><input value={taskDraft.projectName || ''} onChange={(event) => update({ projectName: event.target.value })} placeholder="例如：某工程施工采购" /></label>
          <label><span>项目编号</span><input value={taskDraft.projectCode || ''} onChange={(event) => update({ projectCode: event.target.value })} placeholder="例如：GAFZ-JG-2026-0001" /></label>
          <label><span>采购类型</span><select value={taskDraft.procurementType || '工程类'} onChange={(event) => update({ procurementType: event.target.value })}><option>工程类</option><option>服务类</option><option>货物类</option></select></label>
          <label><span>采购方式</span><select value={taskDraft.procurementMethod || '询比采购'} onChange={(event) => update({ procurementMethod: event.target.value })}><option>询比采购</option></select></label>
          <label><span>模板版本</span><select value={taskDraft.templateName || '工程类询比采购文件模板'} onChange={(event) => update({ templateName: event.target.value })}><option>工程类询比采购文件模板</option></select></label>
          <label><span>评审办法</span><select value={taskDraft.reviewMethod || '经评审的最低投标价法'} onChange={(event) => update({ reviewMethod: event.target.value })}><option>经评审的最低投标价法</option><option>综合评估法</option></select></label>
          <label><span>经办人</span><input value={taskDraft.owner || ''} onChange={(event) => update({ owner: event.target.value })} placeholder="填写经办人" /></label>
        </div>

        <div className="procurement-check-grid">
          <label><input type="checkbox" defaultChecked /> 采购需求方案</label>
          <label><input type="checkbox" /> 控制价清单</label>
          <label><input type="checkbox" /> 施工图说明</label>
          <label><input type="checkbox" /> 审批资料</label>
        </div>

        <div className="procurement-page-actions">
          <button type="button" className="procurement-primary-button" disabled={loading} onClick={onNext}>{loading ? '保存中...' : '保存并进入上传解析'}</button>
        </div>
      </div>
    </section>
  );
}

function UploadPanel({
  state,
  loading,
  backendAvailable,
  onImport,
  onExtract,
  onNext,
}: {
  state: ProcurementAgentState;
  loading: boolean;
  backendAvailable: boolean;
  onImport: () => void;
  onExtract: () => void;
  onNext: () => void;
}) {
  const demandDocument = state.documents.find((document) => document.role === 'demand');
  const canExtract = Boolean(demandDocument) && state.extraction.status !== 'extracting';

  return (
    <section className="procurement-upload-layout">
      <div className="procurement-upload-list">
        <article className="procurement-upload-card">
          <div className="procurement-upload-icon" aria-hidden="true">DOC</div>
          <div>
            <strong>采购需求方案 *</strong>
            <p>{demandDocument ? demandDocument.fileName : '支持 .docx / .doc / .wps / .pdf / .txt / .md'}</p>
          </div>
          <StatusBadge label={demandDocument ? '已解析' : '待上传'} />
        </article>
        <article className="procurement-upload-card">
          <div className="procurement-upload-icon" aria-hidden="true">SRC</div>
          <div>
            <strong>源文件证据块</strong>
            <p>{state.sourceBlocks.length ? `已拆分 ${state.sourceBlocks.length} 个可定位片段` : '解析后会把原始文件切成可高亮定位的证据块'}</p>
          </div>
          <StatusBadge label={state.sourceBlocks.length ? '已切分' : '待切分'} />
        </article>
        <article className="procurement-upload-card">
          <div className="procurement-upload-icon" aria-hidden="true">AI</div>
          <div>
            <strong>模板题目答题</strong>
            <p>{state.extraction.message || '调用本地 Gemma 4 31B 回答填空题和选择题'}</p>
          </div>
          <StatusBadge label={state.extraction.status === 'extracting' ? '答题中' : state.extraction.status === 'extracted' ? '已答题' : '待答题'} />
        </article>
      </div>

      <aside className="procurement-panel procurement-parse-panel">
        <div className="procurement-panel-head">
          <div>
            <h3>解析结果预览</h3>
            <p>{backendAvailable ? (demandDocument ? `已提取 ${demandDocument.markdownLength.toLocaleString()} 个字符，形成 ${state.sourceBlocks.length} 个证据块。` : '选择采购需求方案后会在这里显示文本预览。') : '当前是浏览器预览模式。请打开 Electron 客户端后上传文件并调用本地模型。'}</p>
          </div>
        </div>
        <div className="procurement-parse-summary">
          <div><strong>{state.sourceBlocks.length || 0}</strong><span>源文件片段</span></div>
          <div><strong>{state.extraction.fieldCount || 0}</strong><span>已回答题目</span></div>
          <div><strong>{state.extraction.missingCount || 0}</strong><span>缺失题目</span></div>
        </div>
        <pre className="procurement-markdown-preview">{state.markdownPreview || '暂无解析文本。'}</pre>
        <div className="procurement-page-actions">
          <button type="button" className="procurement-secondary-button" disabled={loading || !backendAvailable} onClick={onImport}>{loading ? '处理中...' : demandDocument ? '重新上传解析' : '上传需求方案'}</button>
          <button type="button" className="procurement-primary-button" disabled={loading || !backendAvailable || !canExtract} onClick={onExtract}>{state.extraction.status === 'extracting' ? '答题中...' : '回答模板题目'}</button>
          <button type="button" className="procurement-secondary-button" disabled={!state.questions.length} onClick={onNext}>进入模板答题</button>
        </div>
      </aside>
    </section>
  );
}

function FieldConfirmPanel({
  state,
  chapters,
  activeChapter,
  visibleQuestions,
  selectedQuestion,
  selectedAnswer,
  selectedSourceBlock,
  highlightedSourceIds,
  questionDrafts,
  setQuestionDrafts,
  setSelectedChapter,
  selectQuestion,
  selectSourceBlock,
  updateQuestion,
  acceptHighConfidence,
  onNext,
  loading,
}: {
  state: ProcurementAgentState;
  chapters: string[];
  activeChapter: string;
  visibleQuestions: ProcurementTemplateQuestion[];
  selectedQuestion?: ProcurementTemplateQuestion;
  selectedAnswer?: ProcurementAnswer;
  selectedSourceBlock?: ProcurementSourceBlock;
  highlightedSourceIds: string[];
  questionDrafts: Record<string, string>;
  setQuestionDrafts: (drafts: Record<string, string>) => void;
  setSelectedChapter: (chapter: string) => void;
  selectQuestion: (question: ProcurementTemplateQuestion) => void;
  selectSourceBlock: (blockId: string) => void;
  updateQuestion: (questionId: string, status?: ProcurementFieldStatus, valueOverride?: string) => Promise<void>;
  acceptHighConfidence: () => void;
  onNext: () => void;
  loading: boolean;
}) {
  const answerByQuestion = useMemo(() => buildAnswerMap(state), [state]);

  if (!state.questions.length) {
    return (
      <section className="procurement-panel procurement-empty-state">
        <h3>还没有可确认的模板题目</h3>
        <p>请先在“上传解析”页面上传采购需求方案，并调用本地 Gemma 回答模板填空题和选择题。</p>
      </section>
    );
  }

  return (
    <section className="procurement-trace-layout">
      <aside className="procurement-source-preview">
        <div className="procurement-source-head">
          <div>
            <h3>原始文件预览</h3>
            <p>{state.sourceBlocks.length ? `${state.sourceBlocks.length} 个证据块，可点击反向定位题目` : '暂无源文件片段'}</p>
          </div>
        </div>
        <div className="procurement-source-list">
          {state.sourceBlocks.length ? state.sourceBlocks.map((block) => {
            const highlighted = highlightedSourceIds.includes(block.id);
            const selected = selectedSourceBlock?.id === block.id;
            return (
              <button
                key={block.id}
                type="button"
                className={`procurement-source-block${highlighted ? ' is-highlighted' : ''}${selected ? ' is-selected' : ''}`}
                onClick={() => selectSourceBlock(block.id)}
              >
                <span className="procurement-source-block-id">{block.id}</span>
                <strong>{block.title}</strong>
                <small>行 {block.startLine}-{block.endLine}</small>
                <p>{block.preview}</p>
                {block.keywords.length > 0 && (
                  <span className="procurement-source-tags">
                    {block.keywords.map((keyword) => <i key={keyword}>{keyword}</i>)}
                  </span>
                )}
              </button>
            );
          }) : (
            <pre className="procurement-markdown-preview">{state.markdownPreview || '上传并解析需求方案后，这里会显示原始文件片段。'}</pre>
          )}
        </div>
      </aside>

      <div className="procurement-panel procurement-question-panel">
        <div className="procurement-panel-head">
          <div>
            <h3>模板填空与选择</h3>
            <p>每个题目对应模板中的一个落点；确认值会作为后续 Word 生成的唯一来源。</p>
          </div>
          <button type="button" className="procurement-secondary-button" disabled={loading} onClick={acceptHighConfidence}>接受高置信答案</button>
        </div>

        <div className="procurement-chapter-pills">
          {chapters.map((chapter) => {
            const chapterQuestions = state.questions.filter((question) => question.chapter === chapter);
            const todoCount = chapterQuestions.filter((question) => {
              const answer = answerByQuestion.get(question.id);
              return !answer || answer.status !== 'confirmed';
            }).length;
            return (
              <button
                key={chapter}
                type="button"
                className={chapter === activeChapter ? 'is-active' : ''}
                onClick={() => setSelectedChapter(chapter)}
              >
                <strong>{chapter}</strong>
                <span>{todoCount ? `${todoCount} 项待处理` : '已检查'}</span>
              </button>
            );
          })}
        </div>

        <div className="procurement-question-list">
          {visibleQuestions.map((question) => {
            const answer = answerByQuestion.get(question.id);
            const draftValue = questionDrafts[question.id] ?? answer?.confirmedValue ?? answer?.value ?? '';
            const active = selectedQuestion?.id === question.id;
            return (
              <article
                key={question.id}
                className={`procurement-question-card${active ? ' is-active' : ''}${question.risk ? ' has-risk' : ''}`}
                onClick={() => selectQuestion(question)}
              >
                <div className="procurement-question-card-head">
                  <div>
                    <strong>{question.label}{question.required ? ' *' : ''}</strong>
                    <span>{question.targetText}</span>
                  </div>
                  <div className="procurement-question-status">
                    <StatusBadge label={statusLabels[answer?.status || 'missing']} />
                    <ConfidenceBar value={answer?.confidence || 0} />
                  </div>
                </div>

                {question.type === 'choice' ? (
                  <select
                    className="procurement-question-select"
                    value={draftValue}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setQuestionDrafts({ ...questionDrafts, [question.id]: nextValue });
                      void updateQuestion(question.id, nextValue ? 'confirmed' : 'missing', nextValue);
                    }}
                  >
                    <option value="">请选择</option>
                    {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : question.inputKind === 'long-text' ? (
                  <textarea
                    className="procurement-question-input is-long"
                    value={draftValue}
                    placeholder={question.placeholder}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setQuestionDrafts({ ...questionDrafts, [question.id]: event.target.value })}
                    onBlur={() => void updateQuestion(question.id)}
                  />
                ) : (
                  <input
                    className="procurement-question-input"
                    value={draftValue}
                    placeholder={question.placeholder}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setQuestionDrafts({ ...questionDrafts, [question.id]: event.target.value })}
                    onBlur={() => void updateQuestion(question.id)}
                  />
                )}

                <div className="procurement-question-meta">
                  <span>{question.type === 'choice' ? '选择题' : '填空题'}</span>
                  <span>{question.group}</span>
                  {(answer?.sourceBlockIds || []).map((blockId) => (
                    <button
                      key={blockId}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        selectSourceBlock(blockId);
                      }}
                    >
                      {blockId}
                    </button>
                  ))}
                </div>

                <div className="procurement-question-actions">
                  <button type="button" onClick={(event) => { event.stopPropagation(); void updateQuestion(question.id, 'confirmed'); }}>确认</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); void updateQuestion(question.id, 'risk'); }}>标记风险</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); void updateQuestion(question.id, 'missing'); }}>置为缺失</button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="procurement-page-actions">
          <button type="button" className="procurement-secondary-button" onClick={() => setSelectedChapter('第三章 供应商资格证明材料')}>查看资格条件</button>
          <button type="button" className="procurement-primary-button" onClick={onNext}>生成文件预览</button>
        </div>
      </div>

      <aside className="procurement-evidence-panel procurement-trace-detail">
        <h3>题目证据</h3>
        {selectedQuestion ? (
          <>
            <p className="procurement-evidence-location">{selectedQuestion.chapter} · {selectedQuestion.label}</p>
            <div className="procurement-ai-note">
              <strong>模板落点</strong>
              <span>{selectedQuestion.targetText}</span>
            </div>
            <blockquote>{selectedAnswer?.sourceText || selectedAnswer?.value || '模型没有返回证据原文，请在左侧源文件中人工复核。'}</blockquote>
            <div className="procurement-source-chip-list">
              {(selectedAnswer?.sourceBlockIds || []).length ? selectedAnswer!.sourceBlockIds.map((blockId) => (
                <button key={blockId} type="button" onClick={() => selectSourceBlock(blockId)}>{blockId}</button>
              )) : <span>暂无定位块</span>}
            </div>
            {selectedSourceBlock && (
              <div className="procurement-selected-source">
                <strong>{selectedSourceBlock.id} · {selectedSourceBlock.title}</strong>
                <small>行 {selectedSourceBlock.startLine}-{selectedSourceBlock.endLine}</small>
                <p>{selectedSourceBlock.text}</p>
              </div>
            )}
          </>
        ) : (
          <p>选择中间题目后查看模型依据和源文件定位。</p>
        )}
      </aside>
    </section>
  );
}

function PreviewPanel({ state, onNext }: { state: ProcurementAgentState; onNext: () => void }) {
  const field = createFieldGetter(state.fields);
  const chapters = ['封面', '第一章 询比采购公告', '第二章 供应商须知', '第三章 供应商资格证明材料', '第四章 项目详细要求', '第五章 评审办法', '第六章 响应文件格式', '第七章 合同主要条款'];

  return (
    <section className="procurement-preview-layout">
      <aside className="procurement-chapter-tree">
        {chapters.map((chapter, index) => (
          <button key={chapter} type="button" className={index === 1 ? 'is-active' : ''}>
            <span>{index + 1}</span>
            <strong>{chapter}</strong>
          </button>
        ))}
      </aside>

      <article className="procurement-word-preview">
        <div className="procurement-word-page">
          <p className="procurement-doc-title">{field('project_name') || state.task.projectName || '项目名称待确认'}询比采购公告</p>
          <p>采购人拟对 <mark>{field('project_name') || '项目名称待确认'}</mark> 项目进行询比采购。</p>
          <p>一、项目编号：<mark>{field('project_code') || state.task.projectCode || '待补充'}</mark></p>
          <p>二、采购人：<mark>{field('purchaser') || '待补充'}</mark></p>
          <p>三、最高限价：<mark>{field('max_price') || '待补充'}</mark></p>
          <p>四、采购范围：{field('project_scope') || '待补充'}</p>
          <p>五、工期或服务期：<mark>{field('contract_period') || '待补充'}</mark></p>
          <p>六、供应商资格条件：<mark className="is-risk">{field('qualification_requirements') || '待人工确认'}</mark></p>
          <p>七、评审办法：<mark>{field('evaluation_method') || state.task.reviewMethod || '待确认'}</mark></p>
          <p>八、响应文件递交截止时间：<mark>{field('response_deadline') || '待补充'}</mark></p>
        </div>
      </article>

      <aside className="procurement-current-issues">
        <h3>当前问题</h3>
        <IssueMini level="缺失" text={`${state.extraction.missingCount || 0} 个必填题目缺失`} />
        <IssueMini level="高风险" text={`${state.extraction.riskCount || 0} 个题目需要人工复核`} />
        <IssueMini level="提醒" text="正式 Word 导出将在下一阶段接入模板替换" />
        <button type="button" className="procurement-primary-button" onClick={onNext}>进入质检导出</button>
      </aside>
    </section>
  );
}

function QualityExportPanel({ state, onFields }: { state: ProcurementAgentState; onFields: () => void }) {
  const issues = [
    { level: '缺失', title: `${state.extraction.missingCount || 0} 个必填题目仍为空`, location: '模板答题中心', action: '补充题目' },
    { level: '高风险', title: `${state.extraction.riskCount || 0} 个高风险题目待复核`, location: '资格条件/金额/时间/评审办法', action: '人工确认' },
    { level: '提醒', title: 'Word 模板生成尚未接入', location: '下一阶段：文件预览与导出', action: '继续开发' },
  ];

  return (
    <section className="procurement-quality-layout">
      <div className="procurement-panel procurement-quality-main">
        <div className="procurement-quality-result">
          <span className="procurement-result-mark">{state.extraction.missingCount ? '!' : '✓'}</span>
          <div>
            <h3>{state.extraction.missingCount ? '还有缺失题目，暂不建议导出正式版' : '模板题目基础检查已通过'}</h3>
            <p>当前阶段已打通上传解析、源文件证据切分、模型答题和人工溯源确认。下一步会接入 Word 模板替换、章节预览和完整质检规则。</p>
          </div>
        </div>

        <div className="procurement-issue-list">
          {issues.map((issue) => (
            <article key={issue.title} className={`procurement-issue-row is-${issue.level}`}>
              <StatusBadge label={issue.level} />
              <div>
                <strong>{issue.title}</strong>
                <span>{issue.location}</span>
              </div>
              <button type="button" className="procurement-link-button" onClick={onFields}>{issue.action}</button>
            </article>
          ))}
        </div>
      </div>

      <aside className="procurement-panel procurement-export-panel">
        <h3>导出成果</h3>
        <p>当前先完成模板题目闭环；模板化 Word 导出将在下一轮接入。</p>
        <button type="button" className="procurement-export-card" disabled>
          <strong>Word 采购文件</strong>
          <span>待接入 .docx 模板</span>
        </button>
        <button type="button" className="procurement-export-card" disabled>
          <strong>题目确认清单</strong>
          <span>已具备数据基础</span>
        </button>
      </aside>
    </section>
  );
}

function StatusBadge({ label }: { label: string }) {
  const tone = label.includes('缺失') || label.includes('失败')
    ? 'danger'
    : label.includes('风险') || label.includes('待') || label.includes('草稿') || label.includes('答题中')
      ? 'warning'
      : label.includes('已') || label.includes('通过')
        ? 'success'
        : 'neutral';

  return <span className={`procurement-status is-${tone}`}>{label}</span>;
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="procurement-confidence">
      <span><i style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} /></span>
      <strong>{value ? `${value}%` : '-'}</strong>
    </div>
  );
}

function IssueMini({ level, text }: { level: string; text: string }) {
  return (
    <div className="procurement-issue-mini">
      <StatusBadge label={level} />
      <span>{text}</span>
    </div>
  );
}

function buildAnswerMap(state: ProcurementAgentState) {
  const map = new Map<string, ProcurementAnswer>();
  state.answers.forEach((answer) => map.set(answer.questionId || answer.id, answer));
  const fieldsByKey = new Map(state.fields.map((field) => [field.key || field.id, field]));
  state.questions.forEach((question) => {
    if (map.has(question.id)) return;
    const field = fieldsByKey.get(question.fieldKey);
    if (!field) return;
    map.set(question.id, {
      id: question.id,
      questionId: question.id,
      fieldKey: question.fieldKey,
      value: field.value,
      confirmedValue: field.confirmedValue,
      confidence: field.confidence,
      status: field.status,
      required: field.required,
      risk: field.risk,
      sourceBlockIds: field.sourceBlockIds || [],
      sourceText: field.sourceText,
      sourceLocation: field.sourceLocation,
      updatedAt: field.updatedAt,
    });
  });
  return map;
}

function updateQuestionLocally(state: ProcurementAgentState, questionId: string, value: string, status: ProcurementFieldStatus): ProcurementAgentState {
  const now = new Date().toISOString();
  const answers = state.answers.map((answer) => answer.questionId === questionId
    ? { ...answer, confirmedValue: value, value: answer.value || value, status, updatedAt: now }
    : answer);
  const fields = state.fields.map((field) => field.id === questionId || field.key === questionId
    ? { ...field, confirmedValue: value, value: field.value || value, status, updatedAt: now }
    : field);
  const missingCount = fields.filter((field) => field.required && !field.confirmedValue.trim()).length;
  const riskCount = fields.filter((field) => field.status === 'risk').length;
  const pendingCount = fields.filter((field) => field.status === 'pending').length;
  return {
    ...state,
    answers,
    fields,
    extraction: {
      ...state.extraction,
      missingCount,
      riskCount,
      pendingCount,
    },
  };
}

function createFieldGetter(fields: ProcurementField[]) {
  const byKey = Object.fromEntries(fields.map((field) => [field.key, field.confirmedValue || field.value || '']));
  return (key: string) => byKey[key] || '';
}

function formatTime(value?: string) {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

export default ProcurementAgentPage;
