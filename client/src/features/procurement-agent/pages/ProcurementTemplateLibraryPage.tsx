import { useEffect, useMemo, useState } from 'react';
import bidLogoUrl from '../../../assets/bid-logo.svg';
import { trackPageView } from '../../../shared/analytics/analytics';
import { useToast } from '../../../shared/ui';
import type { SectionId } from '../../../shared/types/navigation';
import type { ProcurementAgentState, ProcurementTemplateItem } from '../types';

interface ProcurementTemplateLibraryPageProps {
  onNavigate: (section: SectionId) => void;
}

const emptyTemplateState: ProcurementAgentState = {
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

function templateDedupKey(template: ProcurementTemplateItem) {
  return String(template.fileName || template.name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function templateTime(template: ProcurementTemplateItem) {
  const time = Date.parse(template.scannedAt || template.importedAt || '');
  return Number.isFinite(time) ? time : 0;
}

function dedupeTemplatesForView(templates: ProcurementTemplateItem[], activeTemplateId: string) {
  const groups = new Map<string, ProcurementTemplateItem[]>();
  templates.forEach((template) => {
    const key = templateDedupKey(template);
    if (!key) return;
    groups.set(key, [...(groups.get(key) || []), template]);
  });

  return Array.from(groups.values()).map((items) => [...items].sort((first, second) => {
    if (first.id === activeTemplateId && second.id !== activeTemplateId) return -1;
    if (second.id === activeTemplateId && first.id !== activeTemplateId) return 1;
    return templateTime(second) - templateTime(first);
  })[0]);
}

function ProcurementTemplateLibraryPage({ onNavigate }: ProcurementTemplateLibraryPageProps) {
  const [state, setState] = useState<ProcurementAgentState>(emptyTemplateState);
  const [loading, setLoading] = useState(false);
  const backendAvailable = Boolean(window.yibiao?.procurementAgent);
  const { showToast } = useToast();
  const templates = useMemo(
    () => dedupeTemplatesForView(state.templateLibrary, state.activeTemplateId).sort((first, second) => templateTime(second) - templateTime(first)),
    [state.activeTemplateId, state.templateLibrary],
  );
  const activeTemplate = templates.find((template) => template.id === state.activeTemplateId);

  useEffect(() => {
    trackPageView('procurement-template-library');
    void loadState();
  }, []);

  const loadState = async () => {
    if (!window.yibiao?.procurementAgent) return;
    try {
      const loaded = await window.yibiao.procurementAgent.loadState();
      if (loaded) setState(loaded);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '加载模板库失败', 'error');
    }
  };

  const uploadTemplate = async () => {
    if (!window.yibiao?.procurementAgent) {
      showToast('当前是浏览器预览模式，请在 Electron 客户端中上传模板。', 'info', { title: '预览模式' });
      return;
    }
    try {
      setLoading(true);
      const result = await window.yibiao.procurementAgent.importTemplateDocument();
      setState(result.state);
      showToast(result.message || '模板导入并扫描完成', result.success ? 'success' : 'error');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '上传模板失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const viewTemplate = async (template: ProcurementTemplateItem) => {
    if (template.id === state.activeTemplateId) {
      onNavigate('procurement-template-detail');
      return;
    }

    if (window.yibiao?.procurementAgent.selectTemplate) {
      try {
        setLoading(true);
        const nextState = await window.yibiao.procurementAgent.selectTemplate({ templateId: template.id });
        setState(nextState);
      } catch (error) {
        const message = error instanceof Error ? error.message : '加载模板详情失败';
        showToast(
          message.includes('No handler registered')
            ? '模板切换能力需要重启客户端后生效；当前可先查看已加载模板。'
            : message,
          'error',
        );
        setLoading(false);
        return;
      } finally {
        setLoading(false);
      }
    }
    onNavigate('procurement-template-detail');
  };

  const deleteTemplate = async (template: ProcurementTemplateItem) => {
    if (!window.yibiao?.procurementAgent.deleteTemplate) {
      showToast('当前版本暂未启用模板删除能力。', 'info');
      return;
    }
    try {
      setLoading(true);
      const result = await window.yibiao.procurementAgent.deleteTemplate({ templateId: template.id });
      setState(result.state);
      showToast(result.message || '模板已删除', result.success ? 'success' : 'error');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除模板失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="procurement-agent-page procurement-library-page">
      <header className="procurement-agent-topbar">
        <div className="procurement-brand-lockup">
          <span className="procurement-brand-mark" aria-hidden="true">
            <img src={bidLogoUrl} alt="" />
          </span>
          <div>
            <span className="section-kicker">Template Library</span>
            <h2>模板库管理</h2>
            <p>集中管理询比采购文件模板，上传后自动扫描、规范化标题、生成 PDF 预览和待填字段地图。</p>
          </div>
        </div>
        <div className="procurement-agent-actions">
          <span className={`procurement-model-pill${backendAvailable ? '' : ' is-preview'}`}>
            {backendAvailable ? '本地模板库' : '预览模式'}
          </span>
          <button type="button" className="procurement-primary-button" disabled={loading || !backendAvailable} onClick={uploadTemplate}>
            {loading ? '处理中...' : '上传模板'}
          </button>
        </div>
      </header>

      <main className="procurement-agent-body">
        <section className="procurement-template-library-layout">
          <div className="procurement-template-library-toolbar">
            <div>
              <h3>已存模板</h3>
              <p>{templates.length ? `共 ${templates.length} 个模板，当前加载：${activeTemplate?.name || '未选择'}` : '暂无模板，请先上传询比采购文件模板。'}</p>
            </div>
            <button type="button" className="procurement-secondary-button" disabled={loading || !backendAvailable} onClick={() => void loadState()}>
              刷新
            </button>
          </div>

          {templates.length ? (
            <div className="procurement-template-library-grid">
              {templates.map((template) => (
                <article key={template.id} className={`procurement-template-library-card${template.id === state.activeTemplateId ? ' is-active' : ''}`}>
                  <div className="procurement-template-library-card-head">
                    <span>{template.id === state.activeTemplateId ? '已加载' : '已存储'}</span>
                    <strong>{template.name}</strong>
                    <p>{template.fileName}</p>
                  </div>
                  <div className="procurement-template-library-stats">
                    <span><strong>{template.stats.outlineCount || 0}</strong>大纲节点</span>
                    <span><strong>{template.stats.fieldCount || 0}</strong>待填字段</span>
                    <span><strong>{template.stats.blockCount || 0}</strong>原文块</span>
                  </div>
                  <div className="procurement-template-library-meta">
                    <span>扫描时间：{formatTime(template.scannedAt)}</span>
                    <span>规范化标题：{template.stats.normalizedHeadingCount || 0} 处</span>
                  </div>
                  <div className="procurement-template-library-actions">
                    <button type="button" className="procurement-primary-button" disabled={loading} onClick={() => void viewTemplate(template)}>查看详情</button>
                    <button type="button" className="procurement-secondary-button" disabled={loading} onClick={() => void deleteTemplate(template)}>删除</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="procurement-panel procurement-template-library-empty">
              <h3>还没有模板</h3>
              <p>上传一个工程类询比采购文件模板后，系统会保存原始文件、规范化文件、PDF 预览和字段扫描结果，后续可重复选择使用。</p>
              <button type="button" className="procurement-primary-button" disabled={loading || !backendAvailable} onClick={uploadTemplate}>
                上传第一个模板
              </button>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}

function formatTime(value: string) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

export default ProcurementTemplateLibraryPage;
