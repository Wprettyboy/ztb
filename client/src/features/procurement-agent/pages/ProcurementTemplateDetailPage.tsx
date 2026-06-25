import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { trackPageView } from '../../../shared/analytics/analytics';
import { useToast } from '../../../shared/ui';
import type { SectionId } from '../../../shared/types/navigation';
import { OpenSourcePdfHighlighterPreview, type TemplatePdfFieldLocation } from '../components/OpenSourcePdfHighlighterPreview';
import type {
  ProcurementAgentState,
  ProcurementTemplateBlock,
  ProcurementTemplateField,
  ProcurementTemplateItem,
  ProcurementTemplatePageTask,
  ProcurementTemplatePageTaskPack,
  ProcurementTemplatePageTaskItem,
  ProcurementTemplateTaskDefinition,
} from '../types';

type FieldViewMode = 'page' | 'all' | 'pageTasks';

interface ProcurementTemplateDetailPageProps {
  onNavigate: (section: SectionId) => void;
}

interface TemplateFieldGroup {
  id: string;
  title: string;
  order: number;
  tasks: ProcurementTemplateTaskDefinition[];
}

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function formatTime(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function createCoverBlockIdSet(blocks: ProcurementTemplateBlock[] | null | undefined) {
  const blockList = safeArray(blocks);
  const firstHeading = blockList.find((block) => block.isHeading && block.outlineId !== 'tpl_out_root');
  const firstHeadingOrder = firstHeading?.order ?? Number.POSITIVE_INFINITY;
  return new Set(
    blockList
      .filter((block) => block.outlineId === 'tpl_out_root' || block.order < firstHeadingOrder)
      .map((block) => block.id),
  );
}

function buildTemplateTaskGroups(state: ProcurementAgentState): TemplateFieldGroup[] {
  const outlineById = new Map(safeArray(state.templateOutline).map((node) => [node.id, node]));
  const coverBlockIds = createCoverBlockIdSet(state.templateBlocks);
  const groupMap = new Map<string, TemplateFieldGroup>();

  const tasks = safeArray(state.templateTaskPack?.tasks);
  tasks.forEach((task) => {
    const anchors = safeArray(task.anchors);
    const firstAnchor = anchors[0];
    const isCoverTask = firstAnchor ? coverBlockIds.has(firstAnchor.blockId) : task.chapter === '封面';
    const outline = firstAnchor ? outlineById.get(firstAnchor.outlineId) : undefined;
    const groupId = isCoverTask ? 'cover' : firstAnchor?.outlineId || task.chapter || 'ungrouped';
    const groupTitle = isCoverTask ? '封面' : outline?.title || task.chapter || '未归类章节';
    const groupOrder = isCoverTask ? -1 : outline?.order ?? 9999;
    const group = groupMap.get(groupId) || {
      id: groupId,
      title: groupTitle,
      order: groupOrder,
      tasks: [],
    };
    group.tasks.push({ ...task, anchors });
    groupMap.set(groupId, group);
  });

  return [...groupMap.values()]
    .map((group) => ({
      ...group,
      tasks: [...group.tasks].sort((first, second) => first.order - second.order),
    }))
    .sort((first, second) => first.order - second.order);
}

function createFallbackTasks(state: ProcurementAgentState): ProcurementTemplateTaskDefinition[] {
  const packedTasks = safeArray(state.templateTaskPack?.tasks).map((task) => ({ ...task, anchors: safeArray(task.anchors) }));
  if (packedTasks.length) return packedTasks;
  const generatedAt = new Date().toISOString();
  const grouped = new Map<string, ProcurementTemplateField[]>();
  safeArray(state.templateFields).forEach((field) => {
    grouped.set(field.key, [...(grouped.get(field.key) || []), field]);
  });
  return [...grouped.entries()].map(([key, fields], index) => {
    const first = fields[0];
    return {
      key,
      label: first.label,
      type: first.type,
      inputKind: first.type === 'choice' || first.type === 'multiChoice' ? 'select' : 'short-text',
      group: '模板任务',
      chapter: '未归类章节',
      required: first.required,
      risk: first.risk,
      order: (index + 1) * 10,
      prompt: `从采购需求方案中提取“${first.label}”。`,
      placeholder: first.placeholder,
      options: first.options,
      anchors: fields.map((field, anchorIndex) => ({
        id: `${field.key}_anchor_${String(anchorIndex + 1).padStart(3, '0')}`,
        fieldId: field.id,
        blockId: field.blockId,
        outlineId: field.outlineId,
        blockOrder: field.blockOrder,
        matchText: field.placeholder || field.label,
        sourceText: field.sourceText,
        pageHint: null,
      })),
      validation: { minLength: first.required ? 1 : 0 },
      createdAt: generatedAt,
      updatedAt: generatedAt,
    };
  });
}

function ProcurementTemplateDetailPage({ onNavigate }: ProcurementTemplateDetailPageProps) {
  const [state, setState] = useState<ProcurementAgentState | null>(null);
  const [pageTaskPack, setPageTaskPack] = useState<ProcurementTemplatePageTaskPack | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [fieldLocations, setFieldLocations] = useState<Record<string, TemplatePdfFieldLocation>>({});
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [fieldViewMode, setFieldViewMode] = useState<FieldViewMode>('all');
  const { showToast } = useToast();

  useEffect(() => {
    trackPageView('procurement-template-detail');
    void loadState();
  }, []);

  const loadState = async () => {
    if (!window.yibiao?.procurementAgent) return;
    try {
      const loaded = await window.yibiao.procurementAgent.loadState();
      if (loaded) {
        setState(loaded);
        const templateId = loaded.activeTemplateId;
        if (window.yibiao.procurementAgent.readTemplatePageTasks && templateId) {
          const pageTasks = await window.yibiao.procurementAgent.readTemplatePageTasks({ templateId });
          setPageTaskPack(pageTasks);
        }
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '加载模板详情失败', 'error');
    }
  };

  const templateLibrary = useMemo(() => state ? safeArray(state.templateLibrary) : [], [state]);
  const templateFields = useMemo(() => state ? safeArray(state.templateFields) : [], [state]);
  const activeTemplate = useMemo(() => {
    if (!state) return undefined;
    return templateLibrary.find((item) => item.id === state.activeTemplateId) || templateLibrary[0];
  }, [state, templateLibrary]);
  const visibleTasks = useMemo(() => state ? createFallbackTasks(state) : [], [state]);
  const taskState = useMemo(() => state ? {
    ...state,
    templateTaskPack: {
      templateId: state.templateTaskPack?.templateId ?? state.activeTemplateId,
      templateName: state.templateTaskPack?.templateName ?? activeTemplate?.name ?? '',
      schemaVersion: state.templateTaskPack?.schemaVersion ?? '1.0.0',
      taskCount: visibleTasks.length,
      generatedAt: state.templateTaskPack?.generatedAt ?? '',
      tasks: visibleTasks,
    },
  } : null, [activeTemplate?.name, state, visibleTasks]);
  const taskGroups = useMemo(() => taskState ? buildTemplateTaskGroups(taskState) : [], [taskState]);
  const currentPageTasks = useMemo(
    () => visibleTasks.filter((task) => safeArray(task.anchors).some((anchor) => fieldLocations[anchor.fieldId]?.page === currentPdfPage)),
    [currentPdfPage, fieldLocations, visibleTasks],
  );
  const currentPageTask = useMemo(
    () => safeArray(pageTaskPack?.pages).find((page) => page.page === currentPdfPage),
    [currentPdfPage, pageTaskPack?.pages],
  );
  const generatedPageTaskCount = useMemo(
    () => safeArray(pageTaskPack?.pages).reduce((sum, page) => sum + safeArray(page.tasks).length, 0),
    [pageTaskPack?.pages],
  );
  const locatedFieldCount = useMemo(
    () => Object.values(fieldLocations).filter((location) => location.found).length,
    [fieldLocations],
  );
  const selectTask = (task: ProcurementTemplateTaskDefinition) => {
    const anchors = safeArray(task.anchors);
    const locatedAnchor = anchors.find((anchor) => fieldLocations[anchor.fieldId]?.found);
    setSelectedFieldId((locatedAnchor || anchors[0])?.fieldId || '');
  };

  useEffect(() => {
    if (!visibleTasks.length) {
      setSelectedFieldId('');
      return;
    }
    const selectedStillExists = visibleTasks.some((task) => safeArray(task.anchors).some((anchor) => anchor.fieldId === selectedFieldId));
    if (!selectedStillExists) {
      setSelectedFieldId(safeArray(visibleTasks[0].anchors)[0]?.fieldId || '');
    }
  }, [selectedFieldId, visibleTasks]);

  if (!state || !activeTemplate) {
    return (
      <section className="procurement-template-reader-page">
        <div className="procurement-template-reader-empty">
          <strong>暂无可查看的模板</strong>
          <span>请先在模板库中选择一个模板。</span>
          <button type="button" className="procurement-secondary-button" onClick={() => onNavigate('procurement-template-library')}>
            返回模板库
          </button>
        </div>
      </section>
    );
  }

  return (
    <TemplateDetailErrorBoundary onBack={() => onNavigate('procurement-template-library')}>
      <section className="procurement-template-reader-page">
        <header className="procurement-template-reader-toolbar">
          <div className="procurement-template-reader-title">
            <button type="button" className="procurement-secondary-button" onClick={() => onNavigate('procurement-template-library')}>
              返回模板库
            </button>
            <div>
              <h2>{activeTemplate.name}</h2>
              <p>{activeTemplate.fileName}</p>
            </div>
          </div>
          <div className="procurement-template-reader-meta">
            <span>{visibleTasks.length} 个任务</span>
            <span>{locatedFieldCount}/{templateFields.length} 个锚点已定位</span>
            <span>{safeArray(pageTaskPack?.pages).length || 0}/{pageTaskPack?.pageCount || 0} 页任务</span>
          </div>
        </header>

        <main className="procurement-template-reader-layout">
          <article className="procurement-template-reader-pdf">
            {activeTemplate.previewPdfUrl ? (
              <OpenSourcePdfHighlighterPreview
                pdfUrl={activeTemplate.previewPdfUrl}
                templateId={activeTemplate.id}
                fields={templateFields}
                selectedFieldId={selectedFieldId}
                onSelectedFieldChange={setSelectedFieldId}
                onFieldLocationsChange={setFieldLocations}
                onPageChange={setCurrentPdfPage}
              />
            ) : (
              <div className="procurement-empty-mini">当前模板缺少 PDF 预览，请重新扫描模板</div>
            )}
          </article>

          <aside className="procurement-template-reader-fields">
            <div className="procurement-template-reader-fields-head">
              <div>
                <strong>字段定位</strong>
                <span>当前第 {currentPdfPage} 页</span>
              </div>
              <div className="procurement-template-reader-tabs">
                <button type="button" className={fieldViewMode === 'page' ? 'is-active' : ''} onClick={() => setFieldViewMode('page')}>
                  当前页
                </button>
                <button type="button" className={fieldViewMode === 'all' ? 'is-active' : ''} onClick={() => setFieldViewMode('all')}>
                  全部
                </button>
                <button type="button" className={fieldViewMode === 'pageTasks' ? 'is-active' : ''} onClick={() => setFieldViewMode('pageTasks')}>
                  页面任务
                </button>
              </div>
            </div>

            <div className="procurement-template-reader-field-list">
              {fieldViewMode === 'pageTasks' ? (
                <TemplateReaderPageTaskPanel
                  pageTask={currentPageTask}
                  pageCount={pageTaskPack?.pageCount || 0}
                  generatedAt={pageTaskPack?.generatedAt || ''}
                  generatedPageCount={safeArray(pageTaskPack?.pages).length}
                  generatedTaskCount={generatedPageTaskCount}
                  currentPage={currentPdfPage}
                />
              ) : fieldViewMode === 'page' ? (
                currentPageTasks.length ? currentPageTasks.map((task) => (
                  <TemplateReaderTaskCard
                    key={task.key}
                    task={task}
                    template={activeTemplate}
                    locations={fieldLocations}
                    active={safeArray(task.anchors).some((anchor) => anchor.fieldId === selectedFieldId)}
                    onClick={() => selectTask(task)}
                  />
                )) : <div className="procurement-empty-mini">当前页暂无已定位字段</div>
              ) : (
                taskGroups.length ? taskGroups.map((group) => (
                  <section key={group.id} className="procurement-template-reader-field-group">
                    <div>
                      <strong>{group.title}</strong>
                      <span>{group.tasks.length} 项</span>
                    </div>
                    {group.tasks.map((task) => (
                      <TemplateReaderTaskCard
                        key={task.key}
                        task={task}
                        template={activeTemplate}
                        locations={fieldLocations}
                        active={safeArray(task.anchors).some((anchor) => anchor.fieldId === selectedFieldId)}
                        onClick={() => selectTask(task)}
                      />
                    ))}
                  </section>
                )) : <div className="procurement-empty-mini">暂未生成模板任务</div>
              )}
            </div>
          </aside>
        </main>
      </section>
    </TemplateDetailErrorBoundary>
  );
}

class TemplateDetailErrorBoundary extends Component<{ children: ReactNode; onBack: () => void }, { message: string }> {
  state = { message: '' };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : '模板详情渲染失败' };
  }

  render() {
    if (this.state.message) {
      return (
        <section className="procurement-template-reader-page">
          <div className="procurement-template-reader-empty">
            <strong>模板详情加载失败</strong>
            <span>{this.state.message}</span>
            <button type="button" className="procurement-secondary-button" onClick={this.props.onBack}>
              返回模板库
            </button>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

function TemplateReaderTaskCard({
  task,
  template,
  locations,
  active,
  onClick,
}: {
  task: ProcurementTemplateTaskDefinition;
  template: ProcurementTemplateItem;
  locations: Record<string, TemplatePdfFieldLocation>;
  active: boolean;
  onClick: () => void;
}) {
  const anchors = safeArray(task.anchors);
  const locatedAnchors = anchors.filter((anchor) => locations[anchor.fieldId]?.found);
  const firstLocation = locatedAnchors.length ? locations[locatedAnchors[0].fieldId] : undefined;
  const locationLabel = firstLocation?.found ? `第 ${firstLocation.page} 页` : '待定位';
  return (
    <button
      type="button"
      className={`procurement-template-field-card${task.risk ? ' has-risk' : ''}${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      <div>
        <strong>{task.label}{task.required ? ' *' : ''}</strong>
        <span className="procurement-template-reader-chip">{templateTaskTypeLabel(task.type)}</span>
      </div>
      <p>{task.prompt || anchors[0]?.sourceText || template.fileName}</p>
      <span>{task.key} · {anchors.length} 个锚点 · {locationLabel}</span>
    </button>
  );
}

function TemplateReaderPageTaskPanel({
  pageTask,
  pageCount,
  generatedAt,
  generatedPageCount,
  generatedTaskCount,
  currentPage,
}: {
  pageTask?: ProcurementTemplatePageTask;
  pageCount: number;
  generatedAt: string;
  generatedPageCount: number;
  generatedTaskCount: number;
  currentPage: number;
}) {
  const tasks = safeArray(pageTask?.tasks);
  return (
    <section className="procurement-template-reader-page-task-panel">
      <div className="procurement-template-reader-page-task-summary">
        <strong>页面任务核对</strong>
        <span>
          {generatedPageCount}/{pageCount || '-'} 页 · {generatedTaskCount} 个任务
          {generatedAt ? ` · ${formatTime(generatedAt)}` : ''}
        </span>
      </div>
      {pageTask ? (
        <>
          <div className="procurement-template-reader-page-task-title">
            <strong>第 {pageTask.page || currentPage} 页：{pageTask.pageTitle || '未命名页面'}</strong>
            <span>{tasks.length ? `${tasks.length} 个页面任务` : pageTask.noTaskReason || '本页无任务'}</span>
          </div>
          {tasks.length ? tasks.map((task) => (
            <TemplateReaderPageTaskCard key={task.key} task={task} />
          )) : (
            <div className="procurement-empty-mini">{pageTask.noTaskReason || '当前页没有需要 AI 回填的页面任务'}</div>
          )}
        </>
      ) : (
        <div className="procurement-empty-mini">当前页还没有页面任务 JSON，请先生成 37 页页面任务包。</div>
      )}
    </section>
  );
}

function TemplateReaderPageTaskCard({ task }: { task: ProcurementTemplatePageTaskItem }) {
  const anchors = safeArray(task.anchors);
  return (
    <article className={`procurement-template-page-task-card${task.risk ? ' has-risk' : ''}`}>
      <div>
        <strong>{task.label}{task.required ? ' *' : ''}</strong>
        <span className="procurement-template-reader-chip">{templateTaskTypeLabel(task.type)}</span>
      </div>
      <p>{task.prompt}</p>
      <span>{task.key} · {task.group || '未分组'} · {anchors.length} 个锚点</span>
      {anchors.length ? (
        <ul>
          {anchors.slice(0, 3).map((anchor, index) => (
            <li key={`${task.key}-${index}`}>
              <b>{anchor.matchText}</b>
              <small>{anchor.sourceText}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function templateTaskTypeLabel(type: string) {
  if (type === 'calculated') return '计算题';
  if (type === 'compound') return '复合题';
  if (type === 'choice' || type === 'multiChoice') return '选择题';
  return '填空题';
}

export default ProcurementTemplateDetailPage;
