const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { dialog } = require('electron');
const { getWorkspaceDir } = require('../utils/paths.cjs');
const { parseDocumentWithConfig } = require('./fileService.cjs');

const execFileAsync = promisify(execFile);

const TEMPLATE_QUESTIONS = [
  {
    id: 'project_name',
    fieldKey: 'project_name',
    label: '项目名称',
    group: '项目基本信息',
    chapter: '第一章 询比采购公告',
    type: 'blank',
    inputKind: 'short-text',
    required: true,
    targetText: '封面标题、采购公告项目名称',
    placeholder: '从需求方案中提取项目名称',
  },
  {
    id: 'project_code',
    fieldKey: 'project_code',
    label: '项目编号',
    group: '项目基本信息',
    chapter: '第一章 询比采购公告',
    type: 'blank',
    inputKind: 'short-text',
    required: true,
    targetText: '公告中的项目编号或采购编号',
    placeholder: '例如 GAFZ-JG-2026-0001',
  },
  {
    id: 'purchaser',
    fieldKey: 'purchaser',
    label: '采购人',
    group: '项目基本信息',
    chapter: '第一章 询比采购公告',
    type: 'blank',
    inputKind: 'short-text',
    required: true,
    targetText: '采购公告采购人信息',
    placeholder: '填写采购人全称',
  },
  {
    id: 'agency',
    fieldKey: 'agency',
    label: '采购代理机构',
    group: '项目基本信息',
    chapter: '第一章 询比采购公告',
    type: 'blank',
    inputKind: 'short-text',
    required: false,
    targetText: '采购代理机构名称',
    placeholder: '如无代理可留空',
  },
  {
    id: 'procurement_type',
    fieldKey: 'procurement_type',
    label: '采购类型',
    group: '项目基本信息',
    chapter: '封面与任务信息',
    type: 'choice',
    inputKind: 'select',
    required: true,
    options: ['工程类', '服务类', '货物类'],
    targetText: '模板类型选择',
    placeholder: '选择采购类型',
  },
  {
    id: 'procurement_method',
    fieldKey: 'procurement_method',
    label: '采购方式',
    group: '项目基本信息',
    chapter: '第二章 供应商须知',
    type: 'choice',
    inputKind: 'select',
    required: true,
    options: ['询比采购'],
    targetText: '供应商须知前附表采购方式',
    placeholder: '选择采购方式',
  },
  {
    id: 'budget_amount',
    fieldKey: 'budget_amount',
    label: '预算金额',
    group: '价格与保证金',
    chapter: '第一章 询比采购公告',
    type: 'blank',
    inputKind: 'short-text',
    required: false,
    risk: true,
    targetText: '采购预算或资金来源说明',
    placeholder: '例如 120.00万元',
  },
  {
    id: 'max_price',
    fieldKey: 'max_price',
    label: '最高限价',
    group: '价格与保证金',
    chapter: '第一章 询比采购公告',
    type: 'blank',
    inputKind: 'short-text',
    required: true,
    risk: true,
    targetText: '公告和供应商须知中的最高限价',
    placeholder: '例如 98.50万元',
  },
  {
    id: 'bid_security',
    fieldKey: 'bid_security',
    label: '询比保证金',
    group: '价格与保证金',
    chapter: '第二章 供应商须知',
    type: 'blank',
    inputKind: 'short-text',
    required: false,
    risk: true,
    targetText: '保证金金额、缴纳方式、退还方式',
    placeholder: '例如 不收取或 1万元',
  },
  {
    id: 'contract_period',
    fieldKey: 'contract_period',
    label: '工期或服务期',
    group: '项目详细要求',
    chapter: '第一章 询比采购公告',
    type: 'blank',
    inputKind: 'short-text',
    required: true,
    risk: true,
    targetText: '计划工期、服务期或合同履行期限',
    placeholder: '例如 60日历天',
  },
  {
    id: 'project_scope',
    fieldKey: 'project_scope',
    label: '采购范围',
    group: '项目详细要求',
    chapter: '第四章 项目详细要求',
    type: 'blank',
    inputKind: 'long-text',
    required: true,
    targetText: '采购范围、建设内容、工程量或项目概况',
    placeholder: '填写采购范围和主要建设内容',
  },
  {
    id: 'qualification_requirements',
    fieldKey: 'qualification_requirements',
    label: '供应商资格要求',
    group: '资格条件',
    chapter: '第三章 供应商资格证明材料',
    type: 'blank',
    inputKind: 'long-text',
    required: true,
    risk: true,
    targetText: '供应商资质、业绩、人员、安全生产许可等资格条件',
    placeholder: '逐条填写资格条件',
  },
  {
    id: 'evaluation_method',
    fieldKey: 'evaluation_method',
    label: '评审办法',
    group: '评审办法',
    chapter: '第五章 评审办法',
    type: 'choice',
    inputKind: 'select',
    required: true,
    risk: true,
    options: ['经评审的最低投标价法', '综合评估法'],
    targetText: '评审办法章节和供应商须知前附表',
    placeholder: '选择评审办法',
  },
  {
    id: 'response_deadline',
    fieldKey: 'response_deadline',
    label: '响应文件递交截止时间',
    group: '采购安排',
    chapter: '第一章 询比采购公告',
    type: 'blank',
    inputKind: 'short-text',
    required: true,
    risk: true,
    targetText: '响应文件递交截止时间、开启时间',
    placeholder: '例如 2026年6月30日09时30分',
  },
  {
    id: 'response_submission_location',
    fieldKey: 'response_submission_location',
    label: '响应文件递交地点',
    group: '采购安排',
    chapter: '第一章 询比采购公告',
    type: 'blank',
    inputKind: 'short-text',
    required: true,
    targetText: '响应文件递交地点或开启地点',
    placeholder: '填写递交地点',
  },
  {
    id: 'contact_person',
    fieldKey: 'contact_person',
    label: '联系人',
    group: '采购安排',
    chapter: '第一章 询比采购公告',
    type: 'blank',
    inputKind: 'short-text',
    required: false,
    targetText: '采购人或代理机构联系人',
    placeholder: '填写联系人',
  },
  {
    id: 'contact_phone',
    fieldKey: 'contact_phone',
    label: '联系电话',
    group: '采购安排',
    chapter: '第一章 询比采购公告',
    type: 'blank',
    inputKind: 'short-text',
    required: false,
    targetText: '联系人电话、手机或座机',
    placeholder: '填写联系电话',
  },
  {
    id: 'payment_terms',
    fieldKey: 'payment_terms',
    label: '付款方式',
    group: '合同主要条款',
    chapter: '第七章 合同主要条款',
    type: 'blank',
    inputKind: 'long-text',
    required: false,
    risk: true,
    targetText: '合同价款支付、结算方式、付款节点',
    placeholder: '填写付款方式或结算条款',
  },
];

const FIELD_DEFINITIONS = TEMPLATE_QUESTIONS.map((question) => ({
  key: question.fieldKey,
  label: question.label,
  group: question.group,
  required: Boolean(question.required),
  risk: Boolean(question.risk),
}));

const FIELD_KEY_ALIASES = {
  projectName: 'project_name',
  project_code: 'project_code',
  projectCode: 'project_code',
  purchaserName: 'purchaser',
  procurementType: 'procurement_type',
  procurementMethod: 'procurement_method',
  budgetAmount: 'budget_amount',
  maxPrice: 'max_price',
  maximumPrice: 'max_price',
  bidSecurity: 'bid_security',
  contractPeriod: 'contract_period',
  projectScope: 'project_scope',
  qualificationRequirements: 'qualification_requirements',
  evaluationMethod: 'evaluation_method',
  responseDeadline: 'response_deadline',
  responseSubmissionLocation: 'response_submission_location',
  contactPerson: 'contact_person',
  contactPhone: 'contact_phone',
  paymentTerms: 'payment_terms',
};

const FIELD_LABEL_TO_KEY = Object.fromEntries(FIELD_DEFINITIONS.map((field) => [field.label, field.key]));

const KEYWORD_PATTERNS = [
  /项目名称|工程名称|项目编号|采购编号|采购人|发包人|采购代理|代理机构|采购方式|采购类型/,
  /预算金额|采购预算|最高限价|控制价|报价|保证金|履约保证金/,
  /工期|服务期|计划工期|合同期限|交付期|采购范围|建设内容|项目概况/,
  /资格要求|供应商资格|供应商资质|资质|业绩|项目负责人|安全生产许可证/,
  /评审办法|综合评估|最低投标价|经评审|评分/,
  /响应文件|递交截止|提交截止|递交地点|开启时间|开标|询比时间/,
  /联系人|联系电话|联系方式|邮箱|地址/,
  /付款|支付|结算|合同主要条款/,
];

const DEFAULT_TASK = {
  projectName: '',
  projectCode: '',
  procurementType: '工程类',
  procurementMethod: '询比采购',
  reviewMethod: '经评审的最低投标价法',
  templateName: '工程类询比采购文件模板',
  owner: '',
};

const TEMPLATE_FIELD_RULES = [
  { key: 'project_name', label: '项目名称', labels: ['项目名称', '工程名称', '采购项目名称'], type: 'blank', required: true },
  { key: 'project_code', label: '项目编号', labels: ['项目编号', '采购编号', '项目编码'], type: 'blank', required: true },
  { key: 'cover_date', label: '封面日期', labels: ['年 月 日'], type: 'blank', required: true },
  { key: 'purchaser', label: '采购人', labels: ['采购人', '发包人', '建设单位'], type: 'blank', required: true },
  { key: 'agency', label: '采购代理机构', labels: ['采购代理机构', '代理机构'], type: 'blank', required: false },
  { key: 'announcement_project_name', label: '公告首段项目名称', labels: ['拟对“ ”项目', '拟对“”项目', '（采购项目名称）询比采购公告'], type: 'blank', required: true },
  { key: 'procurement_type', label: '采购类型', labels: ['采购类型', '项目类型'], type: 'choice', required: true, options: ['工程类', '服务类', '货物类'] },
  { key: 'procurement_method', label: '采购方式', labels: ['采购方式'], type: 'choice', required: true, options: ['询比采购'] },
  { key: 'budget_amount', label: '预算金额', labels: ['预算金额', '采购预算'], type: 'blank', required: false, risk: true },
  { key: 'max_price', label: '最高限价', labels: ['最高限价', '控制价', '采购限价'], type: 'blank', required: true, risk: true },
  { key: 'bid_security', label: '询比保证金', labels: ['询比保证金', '投标保证金', '保证金'], type: 'blank', required: false, risk: true },
  { key: 'lot_count', label: '标段划分', labels: ['标段划分'], type: 'blank', required: false },
  { key: 'construction_content_scale', label: '建设内容及规模', labels: ['建设内容及规模', '建设内容', '建设规模'], type: 'blank', required: true, risk: true },
  { key: 'construction_location', label: '建设地点', labels: ['建设地点', '项目地点', '实施地点'], type: 'blank', required: true },
  { key: 'contract_period', label: '工期或服务期', labels: ['工期', '工期要求', '计划工期', '服务期', '合同履行期限'], type: 'blank', required: true, risk: true },
  { key: 'project_scope', label: '采购范围', labels: ['采购范围', '建设内容', '项目概况', '工程范围'], type: 'blank', required: true },
  { key: 'qualification_requirements', label: '供应商资格要求', labels: ['供应商资格要求', '供应商资格条件', '资格要求', '资格条件'], type: 'blank', required: true, risk: true },
  { key: 'general_requirement', label: '一般资格要求', labels: ['一般要求', '具有'], type: 'blank', required: false, risk: true },
  { key: 'financial_requirement', label: '财务要求', labels: ['财务要求', '无财务要求'], type: 'compound', required: false, risk: true, options: ['有财务要求', '无财务要求'] },
  { key: 'qualification_requirement', label: '资质要求', labels: ['资质要求', '资质条件', '无资质要求', '安全生产许可证'], type: 'compound', required: false, risk: true, options: ['有资质要求', '无资质要求', '需要安全生产许可证'] },
  { key: 'performance_requirement', label: '业绩要求', labels: ['业绩要求', '类似项目业绩', '无业绩要求'], type: 'compound', required: false, risk: true, options: ['有业绩要求', '无业绩要求'] },
  { key: 'personnel_requirement', label: '人员要求', labels: ['人员要求', '项目经理', '项目负责人', '技术负责人', '其他人员', '无人员要求'], type: 'compound', required: false, risk: true, options: ['有人员要求', '无人员要求'] },
  { key: 'other_supplier_requirement', label: '其他要求', labels: ['其他要求'], type: 'blank', required: false, risk: true },
  { key: 'joint_venture_requirement', label: '联合体要求', labels: ['联合体'], type: 'compound', required: false, risk: true, options: ['接受联合体', '不接受联合体'] },
  { key: 'evaluation_method', label: '评审办法', labels: ['评审办法', '评标办法', '评审方法'], type: 'choice', required: true, risk: true, options: ['经评审的最低投标价法', '综合评估法'] },
  { key: 'response_deadline', label: '响应文件递交截止时间', labels: ['响应文件递交截止时间', '递交截止时间', '提交截止时间', '开启时间'], type: 'blank', required: true, risk: true },
  { key: 'response_submission_location', label: '响应文件递交地点', labels: ['响应文件递交地点', '递交地点', '提交地点', '开启地点'], type: 'blank', required: true },
  { key: 'contact_person', label: '联系人', labels: ['联系人'], type: 'blank', required: false },
  { key: 'contact_phone', label: '联系电话', labels: ['联系电话', '电话', '联系方式'], type: 'blank', required: false },
  { key: 'objection_contact_person', label: '异议受理人', labels: ['异议受理人'], type: 'blank', required: false },
  { key: 'objection_contact_phone', label: '异议受理人电话', labels: ['异议受理人电话'], type: 'blank', required: false },
  { key: 'contact_email', label: '电子邮箱', labels: ['电子邮箱', '邮箱'], type: 'blank', required: false },
  { key: 'payment_terms', label: '付款方式', labels: ['付款方式', '支付方式', '付款条件', '结算方式'], type: 'blank', required: false, risk: true },
  { key: 'lot_number', label: '标段号', labels: ['标段号'], type: 'blank', required: false },
  { key: 'supplier_name', label: '供应商名称', labels: ['供应商名称', '供应商法定全称'], type: 'blank', required: false },
  { key: 'supplier_nature', label: '单位性质', labels: ['单位性质'], type: 'blank', required: false },
  { key: 'supplier_address', label: '地址', labels: ['地址'], type: 'blank', required: false },
  { key: 'business_term', label: '经营期限', labels: ['经营期限'], type: 'blank', required: false },
  { key: 'legal_representative', label: '法定代表人', labels: ['法定代表人'], type: 'blank', required: false },
  { key: 'authorized_agent', label: '委托代理人', labels: ['委托代理人'], type: 'blank', required: false },
];

const TEMPLATE_TASK_ORDER = new Map(TEMPLATE_FIELD_RULES.map((rule, index) => [rule.key, (index + 1) * 10]));
const TEMPLATE_TASK_SCHEMA_VERSION = '1.1.0';

const DEFAULT_TEMPLATE_CANDIDATES = [
  'C:\\Users\\23811\\Desktop\\广发\\3.16询比采购文件【工程类】.docx',
];

const VALID_FIELD_STATUSES = new Set(['confirmed', 'pending', 'risk', 'missing']);
const jsonWriteQueues = new Map();

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeString(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeLooseText(value) {
  return normalizeString(value).replace(/\s+/g, '').toLowerCase();
}

function normalizeTemplateKey(template) {
  const name = safeFileStem(template?.fileName || template?.name || '');
  return normalizeLooseText(name);
}

function templateTimestamp(template) {
  const time = Date.parse(template?.scannedAt || template?.importedAt || '');
  return Number.isFinite(time) ? time : 0;
}

function dedupeTemplateLibrary(templates, activeTemplateId = '') {
  const groups = new Map();
  (Array.isArray(templates) ? templates : []).forEach((template) => {
    const key = normalizeTemplateKey(template);
    if (!key) return;
    const list = groups.get(key) || [];
    list.push(template);
    groups.set(key, list);
  });

  const kept = [];
  const removed = [];
  groups.forEach((items) => {
    const sorted = [...items].sort((first, second) => {
      if (first.id === activeTemplateId && second.id !== activeTemplateId) return -1;
      if (second.id === activeTemplateId && first.id !== activeTemplateId) return 1;
      return templateTimestamp(second) - templateTimestamp(first);
    });
    kept.push(sorted[0]);
    removed.push(...sorted.slice(1));
  });

  return {
    kept: kept.sort((first, second) => templateTimestamp(second) - templateTimestamp(first)),
    removed,
  };
}

function createEmptyTemplateTaskPack(templateId = '', templateName = '') {
  return {
    templateId,
    templateName,
    schemaVersion: TEMPLATE_TASK_SCHEMA_VERSION,
    taskCount: 0,
    generatedAt: '',
    tasks: [],
  };
}

function inferInputKind(type) {
  if (type === 'compound') return 'compound';
  if (type === 'choice' || type === 'multiChoice') return 'select';
  return 'short-text';
}

function inferTaskGroup(rule, outlineTitleText = '') {
  if (/项目名称|项目编号|采购人|采购代理|采购类型|采购方式/.test(rule.label)) return '基础信息';
  if (/金额|预算|限价|保证金|付款/.test(rule.label)) return '金额与合同';
  if (/工期|服务期|截止|地点|联系人|电话|邮箱/.test(rule.label)) return '时间地点与联系';
  if (/资格|资质|业绩|人员|财务/.test(rule.label)) return '供应商资格';
  if (/评审/.test(rule.label)) return '评审办法';
  return outlineTitleText || '其他信息';
}

function createTaskPrompt(rule) {
  const base = `从采购需求方案中提取“${rule.label}”。`;
  if (rule.type === 'compound') return `${base}该字段是“勾选项+填空”的复合题，必须同时判断应勾选哪一项，并提取需要填入空白处的文本；找不到依据时不要编造，value 置空并说明缺失依据。`;
  if (rule.risk) return `${base}该字段属于高风险字段，必须返回证据原文和出处；找不到时不要编造，value 置空。`;
  if (rule.type === 'choice') return `${base}该字段为选择题，只能从候选项中选择；找不到时 value 置空。`;
  return `${base}找不到明确答案时 value 置空，并说明缺失依据。`;
}

function createTaskAnchor(field, index) {
  return {
    id: `${field.key}_anchor_${String(index + 1).padStart(3, '0')}`,
    fieldId: field.id,
    blockId: field.blockId,
    outlineId: field.outlineId,
    blockOrder: field.blockOrder,
    matchText: field.placeholder || field.label,
    sourceText: field.sourceText,
    pageHint: null,
  };
}

function buildTemplateTaskPack({ templateId, templateName, fields, outline }) {
  const generatedAt = nowIso();
  const outlineById = new Map((outline || []).map((node) => [node.id, node]));
  const ruleByKey = new Map(TEMPLATE_FIELD_RULES.map((rule) => [rule.key, rule]));
  const fieldsByKey = new Map();

  (Array.isArray(fields) ? fields : []).forEach((field) => {
    if (!field?.key) return;
    fieldsByKey.set(field.key, [...(fieldsByKey.get(field.key) || []), field]);
  });

  const tasks = [...fieldsByKey.entries()].map(([key, taskFields], index) => {
    const firstField = taskFields[0];
    const rule = ruleByKey.get(key) || firstField;
    const outlineTitleText = outlineById.get(firstField.outlineId)?.title || '未归类章节';
    const anchors = taskFields
      .sort((first, second) => first.blockOrder - second.blockOrder)
      .map((field, anchorIndex) => createTaskAnchor(field, anchorIndex));
    return {
      key,
      label: rule.label || firstField.label || key,
      type: rule.type || firstField.type || 'blank',
      inputKind: inferInputKind(rule.type || firstField.type || 'blank'),
      group: inferTaskGroup(rule, outlineTitleText),
      chapter: outlineTitleText,
      required: Boolean(rule.required ?? firstField.required),
      risk: Boolean(rule.risk ?? firstField.risk),
      order: TEMPLATE_TASK_ORDER.get(key) || (10000 + (index + 1) * 10),
      prompt: createTaskPrompt(rule),
      placeholder: firstField.placeholder || rule.label || key,
      options: rule.options || firstField.options || [],
      anchors,
      validation: {
        minLength: rule.required ? 1 : 0,
      },
      createdAt: generatedAt,
      updatedAt: generatedAt,
    };
  }).sort((first, second) => first.order - second.order);

  return {
    templateId,
    templateName,
    schemaVersion: TEMPLATE_TASK_SCHEMA_VERSION,
    taskCount: tasks.length,
    generatedAt,
    tasks,
  };
}

async function saveTemplateTaskPack(app, taskPack) {
  const templateId = normalizeString(taskPack?.templateId || '');
  if (!templateId) return createEmptyTemplateTaskPack();
  const packDir = getTemplateTaskPackDir(app, templateId);
  const tasksDir = getTemplateTaskDir(app, templateId);
  await fs.mkdir(tasksDir, { recursive: true });

  const tasks = Array.isArray(taskPack.tasks) ? taskPack.tasks : [];
  const manifest = {
    templateId: taskPack.templateId,
    templateName: taskPack.templateName,
    schemaVersion: taskPack.schemaVersion || TEMPLATE_TASK_SCHEMA_VERSION,
    taskCount: tasks.length,
    generatedAt: taskPack.generatedAt || nowIso(),
    taskKeys: tasks.map((task) => task.key),
  };

  await writeJsonFile(path.join(packDir, 'manifest.json'), manifest);
  await Promise.all(tasks.map((task) => writeJsonFile(path.join(tasksDir, `${safeFileStem(task.key)}.json`), task)));

  return {
    ...taskPack,
    taskCount: tasks.length,
    tasks,
  };
}

async function readTemplateTaskPack(app, template) {
  const templateId = normalizeString(template?.id || '');
  if (!templateId) return createEmptyTemplateTaskPack();
  const packDir = getTemplateTaskPackDir(app, templateId);
  const tasksDir = getTemplateTaskDir(app, templateId);

  try {
    const manifest = await readJsonFile(path.join(packDir, 'manifest.json'));
    const taskKeys = Array.isArray(manifest.taskKeys) ? manifest.taskKeys : [];
    const tasks = [];
    for (const key of taskKeys) {
      try {
        tasks.push(await readJsonFile(path.join(tasksDir, `${safeFileStem(key)}.json`)));
      } catch {
        // 单个任务文件丢失时跳过，后续校验会提示数量不一致。
      }
    }
    return {
      templateId,
      templateName: manifest.templateName || template?.name || '',
      schemaVersion: manifest.schemaVersion || TEMPLATE_TASK_SCHEMA_VERSION,
      taskCount: tasks.length,
      generatedAt: manifest.generatedAt || '',
      tasks: tasks.sort((first, second) => Number(first.order || 0) - Number(second.order || 0)),
    };
  } catch {
    return createEmptyTemplateTaskPack(templateId, template?.name || '');
  }
}

function createTemplateQuestions() {
  return TEMPLATE_QUESTIONS.map((question, index) => ({
    order: index + 1,
    required: false,
    risk: false,
    options: [],
    ...question,
  }));
}

function createEmptyState() {
  const createdAt = nowIso();
  const questions = createTemplateQuestions();
  const answers = createMissingAnswers(questions);
  const fields = answersToFields(answers, questions);

  return {
    task: {
      id: createId('procurement'),
      ...DEFAULT_TASK,
      status: 'draft',
      createdAt,
      updatedAt: createdAt,
    },
    documents: [],
    templateLibrary: [],
    activeTemplateId: '',
    templateOutline: [],
    templateBlocks: [],
    templateFields: [],
    templateTaskPack: createEmptyTemplateTaskPack(),
    templateScan: {
      status: 'idle',
      message: '请先上传询比采购文件模板',
      scannedAt: '',
      normalizedAt: '',
      outlineCount: 0,
      blockCount: 0,
      fieldCount: 0,
      warningCount: 0,
    },
    questions,
    sourceBlocks: [],
    answers,
    fields,
    extraction: {
      status: 'idle',
      message: '等待上传采购需求方案',
      extractedAt: '',
      fieldCount: 0,
      missingCount: FIELD_DEFINITIONS.filter((field) => field.required).length,
      riskCount: 0,
      pendingCount: 0,
    },
    markdownPreview: '',
    logs: [
      {
        id: createId('log'),
        time: createdAt,
        message: '采购文件智能体任务已创建',
      },
    ],
  };
}

function createMissingFields() {
  return answersToFields(createMissingAnswers(createTemplateQuestions()), createTemplateQuestions());
}

function getProcurementDir(app) {
  return path.join(getWorkspaceDir(app), 'procurement-agent');
}

function getStatePath(app) {
  return path.join(getProcurementDir(app), 'state.json');
}

function getMarkdownPath(app) {
  return path.join(getProcurementDir(app), 'demand.md');
}

function getTemplateLibraryDir(app) {
  return path.join(getProcurementDir(app), 'templates');
}

function getTemplateTaskPackDir(app, templateId) {
  return path.join(getTemplateLibraryDir(app), templateId, 'task-pack');
}

function getTemplateTaskDir(app, templateId) {
  return path.join(getTemplateTaskPackDir(app, templateId), 'tasks');
}

function safeFileStem(value) {
  return path.basename(String(value || 'template'), path.extname(String(value || 'template')))
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'template';
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function writeJsonFileNow(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempFile, JSON.stringify(value, null, 2), 'utf-8');
    await fs.rename(tempFile, filePath);
  } catch (error) {
    await fs.rm(tempFile, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function writeJsonFile(filePath, value) {
  const previous = jsonWriteQueues.get(filePath) || Promise.resolve();
  const queued = previous
    .catch(() => undefined)
    .then(() => writeJsonFileNow(filePath, value));
  jsonWriteQueues.set(filePath, queued);

  try {
    return await queued;
  } finally {
    if (jsonWriteQueues.get(filePath) === queued) {
      jsonWriteQueues.delete(filePath);
    }
  }
}

function addLog(state, message) {
  return {
    ...state,
    logs: [
      {
        id: createId('log'),
        time: nowIso(),
        message,
      },
      ...(Array.isArray(state.logs) ? state.logs : []),
    ].slice(0, 60),
  };
}

async function removeStoredTemplate(app, template) {
  const baseDir = path.resolve(getTemplateLibraryDir(app));
  const templatePath = template?.storedPath || template?.normalizedPath || template?.previewPdfPath || '';
  if (!templatePath) return;

  const templateDir = path.resolve(path.dirname(templatePath));
  if (templateDir && templateDir !== baseDir && templateDir.startsWith(`${baseDir}${path.sep}`)) {
    await fs.rm(templateDir, { recursive: true, force: true });
  }
}

function summarizeMarkdown(markdown) {
  const text = String(markdown || '').replace(/\r/g, '').trim();
  if (!text) return '';
  return text.slice(0, 6000);
}

function isHeadingLine(line) {
  const text = normalizeString(line);
  if (!text) return false;
  if (/^#{1,6}\s+/.test(text)) return true;
  if (/^第[一二三四五六七八九十0-9]+[章节条]/.test(text)) return true;
  if (/^[一二三四五六七八九十0-9]+[、.．]\s*\S+/.test(text) && text.length <= 70) return true;
  if (/^[（(][一二三四五六七八九十0-9]+[）)]\s*\S+/.test(text) && text.length <= 70) return true;
  return false;
}

function createBlockTitle(text, heading) {
  const cleanedHeading = normalizeString(heading).replace(/^#{1,6}\s*/, '');
  if (cleanedHeading) return cleanedHeading.slice(0, 42);
  return normalizeString(text).slice(0, 42) || '正文片段';
}

function extractKeywordTags(text) {
  const tags = [];
  const tagRules = [
    ['项目', /项目名称|项目编号|采购人|采购方式|采购类型/],
    ['金额', /预算金额|最高限价|控制价|保证金/],
    ['范围', /采购范围|建设内容|项目概况|工程量/],
    ['资格', /资格要求|供应商资格|资质|业绩|安全生产许可证/],
    ['评审', /评审办法|综合评估|最低投标价|评分/],
    ['时间', /响应文件|递交截止|提交截止|开启时间|工期|服务期/],
    ['合同', /付款|支付|结算|合同/],
  ];
  tagRules.forEach(([tag, pattern]) => {
    if (pattern.test(text)) tags.push(tag);
  });
  return tags;
}

function pushSourceBlock(blocks, lines, heading, startLine, endLine) {
  const text = lines.map((line) => normalizeString(line)).filter(Boolean).join('\n').trim();
  if (!text) return;

  const order = blocks.length + 1;
  const title = createBlockTitle(text, heading);
  blocks.push({
    id: `src_${String(order).padStart(3, '0')}`,
    order,
    page: null,
    title,
    heading: normalizeString(heading),
    text,
    preview: text.length > 150 ? `${text.slice(0, 150)}...` : text,
    startLine,
    endLine,
    keywords: extractKeywordTags(text),
  });
}

function createSourceBlocks(markdown) {
  const rawLines = String(markdown || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let currentLines = [];
  let currentHeading = '';
  let startLine = 1;

  rawLines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    const heading = isHeadingLine(line) ? line : '';

    if (!line) {
      if (currentLines.join('\n').length >= 180) {
        pushSourceBlock(blocks, currentLines, currentHeading, startLine, lineNumber - 1);
        currentLines = [];
        startLine = lineNumber + 1;
      }
      return;
    }

    if (heading && currentLines.length) {
      pushSourceBlock(blocks, currentLines, currentHeading, startLine, lineNumber - 1);
      currentLines = [];
      currentHeading = heading;
      startLine = lineNumber;
    } else if (heading) {
      currentHeading = heading;
      startLine = lineNumber;
    } else if (!currentLines.length) {
      startLine = lineNumber;
    }

    currentLines.push(line);

    if (currentLines.join('\n').length >= 900) {
      pushSourceBlock(blocks, currentLines, currentHeading, startLine, lineNumber);
      currentLines = [];
      startLine = lineNumber + 1;
    }
  });

  if (currentLines.length) {
    pushSourceBlock(blocks, currentLines, currentHeading, startLine, rawLines.length);
  }

  if (!blocks.length) {
    const text = normalizeString(markdown);
    if (text) {
      pushSourceBlock(blocks, [text], '全文', 1, rawLines.length || 1);
    }
  }

  return blocks.slice(0, 240);
}

function createEvidencePack(markdown, sourceBlocks = createSourceBlocks(markdown)) {
  const selected = new Map();
  sourceBlocks.slice(0, 8).forEach((block) => selected.set(block.id, block));

  sourceBlocks.forEach((block, index) => {
    if (!KEYWORD_PATTERNS.some((pattern) => pattern.test(block.text))) return;
    [index - 1, index, index + 1].forEach((targetIndex) => {
      const target = sourceBlocks[targetIndex];
      if (target) selected.set(target.id, target);
    });
  });

  const ordered = [...selected.values()]
    .sort((a, b) => a.order - b.order)
    .map((block) => `[${block.id}] ${block.title}（行 ${block.startLine}-${block.endLine}）\n${block.text}`);

  let output = ordered.join('\n\n');
  if (output.length > 26000) {
    output = output.slice(0, 26000);
  }
  return output;
}

function localName(node) {
  return String(node?.localName || node?.nodeName || '').split(':').pop();
}

function elementChildren(node, name) {
  const children = [];
  for (let index = 0; index < (node?.childNodes?.length || 0); index += 1) {
    const child = node.childNodes[index];
    if (child.nodeType === 1 && (!name || localName(child) === name)) {
      children.push(child);
    }
  }
  return children;
}

function descendants(node, name) {
  const found = [];
  function visit(current) {
    for (let index = 0; index < (current?.childNodes?.length || 0); index += 1) {
      const child = current.childNodes[index];
      if (child.nodeType !== 1) continue;
      if (!name || localName(child) === name) found.push(child);
      visit(child);
    }
  }
  visit(node);
  return found;
}

function getXmlAttr(node, name) {
  return node?.getAttribute?.(`w:${name}`) || node?.getAttribute?.(name) || '';
}

function setXmlAttr(node, name, value) {
  node.setAttribute(`w:${name}`, value);
}

function getNodeText(node) {
  return descendants(node)
    .map((item) => {
      const name = localName(item);
      if (name === 't') return item.textContent || '';
      if (name === 'tab') return ' ';
      if (name === 'br' || name === 'cr') return '\n';
      return '';
    })
    .join('')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim();
}

function getTableText(table) {
  return elementChildren(table, 'tr')
    .map((row) => elementChildren(row, 'tc')
      .map((cell) => getNodeText(cell))
      .filter(Boolean)
      .join(' | '))
    .filter(Boolean)
    .join('\n');
}

function getParagraphStyleId(paragraph) {
  const pPr = elementChildren(paragraph, 'pPr')[0];
  const pStyle = pPr ? elementChildren(pPr, 'pStyle')[0] : null;
  return getXmlAttr(pStyle, 'val');
}

function ensureParagraphStyle(doc, paragraph, styleId) {
  let pPr = elementChildren(paragraph, 'pPr')[0];
  if (!pPr) {
    pPr = doc.createElement('w:pPr');
    paragraph.insertBefore(pPr, paragraph.firstChild);
  }

  let pStyle = elementChildren(pPr, 'pStyle')[0];
  if (!pStyle) {
    pStyle = doc.createElement('w:pStyle');
    pPr.insertBefore(pStyle, pPr.firstChild);
  }

  const previous = getXmlAttr(pStyle, 'val');
  if (previous === styleId) return false;
  setXmlAttr(pStyle, 'val', styleId);
  return true;
}

async function readDocxXml(zip, entryName) {
  const entry = zip.file(entryName);
  if (!entry) return null;
  return entry.async('string');
}

function parseXml(xml) {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function serializeXml(doc) {
  return new XMLSerializer().serializeToString(doc);
}

async function readDocxStyleMap(zip) {
  const stylesXml = await readDocxXml(zip, 'word/styles.xml');
  const styleMap = new Map();
  if (!stylesXml) return styleMap;

  const doc = parseXml(stylesXml);
  descendants(doc, 'style').forEach((style) => {
    const styleId = getXmlAttr(style, 'styleId');
    const type = getXmlAttr(style, 'type');
    const nameNode = elementChildren(style, 'name')[0];
    const name = getXmlAttr(nameNode, 'val');
    if (styleId) {
      styleMap.set(styleId, { styleId, type, name });
    }
  });
  return styleMap;
}

function headingLevelFromStyle(styleId, styleName = '') {
  const source = `${styleId} ${styleName}`.toLowerCase();
  if (/\btoc\b|目录/.test(source)) return 0;
  const headingMatch = /(heading|标题)\s*([1-6一二三四五六])/.exec(source);
  if (headingMatch) return chineseNumberToInt(headingMatch[2]);
  const titleMatch = /^([1-6])$/.exec(String(styleId || ''));
  if (titleMatch && /标题/.test(styleName)) return Number(titleMatch[1]);
  return 0;
}

function chineseNumberToInt(value) {
  const raw = String(value || '').trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (map[raw]) return map[raw];
  if (raw === '十一') return 11;
  if (raw === '十二') return 12;
  return 0;
}

function inferHeadingLevel(text, styleId, styleName) {
  const styledLevel = headingLevelFromStyle(styleId, styleName);
  const value = normalizeString(text);
  if (!value || value.length > 90 || value === '目 录' || value === '目录') return 0;
  if (/^□?第[一二三四五六七八九十0-9]+章/.test(value)) return 1;
  if (/^(询比采购公告|采购公告)$/.test(value)) return 1;
  if (/^(供应商须知|供应商资格证明材料|项目详细要求|响应文件格式|合同主要条款)$/.test(value)) return 1;
  if (/^□?第五章\s*评审办法/.test(value)) return 1;

  const isChineseSection = /^[一二三四五六七八九十]+[、.．]\s*\S+/.test(value);
  if (styledLevel === 2 && isChineseSection) return 2;

  if (styledLevel === 1) return 1;
  if (styledLevel === 2 && !/^[0-9]+(?:\.[0-9]+)*[、.．\s]/.test(value)) return 2;
  return 0;
}

function outlineTitle(text) {
  return normalizeString(text).replace(/\s+/g, ' ').slice(0, 80) || '未命名章节';
}

function blockPreview(text, maxLength = 220) {
  const value = normalizeString(text);
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function createTemplateField(block, rule, serial, matchedLabel) {
  return {
    id: `tpl_field_${String(serial).padStart(3, '0')}`,
    key: rule.key,
    label: rule.label,
    type: rule.type || 'blank',
    required: Boolean(rule.required),
    risk: Boolean(rule.risk),
    options: rule.options || [],
    outlineId: block.outlineId,
    blockId: block.id,
    blockOrder: block.order,
    sourceText: block.text,
    placeholder: matchedLabel || rule.label,
    confidence: matchedLabel ? 82 : 62,
    status: 'detected',
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTailAfterLabel(text, label) {
  const expression = new RegExp(`(^|[\\s\\n\\r|（(，,；;、.．□☐☑])${escapeRegExp(label)}(?:\\s*[（(][^）)]{0,24}[）)])?\\s*[：:]\\s*([^\\n\\r。；;]*)`, 'u');
  const match = expression.exec(String(text || ''));
  return match ? match[2] : null;
}

function hasMeaningfulFilledValue(tail) {
  const normalized = normalizeString(tail)
    .replace(/[□☐☑]/g, '')
    .replace(/含税|不含税|是|否|选择|勾选|填写|填列/g, '')
    .replace(/[（）()【】\[\]_—\-·.,，。；;:：]/g, '')
    .trim();
  if (!normalized) return false;
  if (/^(人民币|元|万元|个|项|标段|日历天|天|年|月|日|%|％)+$/.test(normalized)) return false;
  return /[\u4e00-\u9fffA-Za-z0-9]/.test(normalized);
}

function isTemplateBlankTail(tail) {
  const normalized = normalizeString(tail);
  if (!normalized) return true;
  if (/^[_—-]{2,}/.test(normalized)) return true;
  if (/^[（(【\[]\s*[）)】\]]/.test(normalized)) return true;
  if (/^[□☐☑]/.test(normalized)) return true;
  if (/[\u4e00-\u9fff]\s+(?:年|月|日|个|家|级|证|部门|专业|万元|元|%|％)/.test(normalized)) return true;
  if (/(?:人民币|金额|大写|下浮|不少于|不超过|包括但不限于|具有|须为|至)\s+/.test(normalized)) return true;
  if (/^(人民币|元|万元|个|项|标段|日历天|天|%|％)(?=$|[\s，,。；;）)]|[（(])/.test(normalized)) return true;
  if (/^（[^）]*(以此为准|自行填写|填写|填列|采购项目名称|项目名称|项目编号)[^）]*）/.test(normalized)) return true;
  return !hasMeaningfulFilledValue(normalized);
}

function findTemplateFieldMatch(text, rule) {
  const value = normalizeString(text);
  if (rule.key === 'cover_date' && /^年\s*月\s*日$/.test(value)) return '年 月 日';
  if (rule.key === 'announcement_project_name' && /拟对\s*“\s*”\s*项目/.test(value)) return '拟对“ ”项目';
  if (rule.key === 'announcement_project_name' && /（采购项目名称）\s*询比采购公告/.test(value)) return '（采购项目名称）询比采购公告';
  if (rule.key === 'general_requirement' && /^1[.．、]\s*具有\s*[；;]?$/.test(value)) return '具有';
  if (rule.key === 'project_scope' && /采购范围\s*[：:].*包括但不限于/.test(value)) return '采购范围';
  if (rule.key === 'performance_requirement' && /^□\s*近年/.test(value)) return '近年类似项目';
  if (rule.key === 'joint_venture_requirement') {
    return /本次采购.*（\s*□接受\s*□不接受\s*）\s*联合体/.test(value) ? '联合体' : '';
  }

  for (const label of rule.labels) {
    if (rule.type === 'compound' && value.includes(label)) return label;
    const tail = getTailAfterLabel(text, label);
    if (tail === null) continue;
    const hasChoice = /□|☐|☑/.test(tail);
    if (!hasChoice && !isTemplateBlankTail(tail)) continue;
    return label;
  }
  return '';
}

function detectTemplateFields(block, existingKeys) {
  const fields = [];

  TEMPLATE_FIELD_RULES.forEach((rule) => {
    const matchedLabel = findTemplateFieldMatch(block.text, rule);
    if (!matchedLabel) return;
    const duplicateKey = `${block.id}:${rule.key}:${matchedLabel}`;
    if (existingKeys.has(duplicateKey)) return;
    existingKeys.add(duplicateKey);
    fields.push(createTemplateField(block, rule, existingKeys.size, matchedLabel));
  });

  return fields;
}

function addOutlineNode(outline, stack, level, title, paragraphIndex) {
  while (stack.length && stack[stack.length - 1].level >= level) {
    stack.pop();
  }
  const parent = stack[stack.length - 1] || outline[0];
  const order = outline.length;
  const node = {
    id: `tpl_out_${String(order).padStart(3, '0')}`,
    parentId: parent.id,
    level,
    order,
    title,
    paragraphIndex,
    blockIds: [],
    fieldIds: [],
  };
  outline.push(node);
  stack.push(node);
  return node;
}

async function scanAndNormalizeTemplateDocx(sourcePath, normalizedPath, templateId, fileName) {
  const buffer = await fs.readFile(sourcePath);
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await readDocxXml(zip, 'word/document.xml');
  if (!documentXml) {
    throw new Error('模板文件缺少 word/document.xml，无法扫描');
  }

  const styles = await readDocxStyleMap(zip);
  const doc = parseXml(documentXml);
  const body = descendants(doc, 'body')[0];
  if (!body) {
    throw new Error('模板正文为空，无法扫描');
  }

  const outline = [{
    id: 'tpl_out_root',
    parentId: '',
    level: 0,
    order: 0,
    title: safeFileStem(fileName),
    paragraphIndex: 0,
    blockIds: [],
    fieldIds: [],
  }];
  const stack = [outline[0]];
  const blocks = [];
  const fields = [];
  const warnings = [];
  const existingFieldKeys = new Set();
  let currentOutline = outline[0];
  let paragraphIndex = 0;
  let tableIndex = 0;
  let normalizedHeadingCount = 0;

  elementChildren(body).forEach((child) => {
    const name = localName(child);
    if (name === 'p') {
      paragraphIndex += 1;
      const text = getNodeText(child);
      if (!text) return;

      const styleId = getParagraphStyleId(child);
      const styleName = styles.get(styleId)?.name || '';
      const level = inferHeadingLevel(text, styleId, styleName);
      const existingHeadingLevel = headingLevelFromStyle(styleId, styleName);
      if (level) {
        currentOutline = addOutlineNode(outline, stack, level, outlineTitle(text), paragraphIndex);
        if (!existingHeadingLevel) {
          const changed = ensureParagraphStyle(doc, child, `Heading${Math.min(level, 6)}`);
          if (changed) normalizedHeadingCount += 1;
        }
      }

      const block = {
        id: `tpl_block_${String(blocks.length + 1).padStart(4, '0')}`,
        templateId,
        outlineId: currentOutline.id,
        type: 'paragraph',
        order: blocks.length + 1,
        paragraphIndex,
        tableIndex: 0,
        level: level || 0,
        styleId,
        styleName,
        isHeading: Boolean(level),
        normalizedHeading: Boolean(level && !existingHeadingLevel),
        text,
        preview: blockPreview(text),
        fieldIds: [],
      };
      blocks.push(block);
      currentOutline.blockIds.push(block.id);
      const blockFields = detectTemplateFields(block, existingFieldKeys);
      blockFields.forEach((field) => {
        fields.push(field);
        block.fieldIds.push(field.id);
        currentOutline.fieldIds.push(field.id);
      });
      return;
    }

    if (name === 'tbl') {
      tableIndex += 1;
      const text = getTableText(child);
      if (!text) return;
      const block = {
        id: `tpl_block_${String(blocks.length + 1).padStart(4, '0')}`,
        templateId,
        outlineId: currentOutline.id,
        type: 'table',
        order: blocks.length + 1,
        paragraphIndex,
        tableIndex,
        level: 0,
        styleId: '',
        styleName: '',
        isHeading: false,
        normalizedHeading: false,
        text,
        preview: blockPreview(text),
        fieldIds: [],
      };
      blocks.push(block);
      currentOutline.blockIds.push(block.id);
      const blockFields = detectTemplateFields(block, existingFieldKeys);
      blockFields.forEach((field) => {
        fields.push(field);
        block.fieldIds.push(field.id);
        currentOutline.fieldIds.push(field.id);
      });
    }
  });

  if (outline.length <= 1) {
    warnings.push('未识别到标题大纲，请检查模板是否使用章节标题或标题样式。');
  }
  if (!fields.length) {
    warnings.push('未识别到待填字段，请检查模板是否包含字段标签、空白线或选择框。');
  }

  zip.file('word/document.xml', serializeXml(doc));
  await fs.mkdir(path.dirname(normalizedPath), { recursive: true });
  await fs.writeFile(normalizedPath, await zip.generateAsync({ type: 'nodebuffer' }));

  return {
    outline,
    blocks,
    fields,
    warnings,
    normalizedHeadingCount,
  };
}

function createTemplateScanSummary(scanResult, status = 'loaded', message = '') {
  return {
    status,
    message,
    scannedAt: nowIso(),
    normalizedAt: nowIso(),
    outlineCount: Math.max(0, scanResult.outline.length - 1),
    blockCount: scanResult.blocks.length,
    fieldCount: scanResult.fields.length,
    warningCount: scanResult.warnings.length,
    normalizedHeadingCount: scanResult.normalizedHeadingCount,
    warnings: scanResult.warnings,
  };
}

function toAssetRelativePath(app, filePath) {
  const baseDir = path.resolve(getProcurementDir(app));
  const resolved = path.resolve(filePath);
  if (resolved !== baseDir && !resolved.startsWith(`${baseDir}${path.sep}`)) return '';
  return path.relative(baseDir, resolved).split(path.sep).map(encodeURIComponent).join('/');
}

function createProcurementAssetUrl(app, filePath) {
  const relativePath = toAssetRelativePath(app, filePath);
  return relativePath ? `yibiao-asset://procurement-agent/${relativePath}` : '';
}

function resolveSofficePath() {
  const candidates = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    'soffice',
    'libreoffice',
  ];
  return candidates.find((candidate) => candidate === 'soffice' || candidate === 'libreoffice' || fsSync.existsSync(candidate)) || '';
}

async function convertDocxToPdf(docxPath, outputDir) {
  const sofficePath = resolveSofficePath();
  if (!sofficePath) {
    return { success: false, message: '未找到 LibreOffice，跳过 PDF 预览生成' };
  }

  await fs.mkdir(outputDir, { recursive: true });
  const profileDir = path.join(outputDir, 'lo-profile');
  await fs.mkdir(profileDir, { recursive: true });
  const pdfPath = path.join(outputDir, `${path.basename(docxPath, path.extname(docxPath))}.pdf`);
  const args = [
    '--headless',
    '--norestore',
    '--nodefault',
    '--nolockcheck',
    `-env:UserInstallation=${pathToFileURL(profileDir).toString()}`,
    '--convert-to',
    'pdf',
    '--outdir',
    outputDir,
    docxPath,
  ];

  try {
    await execFileAsync(sofficePath, args, { windowsHide: true, timeout: 90000 });
    await fs.access(pdfPath);
    return { success: true, path: pdfPath, message: 'PDF 预览已生成' };
  } catch (error) {
    return { success: false, message: error?.message || 'PDF 预览生成失败' };
  }
}

async function resolvePyMuPDFPythonPath() {
  const candidates = [
    process.env.YIBIAO_PYTHON || '',
    path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe'),
    'python',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !fsSync.existsSync(candidate)) continue;
    try {
      await execFileAsync(candidate, ['-c', 'import fitz'], { windowsHide: true, timeout: 5000 });
      return candidate;
    } catch {
      // Try the next Python candidate.
    }
  }
  return '';
}

async function renderPdfToPageImages(pdfPath, outputDir) {
  if (!pdfPath) {
    return { success: false, message: '没有 PDF 文件，无法生成图片预览', pages: [] };
  }

  const pythonPath = await resolvePyMuPDFPythonPath();
  if (!pythonPath) {
    return { success: false, message: '未找到可用的 PyMuPDF Python 环境，跳过图片预览生成', pages: [] };
  }

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  const script = [
    'import fitz, json, os, sys',
    'pdf_path, out_dir, zoom = sys.argv[1], sys.argv[2], float(sys.argv[3])',
    'os.makedirs(out_dir, exist_ok=True)',
    'doc = fitz.open(pdf_path)',
    'pages = []',
    'matrix = fitz.Matrix(zoom, zoom)',
    'for index, page in enumerate(doc):',
    '    pix = page.get_pixmap(matrix=matrix, alpha=False)',
    '    name = f"page-{index + 1:03d}.png"',
    '    out_path = os.path.join(out_dir, name)',
    '    pix.save(out_path)',
    '    pages.append({"page": index + 1, "width": pix.width, "height": pix.height, "path": out_path})',
    'print(json.dumps({"pageCount": len(doc), "pages": pages}, ensure_ascii=False))',
  ].join('\n');

  try {
    const { stdout } = await execFileAsync(
      pythonPath,
      ['-c', script, pdfPath, outputDir, '1.6'],
      { windowsHide: true, timeout: 240000, maxBuffer: 1024 * 1024 * 8 },
    );
    const jsonLine = stdout.trim().split(/\r?\n/).filter(Boolean).pop() || '{}';
    const result = JSON.parse(jsonLine);
    return {
      success: true,
      message: `图片预览已生成：${result.pages?.length || 0} 页`,
      pages: Array.isArray(result.pages) ? result.pages : [],
    };
  } catch (error) {
    return { success: false, message: error?.message || 'PDF 图片预览生成失败', pages: [] };
  }
}

function cleanExtractedValue(value) {
  return normalizeString(value)
    .replace(/^[|:：\s]+/, '')
    .replace(/[|，,。；;]+$/, '')
    .trim();
}

function findValueByPatterns(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      return cleanExtractedValue(match[1]);
    }
  }
  return '';
}

function heuristicFields(markdown) {
  const text = String(markdown || '').replace(/\r/g, '\n');
  return {
    project_name: findValueByPatterns(text, [
      /项目名称[：:\s|]+([^\n|]{2,100})/,
      /工程名称[：:\s|]+([^\n|]{2,100})/,
    ]),
    project_code: findValueByPatterns(text, [
      /项目编号[：:\s|]+([A-Za-z0-9_\-（）()第号【】\s]{3,100})/,
      /采购编号[：:\s|]+([A-Za-z0-9_\-（）()第号【】\s]{3,100})/,
    ]),
    purchaser: findValueByPatterns(text, [
      /采购人[：:\s|]+([^\n|]{2,100})/,
      /发包人[：:\s|]+([^\n|]{2,100})/,
    ]),
    agency: findValueByPatterns(text, [
      /采购代理机构[：:\s|]+([^\n|]{2,100})/,
      /代理机构[：:\s|]+([^\n|]{2,100})/,
    ]),
    procurement_type: /施工|工程|建设|维修|改造/.test(text) ? '工程类' : '',
    procurement_method: /询比采购/.test(text) ? '询比采购' : '',
    max_price: findValueByPatterns(text, [
      /最高限价[：:\s|]+([^\n|]{2,100})/,
      /控制价[：:\s|]+([^\n|]{2,100})/,
      /采购限价[：:\s|]+([^\n|]{2,100})/,
    ]),
    budget_amount: findValueByPatterns(text, [
      /预算金额[：:\s|]+([^\n|]{2,100})/,
      /采购预算[：:\s|]+([^\n|]{2,100})/,
    ]),
    bid_security: findValueByPatterns(text, [
      /询比保证金[：:\s|]+([^\n|]{2,160})/,
      /投标保证金[：:\s|]+([^\n|]{2,160})/,
      /保证金[：:\s|]+([^\n|]{2,160})/,
    ]),
    contract_period: findValueByPatterns(text, [
      /计划工期[：:\s|]+([^\n|]{2,100})/,
      /工期[：:\s|]+([^\n|]{2,100})/,
      /服务期[：:\s|]+([^\n|]{2,100})/,
      /合同履行期限[：:\s|]+([^\n|]{2,100})/,
    ]),
    project_scope: findValueByPatterns(text, [
      /采购范围[：:\s|]+([^\n]{2,300})/,
      /建设内容[：:\s|]+([^\n]{2,300})/,
      /项目概况[：:\s|]+([^\n]{2,300})/,
    ]),
    qualification_requirements: findValueByPatterns(text, [
      /供应商资格要求[：:\s|]+([^\n]{2,400})/,
      /供应商资格条件[：:\s|]+([^\n]{2,400})/,
      /资格要求[：:\s|]+([^\n]{2,400})/,
    ]),
    evaluation_method: findValueByPatterns(text, [
      /评审办法[：:\s|]+([^\n|]{2,100})/,
      /(经评审的最低投标价法|最低投标价法|综合评估法)/,
    ]),
    response_deadline: findValueByPatterns(text, [
      /响应文件(?:递交|提交)?截止时间[：:\s|]+([^\n|]{2,120})/,
      /递交截止时间[：:\s|]+([^\n|]{2,120})/,
      /提交截止时间[：:\s|]+([^\n|]{2,120})/,
      /开启时间[：:\s|]+([^\n|]{2,120})/,
    ]),
    response_submission_location: findValueByPatterns(text, [
      /递交地点[：:\s|]+([^\n|]{2,140})/,
      /提交地点[：:\s|]+([^\n|]{2,140})/,
      /响应文件.*地点[：:\s|]+([^\n|]{2,140})/,
      /开启地点[：:\s|]+([^\n|]{2,140})/,
    ]),
    contact_person: findValueByPatterns(text, [
      /联系人[：:\s|]+([^\n|]{2,60})/,
    ]),
    contact_phone: findValueByPatterns(text, [
      /联系电话[：:\s|]+([0-9\-—\s]{5,60})/,
      /电话[：:\s|]+([0-9\-—\s]{5,60})/,
    ]),
    payment_terms: findValueByPatterns(text, [
      /付款方式[：:\s|]+([^\n]{2,300})/,
      /支付方式[：:\s|]+([^\n]{2,300})/,
      /付款条件[：:\s|]+([^\n]{2,300})/,
      /结算方式[：:\s|]+([^\n]{2,300})/,
    ]),
  };
}

function normalizeFieldKey(value) {
  const raw = normalizeString(value);
  return FIELD_KEY_ALIASES[raw] || FIELD_LABEL_TO_KEY[raw] || raw;
}

function indexAiFields(payload) {
  const fields = Array.isArray(payload?.fields) ? payload.fields : [];
  const byKey = new Map();
  fields.forEach((item) => {
    const key = normalizeFieldKey(item?.key || item?.id || item?.label || item?.field);
    if (key) byKey.set(key, item);
  });
  return byKey;
}

function indexAiAnswers(payload) {
  const answers = Array.isArray(payload?.answers) ? payload.answers : [];
  const byKey = new Map();
  answers.forEach((item) => {
    const key = normalizeFieldKey(item?.questionId || item?.question_id || item?.fieldKey || item?.key || item?.id || item?.label);
    if (key) byKey.set(key, item);
  });
  return byKey;
}

function normalizeSourceBlockIds(value, sourceBlocks) {
  const validIds = new Set(sourceBlocks.map((block) => block.id));
  const rawIds = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\s，、]+/)
      : [];
  return [...new Set(rawIds.map((item) => normalizeString(item)).filter((item) => validIds.has(item)))].slice(0, 4);
}

function findSourceBlockIdsForAnswer(question, source, sourceBlocks) {
  const directIds = normalizeSourceBlockIds(source.sourceBlockIds || source.source_block_ids || source.sourceBlockId || source.source_block_id, sourceBlocks);
  if (directIds.length) return directIds;

  const candidates = [
    source.sourceText,
    source.source_text,
    source.evidence,
    source.value,
    source.confirmedValue,
  ].map(normalizeLooseText).filter(Boolean);

  for (const candidate of candidates) {
    const matches = sourceBlocks.filter((block) => {
      const blockText = normalizeLooseText(block.text);
      return blockText.includes(candidate) || candidate.includes(blockText.slice(0, Math.min(80, blockText.length)));
    });
    if (matches.length) return matches.slice(0, 3).map((block) => block.id);
  }

  const labels = [question.label, question.targetText, question.chapter].map(normalizeLooseText).filter(Boolean);
  const labelMatches = sourceBlocks.filter((block) => {
    const blockText = normalizeLooseText(block.text);
    return labels.some((label) => label.length >= 2 && blockText.includes(label.slice(0, Math.min(8, label.length))));
  });
  return labelMatches.slice(0, 2).map((block) => block.id);
}

function createAnswer(question, source, sourceBlocks = []) {
  const value = cleanExtractedValue(source.confirmedValue ?? source.value);
  const confidence = value ? clampConfidence(source.confidence || 60) : 0;
  const risk = Boolean(question.risk || source.risk);
  const sourceBlockIds = findSourceBlockIdsForAnswer(question, source, sourceBlocks);
  const sourceText = normalizeString(source.sourceText || source.source_text || source.evidence);
  const sourceLocation = normalizeString(source.sourceLocation || source.source_location || source.location)
    || (sourceBlockIds.length ? sourceBlockIds.join(', ') : '');
  const requestedStatus = normalizeString(source.status);
  const status = VALID_FIELD_STATUSES.has(requestedStatus)
    ? requestedStatus
    : !value
      ? 'missing'
      : risk
        ? 'risk'
        : confidence >= 90
          ? 'confirmed'
          : 'pending';

  return {
    id: question.id,
    questionId: question.id,
    fieldKey: question.fieldKey,
    value,
    confirmedValue: cleanExtractedValue(source.confirmedValue ?? value),
    confidence,
    status,
    required: Boolean(question.required),
    risk,
    sourceBlockIds,
    sourceText,
    sourceLocation,
    updatedAt: normalizeString(source.updatedAt) || nowIso(),
  };
}

function createMissingAnswers(questions) {
  return questions.map((question) => createAnswer(question, {}, []));
}

function answersToFields(answers, questions) {
  const byQuestionId = new Map((answers || []).map((answer) => [answer.questionId || answer.id, answer]));
  return questions.map((question) => {
    const answer = byQuestionId.get(question.id) || createAnswer(question, {}, []);
    return {
      id: question.fieldKey,
      key: question.fieldKey,
      label: question.label,
      group: question.group,
      value: answer.value || '',
      confirmedValue: answer.confirmedValue || answer.value || '',
      confidence: clampConfidence(answer.confidence),
      status: VALID_FIELD_STATUSES.has(answer.status) ? answer.status : 'missing',
      required: Boolean(question.required),
      risk: Boolean(question.risk || answer.risk),
      sourceText: answer.sourceText || '',
      sourceLocation: answer.sourceLocation || (Array.isArray(answer.sourceBlockIds) ? answer.sourceBlockIds.join(', ') : ''),
      sourceBlockIds: Array.isArray(answer.sourceBlockIds) ? answer.sourceBlockIds : [],
      updatedAt: answer.updatedAt || nowIso(),
    };
  });
}

function fieldsToAnswers(fields, questions, sourceBlocks = []) {
  const byKey = new Map((fields || []).map((field) => [field.key || field.id, field]));
  return questions.map((question) => {
    const field = byKey.get(question.fieldKey) || {};
    return createAnswer(question, {
      value: field.value,
      confirmedValue: field.confirmedValue,
      confidence: field.confidence,
      status: field.status,
      risk: field.risk,
      sourceText: field.sourceText,
      sourceLocation: field.sourceLocation,
      sourceBlockIds: field.sourceBlockIds,
      updatedAt: field.updatedAt,
    }, sourceBlocks);
  });
}

function normalizeExistingAnswers(answers, questions, sourceBlocks) {
  const byQuestionId = new Map((answers || []).map((answer) => [answer.questionId || answer.id || answer.fieldKey, answer]));
  return questions.map((question) => {
    const answer = byQuestionId.get(question.id) || byQuestionId.get(question.fieldKey) || {};
    return createAnswer(question, answer, sourceBlocks);
  });
}

function normalizeExtractedAnswers(payload, markdown, sourceBlocks) {
  const aiAnswers = indexAiAnswers(payload);
  const aiFields = indexAiFields(payload);
  const heuristic = heuristicFields(markdown);
  const questions = createTemplateQuestions();

  return questions.map((question) => {
    const aiAnswer = aiAnswers.get(question.id) || aiFields.get(question.fieldKey) || {};
    const fallbackValue = heuristic[question.fieldKey] || '';
    const value = cleanExtractedValue(aiAnswer.value) || fallbackValue;
    return createAnswer(question, {
      ...aiAnswer,
      value,
      confidence: aiAnswer.confidence || (fallbackValue ? 72 : 0),
      sourceText: aiAnswer.sourceText || aiAnswer.source_text || aiAnswer.evidence || '',
      sourceLocation: aiAnswer.sourceLocation || aiAnswer.source_location || '',
      risk: question.risk || aiAnswer.risk,
    }, sourceBlocks);
  });
}

function ensureStateShape(state) {
  const empty = createEmptyState();
  const questions = createTemplateQuestions();
  const sourceBlocks = Array.isArray(state?.sourceBlocks) ? state.sourceBlocks : [];
  const answers = Array.isArray(state?.answers) && state.answers.length
    ? normalizeExistingAnswers(state.answers, questions, sourceBlocks)
    : fieldsToAnswers(Array.isArray(state?.fields) ? state.fields : [], questions, sourceBlocks);
  const fields = answersToFields(answers, questions);

  return {
    ...empty,
    ...(state || {}),
    task: {
      ...empty.task,
      ...(state?.task || {}),
    },
    documents: Array.isArray(state?.documents) ? state.documents : [],
    templateLibrary: dedupeTemplateLibrary(state?.templateLibrary, normalizeString(state?.activeTemplateId || '')).kept,
    activeTemplateId: normalizeString(state?.activeTemplateId || ''),
    templateOutline: Array.isArray(state?.templateOutline) ? state.templateOutline : [],
    templateBlocks: Array.isArray(state?.templateBlocks) ? state.templateBlocks : [],
    templateFields: Array.isArray(state?.templateFields) ? state.templateFields : [],
    templateTaskPack: {
      ...createEmptyTemplateTaskPack(state?.activeTemplateId || '', state?.task?.templateName || ''),
      ...(state?.templateTaskPack || {}),
      tasks: Array.isArray(state?.templateTaskPack?.tasks) ? state.templateTaskPack.tasks : [],
    },
    templateScan: {
      ...empty.templateScan,
      ...(state?.templateScan || {}),
    },
    questions,
    sourceBlocks,
    answers,
    fields: fields.length ? fields : createMissingFields(),
    extraction: {
      ...empty.extraction,
      ...(state?.extraction || {}),
    },
    markdownPreview: String(state?.markdownPreview || ''),
    logs: Array.isArray(state?.logs) ? state.logs : [],
  };
}

function computeExtractionSummary(fields, status = 'extracted', message = '') {
  const missingCount = fields.filter((field) => field.required && !normalizeString(field.confirmedValue)).length;
  const riskCount = fields.filter((field) => field.status === 'risk').length;
  const pendingCount = fields.filter((field) => field.status === 'pending').length;
  return {
    status,
    message,
    extractedAt: status === 'extracted' ? nowIso() : '',
    fieldCount: fields.filter((field) => normalizeString(field.value || field.confirmedValue)).length,
    missingCount,
    riskCount,
    pendingCount,
  };
}

function buildExtractionMessages(markdown, task, sourceBlocks) {
  const questions = createTemplateQuestions().map((question) => ({
    questionId: question.id,
    label: question.label,
    chapter: question.chapter,
    type: question.type,
    required: question.required,
    risk: question.risk,
    options: question.options || [],
    targetText: question.targetText,
  }));
  const evidencePack = createEvidencePack(markdown, sourceBlocks);

  return [
    {
      role: 'system',
      content: [
        '你是工程类询比采购文件编制助手。',
        '你的任务不是整篇生成，而是把采购需求方案当作证据材料，为询比采购模板中的填空题和选择题作答。',
        '只能返回 JSON，不要输出 Markdown、解释或额外文本。',
        '不要编造未出现的信息。找不到答案时 value 为空字符串，confidence 为 0。',
        'sourceBlockIds 必须使用证据材料中出现的 src_xxx 编号。',
        '金额、时间、资格条件、评审办法属于高风险信息，必须保留 sourceText 作为依据。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `任务基础信息：\n${JSON.stringify(task || {}, null, 2)}\n\n模板题目清单：\n${JSON.stringify(questions, null, 2)}`,
    },
    {
      role: 'user',
      content: [
        '请从下列采购需求方案证据块中回答模板题目，返回结构如下：',
        '{"answers":[{"questionId":"project_name","value":"","confidence":0,"sourceBlockIds":["src_001"],"sourceText":"","sourceLocation":"","risk":false}],"summary":""}',
        '',
        '采购需求方案证据块：',
        evidencePack,
      ].join('\n'),
    },
  ];
}

function normalizeTaskPayload(payload) {
  const source = payload || {};
  return {
    projectName: normalizeString(source.projectName),
    projectCode: normalizeString(source.projectCode),
    procurementType: normalizeString(source.procurementType) || DEFAULT_TASK.procurementType,
    procurementMethod: normalizeString(source.procurementMethod) || DEFAULT_TASK.procurementMethod,
    reviewMethod: normalizeString(source.reviewMethod) || DEFAULT_TASK.reviewMethod,
    templateName: normalizeString(source.templateName) || DEFAULT_TASK.templateName,
    owner: normalizeString(source.owner),
  };
}

function applyTaskFromFields(task, fields) {
  const byKey = Object.fromEntries(fields.map((field) => [field.key, field.confirmedValue || field.value || '']));
  return {
    ...task,
    projectName: task.projectName || byKey.project_name || '',
    projectCode: task.projectCode || byKey.project_code || '',
    procurementType: byKey.procurement_type || task.procurementType || DEFAULT_TASK.procurementType,
    procurementMethod: byKey.procurement_method || task.procurementMethod || DEFAULT_TASK.procurementMethod,
    reviewMethod: byKey.evaluation_method || task.reviewMethod || DEFAULT_TASK.reviewMethod,
  };
}

function createProcurementAgentService({ app, configStore, aiService }) {
  async function persist(state) {
    const nextState = ensureStateShape({
      ...state,
      task: {
        ...state.task,
        updatedAt: nowIso(),
      },
    });
    await writeJsonFile(getStatePath(app), nextState);
    return nextState;
  }

  async function readDemandMarkdown() {
    try {
      return await fs.readFile(getMarkdownPath(app), 'utf-8');
    } catch {
      return '';
    }
  }

  async function loadState() {
    try {
      const rawState = await readJsonFile(getStatePath(app));
      const dedupedLibrary = dedupeTemplateLibrary(rawState?.templateLibrary, normalizeString(rawState?.activeTemplateId || ''));
      const state = ensureStateShape({
        ...rawState,
        templateLibrary: dedupedLibrary.kept,
      });
      if (dedupedLibrary.removed.length) {
        await Promise.allSettled(dedupedLibrary.removed.map((template) => removeStoredTemplate(app, template)));
        return persist(addLog(state, `已清理 ${dedupedLibrary.removed.length} 个重复模板记录`));
      }
      const activeTemplate = state.templateLibrary.find((template) => template.id === state.activeTemplateId);
      if (activeTemplate && (!state.templateTaskPack.tasks.length || state.templateTaskPack.schemaVersion !== TEMPLATE_TASK_SCHEMA_VERSION)) {
        const taskPack = await readTemplateTaskPack(app, activeTemplate);
        if (taskPack.tasks.length && taskPack.schemaVersion === TEMPLATE_TASK_SCHEMA_VERSION) {
          return persist({
            ...state,
            templateTaskPack: taskPack,
          });
        }
        const sourcePath = activeTemplate.storedPath || activeTemplate.normalizedPath;
        const normalizedPath = activeTemplate.normalizedPath || sourcePath;
        if (sourcePath) {
          const scanResult = await scanAndNormalizeTemplateDocx(sourcePath, normalizedPath, activeTemplate.id, activeTemplate.fileName);
          const generatedTaskPack = await saveTemplateTaskPack(app, buildTemplateTaskPack({
            templateId: activeTemplate.id,
            templateName: activeTemplate.name,
            fields: scanResult.fields,
            outline: scanResult.outline,
          }));
          return persist({
            ...state,
            templateOutline: scanResult.outline,
            templateBlocks: scanResult.blocks,
            templateFields: scanResult.fields,
            templateTaskPack: generatedTaskPack,
          });
        }
      }
      if (!state.sourceBlocks.length && state.documents.some((document) => document.role === 'demand')) {
        const markdown = await readDemandMarkdown();
        if (markdown.trim()) {
          return persist({
            ...state,
            sourceBlocks: createSourceBlocks(markdown),
            markdownPreview: summarizeMarkdown(markdown),
          });
        }
      }
      return state;
    } catch (error) {
      if (error?.code && error.code !== 'ENOENT') {
        throw error;
      }

      const state = createEmptyState();
      try {
        await persist(state);
      } catch (persistError) {
        if (persistError?.code !== 'ENOENT') {
          throw persistError;
        }
        return loadState();
      }
      return state;
    }
  }

  async function saveTask(payload) {
    const state = await loadState();
    const nextState = addLog({
      ...state,
      task: {
        ...state.task,
        ...normalizeTaskPayload(payload),
        status: state.documents.length ? state.task.status : 'draft',
      },
    }, '任务基础信息已保存');
    return persist(nextState);
  }

  async function importTemplateDocument(payload = {}) {
    let filePath = normalizeString(payload?.filePath);
    if (!filePath) {
      const result = await dialog.showOpenDialog({
        title: '选择询比采购文件模板',
        properties: ['openFile'],
        filters: [
          { name: '询比采购文件模板', extensions: ['docx'] },
          { name: 'Word 文件', extensions: ['docx', 'doc'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: '已取消选择', state: await loadState() };
      }
      filePath = result.filePaths[0];
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.docx') {
      return {
        success: false,
        message: '当前模板库先支持 .docx 模板，请转换后再导入',
        state: await loadState(),
      };
    }

    try {
      await fs.access(filePath);
    } catch {
      return {
        success: false,
        message: `模板文件不存在：${filePath}`,
        state: await loadState(),
      };
    }

    const current = await loadState();
    const templateId = createId('tpl');
    const fileName = path.basename(filePath);
    const stem = safeFileStem(fileName);
    const templateDir = path.join(getTemplateLibraryDir(app), templateId);
    const storedPath = path.join(templateDir, `${stem}.docx`);
    const normalizedPath = path.join(templateDir, `${stem}.normalized.docx`);

    await fs.mkdir(templateDir, { recursive: true });
    await fs.copyFile(filePath, storedPath);

    let scanResult;
    try {
      scanResult = await scanAndNormalizeTemplateDocx(storedPath, normalizedPath, templateId, fileName);
    } catch (error) {
      return {
        success: false,
        message: error?.message || '模板扫描失败',
        state: await loadState(),
      };
    }

    const previewDir = path.join(templateDir, 'preview');
    const pdfPreview = await convertDocxToPdf(normalizedPath, previewDir);
    const pageImagePreview = pdfPreview.success
      ? await renderPdfToPageImages(pdfPreview.path, path.join(templateDir, 'preview-pages'))
      : { success: false, message: 'PDF 预览未生成，跳过图片定位预览', pages: [] };
    const templateItem = {
      id: templateId,
      name: stem,
      fileName,
      originalPath: filePath,
      storedPath,
      normalizedPath,
      previewPdfPath: pdfPreview.success ? pdfPreview.path : '',
      previewPdfUrl: pdfPreview.success ? createProcurementAssetUrl(app, pdfPreview.path) : '',
      previewPageImages: pageImagePreview.pages.map((page) => ({
        page: page.page,
        width: page.width,
        height: page.height,
        path: page.path,
        url: createProcurementAssetUrl(app, page.path),
      })),
      importedAt: nowIso(),
      scannedAt: nowIso(),
      status: 'loaded',
      stats: {
        outlineCount: Math.max(0, scanResult.outline.length - 1),
        blockCount: scanResult.blocks.length,
        fieldCount: scanResult.fields.length,
        warningCount: scanResult.warnings.length,
        normalizedHeadingCount: scanResult.normalizedHeadingCount,
      },
    };
    const taskPack = await saveTemplateTaskPack(app, buildTemplateTaskPack({
      templateId,
      templateName: stem,
      fields: scanResult.fields,
      outline: scanResult.outline,
    }));
    const nextLibrary = dedupeTemplateLibrary([
      templateItem,
      ...current.templateLibrary.filter((item) => item.id !== templateId),
    ], templateId);
    await Promise.allSettled(nextLibrary.removed.map((template) => removeStoredTemplate(app, template)));

    const nextState = addLog({
      ...current,
      task: {
        ...current.task,
        templateName: stem,
        status: current.task.status === 'draft' ? 'template' : current.task.status,
      },
      templateLibrary: nextLibrary.kept.slice(0, 20),
      activeTemplateId: templateId,
      templateOutline: scanResult.outline,
      templateBlocks: scanResult.blocks,
      templateFields: scanResult.fields,
      templateTaskPack: taskPack,
      templateScan: {
        ...createTemplateScanSummary(
          scanResult,
          'loaded',
          `模板已扫描：${scanResult.outline.length - 1} 个大纲节点，${scanResult.fields.length} 个待填字段`,
        ),
        previewStatus: pdfPreview.success ? 'ready' : 'unavailable',
        previewMessage: pageImagePreview.success ? pageImagePreview.message : pdfPreview.message,
      },
    }, `已导入并扫描模板：${fileName}`);

    return {
      success: true,
      message: '模板导入并扫描完成',
      state: await persist(nextState),
    };
  }

  async function importDemandDocument() {
    const result = await dialog.showOpenDialog({
      title: '选择采购需求方案文件',
      properties: ['openFile'],
      filters: [
        { name: '采购需求方案', extensions: ['docx', 'doc', 'wps', 'pdf', 'txt', 'md', 'markdown'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: '已取消选择', state: await loadState() };
    }

    const filePath = result.filePaths[0];
    const config = configStore.load();
    let markdown = '';
    try {
      markdown = (await parseDocumentWithConfig(app, filePath, config, {
        assetScope: 'procurement-agent',
        preserveImages: false,
      })).trim();
    } catch (error) {
      return {
        success: false,
        message: error?.message || '文件解析失败',
        state: await loadState(),
      };
    }

    if (!markdown) {
      return {
        success: false,
        message: '未提取到有效文本，请检查文件内容',
        state: await loadState(),
      };
    }

    await fs.mkdir(getProcurementDir(app), { recursive: true });
    await fs.writeFile(getMarkdownPath(app), markdown, 'utf-8');

    const current = await loadState();
    const fileName = path.basename(filePath);
    const document = {
      id: createId('doc'),
      role: 'demand',
      label: '采购需求方案',
      fileName,
      filePath,
      parserLabel: '本地解析',
      markdownLength: markdown.length,
      importedAt: nowIso(),
      status: 'parsed',
    };
    const questions = createTemplateQuestions();
    const sourceBlocks = createSourceBlocks(markdown);
    const answers = createMissingAnswers(questions);
    const fields = answersToFields(answers, questions);
    const taskTitle = current.task.projectName || fileName.replace(/\.[^.]+$/, '');
    const nextState = addLog({
      ...current,
      task: {
        ...current.task,
        projectName: current.task.projectName || taskTitle,
        status: 'parsed',
      },
      documents: [
        document,
        ...current.documents.filter((item) => item.role !== 'demand'),
      ],
      questions,
      sourceBlocks,
      answers,
      fields,
      extraction: {
        status: 'parsed',
        message: `已解析 ${fileName}，拆分为 ${sourceBlocks.length} 个源文件证据块，可开始模板答题`,
        extractedAt: '',
        fieldCount: 0,
        missingCount: FIELD_DEFINITIONS.filter((field) => field.required).length,
        riskCount: 0,
        pendingCount: 0,
      },
      markdownPreview: summarizeMarkdown(markdown),
    }, `已上传并解析采购需求方案：${fileName}`);

    return {
      success: true,
      message: '采购需求方案解析完成',
      state: await persist(nextState),
    };
  }

  async function extractFields() {
    const markdown = await readDemandMarkdown();
    if (!markdown.trim()) {
      return {
        success: false,
        message: '请先上传并解析采购需求方案',
        state: await loadState(),
      };
    }

    const state = await loadState();
    const sourceBlocks = state.sourceBlocks.length ? state.sourceBlocks : createSourceBlocks(markdown);
    const runningState = await persist(addLog({
      ...state,
      sourceBlocks,
      extraction: {
        ...state.extraction,
        status: 'extracting',
        message: '正在调用本地 Gemma 为模板填空和选择题作答',
      },
    }, '开始调用本地 Gemma 抽取模板题目答案'));

    try {
      const payload = await aiService.requestJson({
        messages: buildExtractionMessages(markdown, runningState.task, sourceBlocks),
        temperature: 0.1,
        timeout_ms: 300000,
        schemaName: 'procurement_template_answers',
        progressLabel: '采购模板答题',
        failureMessage: '模型返回的采购模板答案 JSON 无效',
        logTitle: '采购模板答题',
      });
      const answers = normalizeExtractedAnswers(payload, markdown, sourceBlocks);
      const fields = answersToFields(answers, createTemplateQuestions());
      const nextTask = applyTaskFromFields(runningState.task, fields);
      const nextState = addLog({
        ...runningState,
        task: {
          ...nextTask,
          status: 'answers',
        },
        questions: createTemplateQuestions(),
        sourceBlocks,
        answers,
        fields,
        extraction: computeExtractionSummary(fields, 'extracted', '模板题目答题完成，请人工确认高风险和缺失项'),
        markdownPreview: summarizeMarkdown(markdown),
      }, '采购模板题目答题完成');
      return {
        success: true,
        message: '模板题目答题完成',
        state: await persist(nextState),
      };
    } catch (error) {
      const nextState = addLog({
        ...runningState,
        extraction: {
          ...runningState.extraction,
          status: 'error',
          message: error?.message || '模板题目答题失败',
        },
      }, `模板题目答题失败：${error?.message || '未知错误'}`);
      return {
        success: false,
        message: error?.message || '模板题目答题失败',
        state: await persist(nextState),
      };
    }
  }

  async function updateField(payload) {
    const state = await loadState();
    const questions = createTemplateQuestions();
    const fieldId = normalizeFieldKey(payload?.id || payload?.key || payload?.questionId);
    const value = cleanExtractedValue(payload?.confirmedValue ?? payload?.value);
    const status = VALID_FIELD_STATUSES.has(payload?.status)
      ? payload.status
      : value
        ? 'confirmed'
        : 'missing';
    const answers = state.answers.map((answer) => {
      if (![answer.questionId, answer.fieldKey, answer.id].includes(fieldId)) return answer;
      return {
        ...answer,
        confirmedValue: value,
        value: answer.value || value,
        status,
        updatedAt: nowIso(),
      };
    });
    const fields = answersToFields(answers, questions);
    const nextState = addLog({
      ...state,
      task: applyTaskFromFields(state.task, fields),
      answers,
      fields,
      extraction: {
        ...computeExtractionSummary(fields, state.extraction.status === 'idle' ? 'idle' : 'extracted', state.extraction.message),
        extractedAt: state.extraction.extractedAt,
      },
    }, `模板题目已更新：${fieldId}`);
    return persist(nextState);
  }

  async function acceptHighConfidence(threshold = 90) {
    const state = await loadState();
    const questions = createTemplateQuestions();
    const minConfidence = clampConfidence(threshold) || 90;
    const answers = state.answers.map((answer) => {
      if (!answer.confirmedValue || answer.risk || answer.status === 'missing') return answer;
      if (answer.confidence < minConfidence) return answer;
      return { ...answer, status: 'confirmed', updatedAt: nowIso() };
    });
    const fields = answersToFields(answers, questions);
    const nextState = addLog({
      ...state,
      answers,
      fields,
      extraction: {
        ...computeExtractionSummary(fields, state.extraction.status || 'extracted', state.extraction.message),
        extractedAt: state.extraction.extractedAt,
      },
    }, `已接受置信度不低于 ${minConfidence}% 的模板答案`);
    return persist(nextState);
  }

  async function readTemplatePdf(payload = {}) {
    const state = await loadState();
    const templateId = normalizeString(payload?.templateId) || state.activeTemplateId;
    const template = state.templateLibrary.find((item) => item.id === templateId)
      || state.templateLibrary.find((item) => item.id === state.activeTemplateId);
    if (!template?.previewPdfPath) {
      throw new Error('当前模板没有可读取的 PDF 预览文件');
    }

    const baseDir = path.resolve(getProcurementDir(app));
    const pdfPath = path.resolve(template.previewPdfPath);
    if (pdfPath !== baseDir && !pdfPath.startsWith(`${baseDir}${path.sep}`)) {
      throw new Error('PDF 预览文件不在采购智能体工作目录内');
    }

    const buffer = await fs.readFile(pdfPath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  async function selectTemplate(payload = {}) {
    const state = await loadState();
    const templateId = normalizeString(payload?.templateId);
    const template = state.templateLibrary.find((item) => item.id === templateId);
    if (!template) {
      throw new Error('未找到要查看的模板');
    }

    const sourcePath = template.storedPath || template.normalizedPath;
    const normalizedPath = template.normalizedPath || sourcePath;
    try {
      await fs.access(sourcePath);
    } catch {
      throw new Error(`模板文件不存在：${sourcePath}`);
    }

    const scanResult = await scanAndNormalizeTemplateDocx(sourcePath, normalizedPath, template.id, template.fileName);
    let taskPack = await readTemplateTaskPack(app, template);
    if (!taskPack.tasks.length || taskPack.schemaVersion !== TEMPLATE_TASK_SCHEMA_VERSION) {
      taskPack = await saveTemplateTaskPack(app, buildTemplateTaskPack({
        templateId: template.id,
        templateName: template.name,
        fields: scanResult.fields,
        outline: scanResult.outline,
      }));
    }
    const nextState = addLog({
      ...state,
      task: {
        ...state.task,
        templateName: template.name,
      },
      activeTemplateId: template.id,
      templateOutline: scanResult.outline,
      templateBlocks: scanResult.blocks,
      templateFields: scanResult.fields,
      templateTaskPack: taskPack,
      templateScan: {
        ...createTemplateScanSummary(
          scanResult,
          'loaded',
          `模板已加载：${scanResult.outline.length - 1} 个大纲节点，${scanResult.fields.length} 个待填字段`,
        ),
        previewStatus: template.previewPdfPath ? 'ready' : 'unavailable',
        previewMessage: template.previewPdfPath ? 'PDF 预览已就绪' : '当前模板没有 PDF 预览',
      },
    }, `已切换模板：${template.fileName}`);

    return persist(nextState);
  }

  async function deleteTemplate(payload = {}) {
    const state = await loadState();
    const templateId = normalizeString(payload?.templateId);
    const template = state.templateLibrary.find((item) => item.id === templateId);
    if (!template) {
      return { success: false, message: '未找到要删除的模板', state };
    }

    await removeStoredTemplate(app, template);

    const remainingTemplates = state.templateLibrary.filter((item) => item.id !== templateId);
    const nextActiveTemplate = remainingTemplates[0];
    let nextState = {
      ...state,
      templateLibrary: remainingTemplates,
      activeTemplateId: nextActiveTemplate?.id || '',
    };

    if (state.activeTemplateId === templateId) {
      nextState = {
        ...nextState,
        templateOutline: [],
        templateBlocks: [],
        templateFields: [],
        templateScan: {
          status: nextActiveTemplate ? 'idle' : 'idle',
          message: nextActiveTemplate ? '请选择模板查看详情' : '请先上传询比采购文件模板',
          scannedAt: '',
          normalizedAt: '',
          outlineCount: 0,
          blockCount: 0,
          fieldCount: 0,
          warningCount: 0,
          normalizedHeadingCount: 0,
          warnings: [],
        },
      };
    }

    const persisted = await persist(addLog(nextState, `已删除模板：${template.fileName}`));
    return {
      success: true,
      message: '模板已删除',
      state: persisted,
    };
  }

  async function clear() {
    await fs.rm(getProcurementDir(app), { recursive: true, force: true });
    const state = createEmptyState();
    return persist(state);
  }

  return {
    loadState,
    saveTask,
    importTemplateDocument,
    importDemandDocument,
    extractFields,
    updateField,
    acceptHighConfidence,
    readTemplatePdf,
    selectTemplate,
    deleteTemplate,
    clear,
  };
}

module.exports = {
  createProcurementAgentService,
};
