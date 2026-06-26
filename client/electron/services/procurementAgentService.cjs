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
const { PDFParse } = require('pdf-parse');
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

function isCurrentTemplateTaskSchema(schemaVersion) {
  const value = normalizeString(schemaVersion);
  return value === TEMPLATE_TASK_SCHEMA_VERSION || value === `${TEMPLATE_TASK_SCHEMA_VERSION}-ai`;
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

async function readTemplatePageTaskPack(app, template) {
  const templateId = normalizeString(template?.id || '');
  const templateName = normalizeString(template?.name || '');
  if (!templateId) {
    return {
      templateId: '',
      templateName,
      pageCount: 0,
      generatedAt: '',
      pages: [],
    };
  }

  const packDir = getTemplateTaskPackDir(app, templateId);
  const pageTaskDir = getTemplatePageTaskDir(app, templateId);
  try {
    const manifest = await readJsonFile(path.join(packDir, 'page-manifest.json'));
    const pageFiles = Array.isArray(manifest.pages)
      ? manifest.pages.map((page) => page.fileName).filter(Boolean)
      : [];
    const files = pageFiles.length
      ? pageFiles
      : (await fs.readdir(pageTaskDir)).filter((fileName) => /^page-\d{3}\.json$/i.test(fileName)).sort();
    const pages = [];
    for (const fileName of files) {
      try {
        pages.push(await readJsonFile(path.join(pageTaskDir, fileName)));
      } catch {
        // 单页任务文件损坏或缺失时跳过，前端仍可展示其他页。
      }
    }
    return {
      templateId,
      templateName: manifest.templateName || templateName,
      pageCount: Number(manifest.pageCount || pages.length) || pages.length,
      generatedAt: manifest.generatedAt || '',
      pages: pages.sort((first, second) => Number(first.page || 0) - Number(second.page || 0)),
    };
  } catch {
    return {
      templateId,
      templateName,
      pageCount: 0,
      generatedAt: '',
      pages: [],
    };
  }
}

async function saveTemplatePageTaskPack(app, pageTaskPack) {
  const templateId = normalizeString(pageTaskPack?.templateId || '');
  const templateName = normalizeString(pageTaskPack?.templateName || '');
  const pages = Array.isArray(pageTaskPack?.pages) ? pageTaskPack.pages : [];
  if (!templateId) {
    return {
      templateId: '',
      templateName,
      pageCount: 0,
      generatedAt: '',
      pages: [],
    };
  }

  const packDir = getTemplateTaskPackDir(app, templateId);
  const pageTaskDir = getTemplatePageTaskDir(app, templateId);
  await fs.mkdir(pageTaskDir, { recursive: true });
  const generatedAt = pageTaskPack.generatedAt || nowIso();
  const sortedPages = [...pages].sort((first, second) => Number(first.page || 0) - Number(second.page || 0));

  await Promise.all(sortedPages.map((page) => {
    const pageNumber = Math.max(1, Number(page.page || 1));
    return writeJsonFile(path.join(pageTaskDir, `page-${String(pageNumber).padStart(3, '0')}.json`), page);
  }));

  const manifest = {
    templateId,
    templateName,
    pageCount: Number(pageTaskPack.pageCount || sortedPages.length) || sortedPages.length,
    generatedAt,
    mode: pageTaskPack.mode || 'ai-page-task-semantic',
    promptVersion: pageTaskPack.promptVersion || 'page-task-v1',
    pages: sortedPages.map((page) => ({
      page: page.page,
      pageTitle: page.pageTitle || `第 ${page.page} 页`,
      fileName: `page-${String(page.page).padStart(3, '0')}.json`,
      taskCount: Array.isArray(page.tasks) ? page.tasks.length : 0,
      noTaskReason: page.noTaskReason || '',
    })),
  };
  await writeJsonFile(path.join(packDir, 'page-manifest.json'), manifest);

  return {
    templateId,
    templateName,
    pageCount: manifest.pageCount,
    generatedAt,
    pages: sortedPages,
  };
}

function createTemplateQuestions(sourceTasks = []) {
  const tasks = Array.isArray(sourceTasks) ? sourceTasks.filter((task) => task?.key) : [];
  if (tasks.length) {
    return tasks
      .map((task, index) => ({
        id: task.key,
        fieldKey: task.key,
        label: task.label || task.key,
        group: task.group || '模板任务',
        chapter: task.chapter || '未归类章节',
        type: task.type || 'blank',
        inputKind: task.inputKind || inferInputKind(task.type || 'blank'),
        required: Boolean(task.required),
        risk: Boolean(task.risk),
        order: Number(task.order || (index + 1) * 10),
        options: Array.isArray(task.options) ? task.options : [],
        targetText: task.prompt || task.label || task.key,
        placeholder: task.placeholder || task.label || task.key,
      }))
      .sort((first, second) => Number(first.order || 0) - Number(second.order || 0));
  }

  return TEMPLATE_FIELD_RULES.map((rule, index) => ({
    id: rule.key,
    fieldKey: rule.key,
    label: rule.label || rule.key,
    group: inferTaskGroup(rule, ''),
    chapter: '未加载模板',
    type: rule.type || 'blank',
    inputKind: inferInputKind(rule.type || 'blank'),
    required: Boolean(rule.required),
    risk: Boolean(rule.risk),
    order: TEMPLATE_TASK_ORDER.get(rule.key) || (index + 1) * 10,
    options: Array.isArray(rule.options) ? rule.options : [],
    targetText: createTaskPrompt(rule),
    placeholder: rule.label || rule.key,
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
  const questions = createTemplateQuestions();
  return answersToFields(createMissingAnswers(questions), questions);
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

function getTemplatePageTaskDir(app, templateId) {
  return path.join(getTemplateTaskPackDir(app, templateId), 'page-tasks');
}

function getTemplateFillPackPath(app, templateId) {
  return path.join(getTemplateTaskPackDir(app, templateId), 'page-task-fill-pack.json');
}

function getTemplateFillRunDir(app, templateId, runId) {
  return path.join(getTemplateTaskPackDir(app, templateId), 'fill-runs', safeFileStem(runId).replace(/\s+/g, '-'));
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

function createStateQuestions(state) {
  return createTemplateQuestions(state?.templateTaskPack?.tasks);
}

function normalizeExtractedAnswers(payload, markdown, sourceBlocks, questions = createTemplateQuestions()) {
  const aiAnswers = indexAiAnswers(payload);
  const aiFields = indexAiFields(payload);
  const heuristic = heuristicFields(markdown);

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

const PAGE_TASK_FILL_RESULT_STATUSES = new Set(['filled', 'review', 'missing', 'error']);
const PAGE_TASK_FILL_RESULT_SOURCES = new Set(['ai', 'global-fact', 'postprocess']);
const PAGE_TASK_FILL_MISSING_KINDS = new Set(['not-in-demand', 'needs-human-policy', 'not-found']);
const PAGE_TASK_FILL_PROMPT_VERSION = 'page-task-fill-v2';
const PAGE_TASK_FILL_RISK_PATTERN = /金额|报价|限价|控制价|资格|资质|评分|付款|保证金|工期|人员|业绩|财务|低于成本|阈值|履约|联合体|评审|合同|税/;
const PAGE_TASK_FILL_SCORING_PATTERN = /评分|分值|权重|扣分|基准价|评审因素|报价评分|实施方案评分|其他因素|人员配备评分|综合评分/;
const PAGE_TASK_FILL_BLOCKED_PATTERN = /项目编号|采购编号|公告日期|封面日期|联系人|联系电话|联系邮箱|电子邮箱|异议受理|供应商名称|法定代表人|委托代理人|经营期限|开户|账号/;

function createDemandEvidencePackForPageTasks(sourceBlocks = []) {
  const blocks = (Array.isArray(sourceBlocks) ? sourceBlocks : []).slice(0, 120);
  let output = blocks.map((block) => [
    `[${block.id}] ${block.title || '需求片段'}（行 ${block.startLine || '-'}-${block.endLine || '-'}）`,
    block.text || block.preview || '',
  ].join('\n')).join('\n\n');
  if (output.length > 56000) {
    output = output.slice(0, 56000);
  }
  return output;
}

function createEvidenceBlockText(block, maxLength = 1800) {
  const text = normalizeString(block?.text || block?.preview || '');
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function sanitizeDemandFactValue(value) {
  return cleanExtractedValue(value)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactEvidenceBlock(block, maxLength = 1800) {
  return {
    id: block.id,
    title: block.title || block.heading || '需求片段',
    startLine: block.startLine || null,
    endLine: block.endLine || null,
    text: createEvidenceBlockText(block, maxLength),
  };
}

function findEvidenceLine(block, patterns = []) {
  const lines = String(block?.text || block?.preview || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => normalizeString(line))
    .filter(Boolean);
  for (const pattern of patterns) {
    const found = lines.find((line) => pattern.test(line));
    if (found) return found;
  }
  const fallback = normalizeString(block?.text || block?.preview || '');
  return fallback.length > 260 ? `${fallback.slice(0, 260)}...` : fallback;
}

function createGlobalFact(value, block, evidence, confidence = 90, extra = {}) {
  const cleanValue = sanitizeDemandFactValue(value);
  if (!cleanValue || !block?.id) return null;
  return {
    value: cleanValue,
    evidence: normalizeString(evidence) || findEvidenceLine(block, [new RegExp(escapeRegExp(cleanValue))]),
    sourceBlockIds: [block.id],
    confidence: clampConfidence(confidence),
    ...extra,
  };
}

function mergeGlobalFacts(value, facts, confidence = 88, extra = {}) {
  const usableFacts = facts.filter((fact) => fact?.value && Array.isArray(fact.sourceBlockIds));
  if (!value || !usableFacts.length) return null;
  const sourceBlockIds = [...new Set(usableFacts.flatMap((fact) => fact.sourceBlockIds || []))].slice(0, 6);
  const evidence = usableFacts.map((fact) => fact.evidence).filter(Boolean).join('；');
  return {
    value: sanitizeDemandFactValue(value),
    evidence,
    sourceBlockIds,
    confidence: clampConfidence(confidence),
    ...extra,
  };
}

function findFirstFact(sourceBlocks, patterns, transform = (match) => match?.[1] || match?.[0] || '') {
  for (const block of Array.isArray(sourceBlocks) ? sourceBlocks : []) {
    const text = String(block?.text || block?.preview || '');
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      const value = transform(match, block);
      if (match && value) {
        return createGlobalFact(value, block, findEvidenceLine(block, [pattern]));
      }
    }
  }
  return null;
}

function extractDemandGlobalFacts(sourceBlocks = [], markdown = '') {
  const blocks = Array.isArray(sourceBlocks) ? sourceBlocks : [];
  const fullText = String(markdown || blocks.map((block) => block.text || block.preview || '').join('\n'));
  const facts = {};

  facts.projectName = findFirstFact(blocks, [
    /^(.+?项目)实施阶段总体采购方案/m,
    /([\u4e00-\u9fa5A-Za-z0-9#（）()、\- 号]+?项目)位于/,
  ], (match) => match?.[1]?.replace(/["“”]/g, ''));

  facts.procurementObject = findFirstFact(blocks, [
    /劳务分包[：:]\s*([^，；。\n]+)，共\s*(\d+)\s*项/,
    /[（(]二[）)]\s*([^。\n]+劳务分包)/,
  ], (match) => match?.[1]);

  facts.location = findFirstFact(blocks, [
    /项目位于([^，。；\n]+)[，。；]/,
    /建设地点[：:]\s*([^。\n；]+)/,
  ]);

  facts.lotCount = findFirstFact(blocks, [
    /属一个施工总承包标段/,
    /劳务分包[：:][^，；。\n]+，共\s*(\d+)\s*项/,
  ], (match) => (match?.[1] ? match[1] : '1'));

  facts.constructionContent = findFirstFact(blocks, [
    /本项目总建筑面积约[^。]+。建设内容包括[:：]?([^。]+。?)/,
    /建设内容包括[:：]?([^。]+。?)/,
  ], (match, block) => {
    const line = findEvidenceLine(block, [/本项目总建筑面积约/, /建设内容包括/]);
    return line || match?.[1];
  });

  facts.procurementScope = findFirstFact(blocks, [
    /施工图设计范围内所涉及的([^。]+。?)/,
    /界面划分\s*([^。]+。?)/,
  ], (match) => match?.[0]?.replace(/^1\.?界面划分\s*/, ''));

  const technicalBlocks = blocks.filter((block) => {
    const text = `${block.title || ''}\n${block.text || block.preview || ''}`;
    if (/四、项目招标方案|专业分包|年度供应商|劳务分包[：:]/.test(text)) return false;
    return /2\.施工内容|3\.其他事项|4\.甲供材料及机具|甲供材料一类|甲供材料二类|甲供材料三类|甲供材料四类|甲供机具|除甲供材料、机具外/.test(text);
  });
  if (technicalBlocks.length) {
    const selected = technicalBlocks.slice(0, 4);
    facts.technicalRequirements = {
      value: sanitizeDemandFactValue(selected.map((block) => createEvidenceBlockText(block, 420)).join('\n')),
      evidence: selected.map((block) => findEvidenceLine(block, [/施工内容/, /其他事项/, /甲供材料/, /除甲供/])).filter(Boolean).join('；'),
      sourceBlockIds: selected.map((block) => block.id).filter(Boolean),
      confidence: 78,
    };
  }

  facts.taxMode = findFirstFact(blocks, [
    /采购控制价均为(不含税|含税)金额/,
    /控制价均为(不含税|含税)金额/,
  ]);

  facts.maxPrice = findFirstFact(blocks, [
    /采购控制价[：:]\s*([0-9]+(?:\.[0-9]+)?)\s*万元/,
    /最高限价[：:]\s*([0-9]+(?:\.[0-9]+)?\s*万元)/,
  ], (match) => (match?.[1] ? `${match[1].replace(/\s*万元$/, '')}万元` : ''));

  if (facts.maxPrice && facts.taxMode) {
    facts.maxPriceWithTax = mergeGlobalFacts(`${facts.maxPrice.value}：${facts.taxMode.value}`, [facts.maxPrice, facts.taxMode], 92);
    facts.maxPriceCompound = mergeGlobalFacts(`${facts.taxMode.value}：${facts.maxPrice.value}`, [facts.maxPrice, facts.taxMode], 92);
  }

  facts.duration = findFirstFact(blocks, [
    /工期[：:][^0-9\n]*(?:[^+。\n]*\+)?\s*(\d+)\s*个?日历天/,
    /(\d+)\s*个?日历天计算合同工期/,
  ], (match) => match?.[1]);

  const qualificationBlocks = blocks.filter((block) => /资质要求|施工劳务资质|安全生产许可证/.test(`${block.title || ''}\n${block.text || block.preview || ''}`));
  const qualificationText = qualificationBlocks.map((block) => block.text || block.preview || '').join('\n');
  if (/施工劳务资质|安全生产许可证/.test(qualificationText)) {
    const qualificationValue = [
      /施工劳务资质/.test(qualificationText) ? '具有行政主管部门颁发的施工劳务资质' : '',
      /安全生产许可证/.test(qualificationText) ? '具备有效的安全生产许可证' : '',
    ].filter(Boolean).join('；');
    facts.qualification = mergeGlobalFacts(qualificationValue, qualificationBlocks.map((block) => ({
      value: qualificationValue,
      evidence: findEvidenceLine(block, [/施工劳务资质/, /安全生产许可证/]),
      sourceBlockIds: [block.id],
      confidence: 88,
    })), 90);
    facts.qualificationCompound = facts.qualification
      ? { ...facts.qualification, value: `有资质要求、要求安全生产许可证：${facts.qualification.value}` }
      : null;
  }

  facts.performance = findFirstFact(blocks, [
    /业绩要求[：:]\s*([^。\n]+。?)/,
  ]);
  if (facts.performance) {
    facts.performanceCompound = {
      ...facts.performance,
      value: `有业绩要求、已完成：${facts.performance.value}`,
    };
  }

  facts.personnel = findFirstFact(blocks, [
    /人员要求[：:]\s*([^。\n]+(?:。|$))/,
  ]);
  if (facts.personnel) {
    facts.personnelCompound = {
      ...facts.personnel,
      value: `有人员要求：${facts.personnel.value}`,
    };
  }

  facts.reviewMethod = findFirstFact(blocks, [
    /招采方式[：:][^（(]*(?:[（(])([^）)]+法)[）)]/,
    /(综合评估法|经评审的最低投标价法|最低投标价法)/,
  ]);

  const lowCostBlock = blocks.find((block) => /低于成本评审条件/.test(block.text || block.preview || ''));
  if (lowCostBlock) {
    const lowCostText = lowCostBlock.text || lowCostBlock.preview || '';
    const highestMatch = /最高限价相应价格的\s*(\d+(?:\.\d+)?)\s*%/.exec(lowCostText);
    const averageMatch = /算术平均值的\s*(\d+(?:\.\d+)?)\s*%/.exec(lowCostText);
    if (highestMatch || averageMatch) {
      facts.lowCostThresholds = {
        value: [highestMatch?.[1] ? `最高限价比例${highestMatch[1]}%` : '', averageMatch?.[1] ? `平均价比例${averageMatch[1]}%` : ''].filter(Boolean).join('；'),
        highestPriceRatio: highestMatch?.[1] || '',
        averagePriceRatio: averageMatch?.[1] || '',
        evidence: findEvidenceLine(lowCostBlock, [/低于成本评审条件/]),
        sourceBlockIds: [lowCostBlock.id],
        confidence: 92,
      };
    }
  }

  facts.paymentTerms = findFirstFact(blocks, [
    /11\.付款方式\s*([\s\S]+)/,
    /付款方式\s*([\s\S]+)/,
  ], (match, block) => {
    const text = normalizeString(block.text || block.preview || '');
    return text.replace(/^11\.付款方式\s*/, '').replace(/^付款方式\s*/, '');
  });

  facts.scoringDetails = /报价评分|评分权重|评分分值|综合评分明细|扣分值/.test(fullText)
    ? findFirstFact(blocks, [/报价评分|评分权重|评分分值|综合评分明细|扣分值/])
    : null;

  Object.keys(facts).forEach((key) => {
    if (!facts[key]?.value) delete facts[key];
  });
  return facts;
}

function summarizeGlobalFacts(globalFacts = {}) {
  return Object.fromEntries(Object.entries(globalFacts)
    .filter(([, fact]) => fact?.value)
    .map(([key, fact]) => [key, {
      value: fact.value,
      sourceBlockIds: fact.sourceBlockIds || [],
    }]));
}

function tokenizeTaskForEvidence(task) {
  const text = [
    task?.key,
    task?.label,
    task?.type,
    task?.inputKind,
    task?.group,
    task?.chapter,
    task?.prompt,
    task?.placeholder,
    ...(Array.isArray(task?.options) ? task.options : []),
    ...(Array.isArray(task?.anchors) ? task.anchors.flatMap((anchor) => [anchor?.matchText, anchor?.sourceText]) : []),
  ].map(normalizeString).filter(Boolean).join(' ');
  const keywords = new Set();
  const add = (values) => values.forEach((value) => {
    const item = normalizeString(value);
    if (item) keywords.add(item);
  });

  add(text.split(/[\s,，。；;：:、（）()【】\[\]""“”□]+/).filter((item) => item.length >= 2 && item.length <= 24));
  const synonymRules = [
    [/项目名称|采购项目名称|公告标题/, ['项目概况', '实施阶段总体采购方案', '项目位于']],
    [/采购对象|采购标的|标段划分|标段数量|标段/, ['劳务分包', '共1项', '施工总承包标段']],
    [/最高限价|控制价|金额|报价|税/, ['采购控制价', '不含税', '最高限价']],
    [/低于成本|阈值|平均价/, ['低于成本评审条件', '最高限价相应价格', '算术平均值']],
    [/评审方法|评审办法/, ['招采方式', '综合评估法', '经评审的最低投标价法']],
    [/建设地点|地点/, ['位于', '建设地点']],
    [/建设内容|规模|项目概况/, ['工程建设规模', '建设内容包括', '主要施工内容']],
    [/采购范围|实施内容|技术|服务要求|界面/, ['界面划分', '施工图设计范围', '施工内容', '其他事项']],
    [/工期|服务期/, ['工期', '日历天']],
    [/资质|资格|安全生产许可证/, ['资质要求', '施工劳务资质', '安全生产许可证']],
    [/业绩|类似项目/, ['业绩要求', '类似项目业绩', '合同金额']],
    [/人员|技术负责人|安全生产管理人员/, ['人员要求', '技术负责人', '安全生产管理人员']],
    [/付款|支付|结算|质保金|缺陷责任/, ['付款方式', '进度款', '结算款', '质保金']],
    [/图纸|清单/, ['施工图', '工程量清单', '采购控制价清单']],
  ];
  synonymRules.forEach(([pattern, values]) => {
    if (pattern.test(text)) add(values);
  });
  return [...keywords];
}

function scoreEvidenceBlockForTask(block, task, globalFacts = {}) {
  const blockText = `${block?.title || ''}\n${block?.heading || ''}\n${block?.text || block?.preview || ''}`;
  const normalizedBlock = normalizeLooseText(blockText);
  const keywords = tokenizeTaskForEvidence(task);
  let score = 0;
  keywords.forEach((keyword) => {
    const normalizedKeyword = normalizeLooseText(keyword);
    if (!normalizedKeyword) return;
    if (normalizedBlock.includes(normalizedKeyword)) score += Math.min(12, Math.max(2, normalizedKeyword.length));
  });
  Object.values(globalFacts).forEach((fact) => {
    if (!fact?.value || !Array.isArray(fact.sourceBlockIds)) return;
    if (fact.sourceBlockIds.includes(block.id)) score += 4;
  });
  if (Array.isArray(block.keywords) && block.keywords.length) {
    keywords.forEach((keyword) => {
      if (block.keywords.some((item) => normalizeLooseText(item).includes(normalizeLooseText(keyword)))) score += 2;
    });
  }
  return score;
}

function selectCandidateEvidenceForTask(task, sourceBlocks = [], globalFacts = {}, limit = 6) {
  const scored = (Array.isArray(sourceBlocks) ? sourceBlocks : [])
    .map((block) => ({ block, score: scoreEvidenceBlockForTask(block, task, globalFacts) }))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score || Number(first.block.order || 0) - Number(second.block.order || 0));

  const selected = new Map();
  scored.slice(0, limit).forEach((item) => selected.set(item.block.id, item.block));

  const taskText = `${task?.label || ''} ${task?.prompt || ''} ${task?.key || ''}`;
  const factHints = [];
  if (/项目名称|采购项目名称/.test(taskText) && globalFacts.projectName) factHints.push(globalFacts.projectName);
  if (/最高限价|控制价|金额|税/.test(taskText)) factHints.push(globalFacts.maxPrice, globalFacts.taxMode);
  if (/低于成本|阈值/.test(taskText)) factHints.push(globalFacts.lowCostThresholds);
  if (/评审方法|评审办法/.test(taskText)) factHints.push(globalFacts.reviewMethod);
  if (/建设地点|地点/.test(taskText)) factHints.push(globalFacts.location);
  if (/建设内容|规模|采购范围|实施内容|技术|服务要求/.test(taskText)) factHints.push(globalFacts.constructionContent, globalFacts.procurementScope, globalFacts.technicalRequirements);
  if (/工期|服务期/.test(taskText)) factHints.push(globalFacts.duration);
  if (/资质|资格/.test(taskText)) factHints.push(globalFacts.qualification);
  if (/业绩/.test(taskText)) factHints.push(globalFacts.performance);
  if (/人员/.test(taskText)) factHints.push(globalFacts.personnel);
  if (/付款|支付|结算/.test(taskText)) factHints.push(globalFacts.paymentTerms);
  if (/标段|采购对象|采购标的/.test(taskText)) factHints.push(globalFacts.procurementObject, globalFacts.lotCount);

  factHints.filter(Boolean).forEach((fact) => {
    (fact.sourceBlockIds || []).forEach((id) => {
      const block = sourceBlocks.find((item) => item.id === id);
      if (block) selected.set(block.id, block);
    });
  });

  return [...selected.values()]
    .sort((first, second) => Number(first.order || 0) - Number(second.order || 0))
    .slice(0, limit)
    .map((block) => compactEvidenceBlock(block));
}

function createTaskEvidenceMap(tasks = [], sourceBlocks = [], globalFacts = {}) {
  const map = {};
  (Array.isArray(tasks) ? tasks : []).forEach((task) => {
    map[task.key] = selectCandidateEvidenceForTask(task, sourceBlocks, globalFacts);
  });
  return map;
}

function createPageTaskFillMessages({ template, demandDocument, tasks, batchIndex, totalBatches, globalFacts = {}, taskEvidenceMap = {} }) {
  const schemaExample = {
    results: [
      {
        key: 'page_001_project_code',
        value: '项目编号或空字符串',
        status: 'filled',
        confidence: 88,
        evidence: '逐字摘录采购需求中的依据，找不到依据则为空',
        sourceBlockIds: ['src_001'],
        reason: '简短说明为什么这样填写，缺失时说明缺失原因',
        missingKind: '',
      },
    ],
  };

  const taskPayload = tasks.map((task) => ({
    key: task.key,
    label: task.label,
    type: task.type,
    inputKind: task.inputKind,
    required: Boolean(task.required),
    risk: Boolean(task.risk),
    group: task.group,
    chapter: task.chapter,
    page: task.page,
    pageTitle: task.pageTitle,
    prompt: task.prompt,
    placeholder: task.placeholder,
    options: Array.isArray(task.options) ? task.options : [],
    anchors: Array.isArray(task.anchors) ? task.anchors.map((anchor) => ({
      matchText: anchor.matchText,
      sourceText: anchor.sourceText,
      pageHint: anchor.pageHint,
    })) : [],
    candidateEvidenceBlocks: Array.isArray(taskEvidenceMap[task.key]) ? taskEvidenceMap[task.key] : [],
  }));

  return [
    {
      role: 'system',
      content: [
        `你是采购文件任务包填充员，提示词版本：${PAGE_TASK_FILL_PROMPT_VERSION}。`,
        '你的任务是根据采购需求方案证据，为页面任务生成填充值；不是改写模板，也不是整篇生成。',
        '只返回严格 JSON 对象，不要 Markdown，不要解释，不要代码块。',
        '必须逐项返回输入任务中的 key，不得遗漏，不得新增 key。',
        '优先使用“需求全局事实包”，再使用每个任务的 candidateEvidenceBlocks；不要使用模板原文当作需求依据。',
        '允许基于证据做稳定推导：采购控制价 -> 最高限价，招采方式 -> 评审方法，工程概况位置 -> 建设地点，工期 -> 计划工期，采购控制价均为不含税 -> 最高限价不含税。',
        '项目名称策略固定为“总项目名称”：优先使用需求全局事实包中的 projectName，不要自动拼接采购对象。',
        'blank：直接输出应填文本；number：只输出数字或数字+必要单位；calculated：输出依据规则得到的数字或比例。',
        'choice：value 必须严格等于 options 中一个选项文字，找不到依据时 missing。',
        'multiChoice：value 必须由 options 中多个选项用“、”连接，找不到依据时 missing。',
        'compound：value 使用“选项：补充内容”；多个选项用“、”连接；无补充内容则只写选项；选项必须来自 options。',
        '如果采购需求中没有依据，value 为空字符串，status 为 missing，confidence 为 0，并说明 reason。',
        '项目编号、联系人、电话、邮箱、公告日期、封面日期、供应商主体信息没有明确依据时禁止推导。',
        '评分细则、评分分值、评分权重、报价扣分方式等如果需求没有独立评分方案，必须 missing，missingKind=needs-human-policy，reason 写“采购需求未提供评分细则”。',
        '金额、资质、业绩、人员、付款、保证金、工期、低于成本阈值、评审方法等高风险字段即使找到答案也优先 status=review。',
        'status 只能是 filled、review、missing、error。',
        'confidence 是 0-100 的整数。',
        'evidence 必须摘录采购需求原文中的关键依据，不得写模板原文。',
        'sourceBlockIds 必须来自 candidateEvidenceBlocks 或需求全局事实包中的 src_xxx 编号；没有依据时为空数组。',
        'missingKind 只能是 not-in-demand、needs-human-policy、not-found 或空字符串。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `模板ID：${template.id}`,
        `模板名称：${template.name || template.fileName || ''}`,
        `需求文件：${demandDocument?.fileName || ''}`,
        `当前批次：${batchIndex}/${totalBatches}`,
        '',
        '需求全局事实包 JSON：',
        JSON.stringify(summarizeGlobalFacts(globalFacts), null, 2),
        '',
        '待填任务 JSON：',
        JSON.stringify(taskPayload, null, 2),
        '',
        '输出 JSON Schema 示例：',
        JSON.stringify(schemaExample, null, 2),
      ].join('\n'),
    },
  ];
}

function flattenPageTasksForFill(pageTaskPack) {
  return (Array.isArray(pageTaskPack?.pages) ? pageTaskPack.pages : []).flatMap((page) => (
    (Array.isArray(page.tasks) ? page.tasks : []).map((task) => ({
      ...task,
      page: Number(page.page || 0),
      pageTitle: normalizeString(page.pageTitle) || `第 ${page.page || 0} 页`,
    }))
  ));
}

function normalizePageTaskFillResult(raw, task, sourceBlocks) {
  const statusRaw = normalizeString(raw?.status);
  const value = cleanExtractedValue(raw?.value);
  const sourceBlockIds = normalizeSourceBlockIds(raw?.sourceBlockIds || raw?.source_block_ids || raw?.sourceBlockId || raw?.source_block_id, sourceBlocks);
  const filledByRaw = normalizeString(raw?.filledBy || raw?.filled_by);
  const missingKindRaw = normalizeString(raw?.missingKind || raw?.missing_kind);
  let status = PAGE_TASK_FILL_RESULT_STATUSES.has(statusRaw) ? statusRaw : '';
  if (!status) {
    status = value ? (task.risk ? 'review' : 'filled') : 'missing';
  }
  if (value && task.risk && status === 'filled') {
    status = 'review';
  }
  if (!value && status !== 'error') {
    status = 'missing';
  }
  const evidence = normalizeString(raw?.evidence || raw?.sourceText || raw?.source_text);
  return {
    key: task.key,
    label: task.label,
    page: Number(task.page || 0),
    pageTitle: normalizeString(task.pageTitle) || `第 ${task.page || 0} 页`,
    group: normalizeString(task.group) || '未分组',
    chapter: normalizeString(task.chapter) || '',
    type: normalizeString(task.type) || 'blank',
    required: Boolean(task.required),
    risk: Boolean(task.risk),
    status,
    value,
    evidence,
    sourceBlockIds,
    confidence: value ? clampConfidence(raw?.confidence || (sourceBlockIds.length ? 78 : 55)) : 0,
    reason: normalizeString(raw?.reason || raw?.note || raw?.message),
    filledBy: PAGE_TASK_FILL_RESULT_SOURCES.has(filledByRaw) ? filledByRaw : (value ? 'ai' : undefined),
    missingKind: PAGE_TASK_FILL_MISSING_KINDS.has(missingKindRaw) ? missingKindRaw : undefined,
    updatedAt: nowIso(),
  };
}

function normalizePageTaskFillPayload(payload, tasks, sourceBlocks) {
  const resultItems = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.tasks) ? payload.tasks : [];
  const byKey = new Map();
  resultItems.forEach((item) => {
    const key = normalizeFieldKey(item?.key || item?.id || item?.taskKey || item?.task_key);
    if (key) byKey.set(key, item);
  });
  return tasks.map((task) => normalizePageTaskFillResult(byKey.get(task.key) || {}, task, sourceBlocks));
}

function taskFillText(task) {
  return [
    task?.key,
    task?.label,
    task?.group,
    task?.chapter,
    task?.prompt,
    task?.placeholder,
    ...(Array.isArray(task?.options) ? task.options : []),
  ].map(normalizeString).filter(Boolean).join(' ');
}

function taskCoreText(task) {
  return [
    task?.key,
    task?.label,
    task?.prompt,
    task?.placeholder,
    ...(Array.isArray(task?.options) ? task.options : []),
    ...(Array.isArray(task?.anchors) ? task.anchors.flatMap((anchor) => [anchor?.matchText, anchor?.sourceText]) : []),
  ].map(normalizeString).filter(Boolean).join(' ');
}

function isTaskHighRisk(task) {
  return Boolean(task?.risk) || PAGE_TASK_FILL_RISK_PATTERN.test(taskFillText(task));
}

function isBlockedAutoFillTask(task) {
  return PAGE_TASK_FILL_BLOCKED_PATTERN.test(taskFillText(task));
}

function isScoringDetailTask(task) {
  const text = taskFillText(task);
  if (/评审方法|评审办法章节选择|低于成本/.test(text)) return false;
  return PAGE_TASK_FILL_SCORING_PATTERN.test(text);
}

function inferTaskFactCategory(task) {
  const text = taskCoreText(task);
  if (isBlockedAutoFillTask(task) || isScoringDetailTask(task)) return '';
  if (/项目名称|采购项目名称|公告标题/.test(text)) return 'projectName';
  if (/采购方式|招采方式/.test(text)) return 'procurementMethod';
  if (/采购对象|采购标的/.test(text)) return 'procurementObject';
  if (/标段划分|标段数量|标段号|标段/.test(text)) return 'lotCount';
  if (/低于成本|阈值|平均价比例/.test(text) && !/分钟|说明材料|提交时间/.test(text)) return 'lowCostThresholds';
  if (/评审方法|评审办法章节选择/.test(text)) return 'reviewMethod';
  if (/财务/.test(text)) return 'financialRequirement';
  if (/资质/.test(text)) return 'qualificationCompound';
  if (/业绩/.test(text)) return 'performanceCompound';
  if (/人员|技术负责人|安全生产管理人员/.test(text)) return 'personnelCompound';
  if (/一般资格|供应商资格要求|资格要求/.test(text)) return 'qualification';
  if (/采购范围|实施内容|界面划分/.test(text)) return 'procurementScope';
  if (/建设地点|履约地点|实施地点/.test(text)) return 'location';
  if (/建设内容|建设规模|项目概况/.test(text)) return 'constructionContent';
  if (/技术、服务要求|技术服务要求|技术要求|服务要求/.test(text)) return 'technicalRequirements';
  if (/工期|服务期|合同履行期限/.test(text)) return 'duration';
  if (/付款|支付|结算|质保金/.test(text)) return 'paymentTerms';
  if (/最高限价|控制价|限价明细|金额|报价.*税|含税|不含税/.test(text) && !/施工图|清单状态|另册/.test(text)) return 'maxPrice';
  return '';
}

function createFactForTask(task, globalFacts = {}) {
  const category = inferTaskFactCategory(task);
  const text = taskFillText(task);
  if (!category) return null;
  if (category === 'procurementMethod') {
    const reviewFact = globalFacts.reviewMethod;
    if (!reviewFact) return null;
    return {
      value: '询比采购',
      evidence: reviewFact.evidence,
      sourceBlockIds: reviewFact.sourceBlockIds || [],
      confidence: reviewFact.confidence || 88,
    };
  }
  if (category === 'maxPrice') {
    if (/compound|含税|不含税|限价明细|税/.test(`${task?.type || ''} ${text}`)) {
      return globalFacts.maxPriceCompound || globalFacts.maxPriceWithTax || globalFacts.maxPrice || null;
    }
    return globalFacts.maxPrice || null;
  }
  if (category === 'lowCostThresholds') {
    const fact = globalFacts.lowCostThresholds;
    if (!fact) return null;
    if (/平均价|算术平均/.test(text)) {
      return {
        value: fact.averagePriceRatio || '',
        evidence: fact.evidence,
        sourceBlockIds: fact.sourceBlockIds || [],
        confidence: fact.confidence || 90,
      };
    }
    if (/最高限价|阈值一|阈值二|比例/.test(text)) {
      return {
        value: fact.highestPriceRatio || '',
        evidence: fact.evidence,
        sourceBlockIds: fact.sourceBlockIds || [],
        confidence: fact.confidence || 90,
      };
    }
    return fact;
  }
  if (category === 'qualificationCompound') return globalFacts.qualificationCompound || globalFacts.qualification || null;
  if (category === 'performanceCompound') return globalFacts.performanceCompound || globalFacts.performance || null;
  if (category === 'personnelCompound') return globalFacts.personnelCompound || globalFacts.personnel || null;
  if (category === 'financialRequirement') return null;
  return globalFacts[category] || null;
}

function resultFromGlobalFact(task, fact, filledBy = 'global-fact', reason = '') {
  const value = cleanExtractedValue(fact?.value);
  if (!value) return null;
  const highRisk = isTaskHighRisk(task);
  return {
    key: task.key,
    label: task.label,
    page: Number(task.page || 0),
    pageTitle: normalizeString(task.pageTitle) || `第 ${task.page || 0} 页`,
    group: normalizeString(task.group) || '未分组',
    chapter: normalizeString(task.chapter) || '',
    type: normalizeString(task.type) || 'blank',
    required: Boolean(task.required),
    risk: Boolean(task.risk),
    status: highRisk ? 'review' : 'filled',
    value,
    evidence: normalizeString(fact.evidence),
    sourceBlockIds: Array.isArray(fact.sourceBlockIds) ? fact.sourceBlockIds : [],
    confidence: clampConfidence(fact.confidence || (highRisk ? 84 : 88)),
    reason: reason || '根据需求全局事实包补填，需结合模板位置核对。',
    filledBy,
    missingKind: undefined,
    updatedAt: nowIso(),
  };
}

function createMissingPolicyResult(result, task, missingKind, reason) {
  return {
    ...result,
    key: task.key,
    label: task.label,
    page: Number(task.page || result.page || 0),
    pageTitle: normalizeString(task.pageTitle || result.pageTitle) || `第 ${task.page || 0} 页`,
    group: normalizeString(task.group || result.group) || '未分组',
    chapter: normalizeString(task.chapter || result.chapter) || '',
    type: normalizeString(task.type || result.type) || 'blank',
    required: Boolean(task.required),
    risk: Boolean(task.risk),
    status: 'missing',
    value: '',
    evidence: '',
    sourceBlockIds: [],
    confidence: 0,
    reason,
    filledBy: undefined,
    missingKind,
    updatedAt: nowIso(),
  };
}

function postprocessPageTaskFillResults(results, tasks, globalFacts = {}, sourceBlocks = []) {
  const sourceIds = new Set((Array.isArray(sourceBlocks) ? sourceBlocks : []).map((block) => block.id));
  const taskByKey = new Map((Array.isArray(tasks) ? tasks : []).map((task) => [normalizeFieldKey(task.key), task]));
  const normalized = (Array.isArray(results) ? results : []).map((result) => {
    const task = taskByKey.get(normalizeFieldKey(result?.key)) || {};
    if (!task?.key) return result;
    if (isScoringDetailTask(task) && !globalFacts.scoringDetails?.value) {
      return createMissingPolicyResult(result, task, 'needs-human-policy', '采购需求未提供评分细则');
    }

    const fact = createFactForTask(task, globalFacts);
    const hasValue = Boolean(normalizeString(result?.value));
    const hasEvidence = Boolean(normalizeString(result?.evidence)) && Array.isArray(result.sourceBlockIds) && result.sourceBlockIds.some((id) => sourceIds.has(id));

    if (!hasValue && fact?.value) {
      return resultFromGlobalFact(task, fact, 'global-fact');
    }

    if (hasValue && isTaskHighRisk(task) && !hasEvidence) {
      if (fact?.value) {
        return resultFromGlobalFact(task, fact, 'global-fact', '模型给出了答案但证据不足，已改用需求全局事实包。');
      }
      return createMissingPolicyResult(result, task, 'not-found', '高风险字段缺少可追溯证据，已退回缺失待人工确认。');
    }

    if (!hasValue && result?.status !== 'error') {
      if (isBlockedAutoFillTask(task)) {
        return {
          ...result,
          reason: result.reason || '采购需求未提供该字段，禁止自动推导。',
          missingKind: result.missingKind || 'not-in-demand',
          updatedAt: nowIso(),
        };
      }
      return {
        ...result,
        reason: result.reason || '候选证据中未找到可填依据。',
        missingKind: result.missingKind || 'not-found',
        updatedAt: nowIso(),
      };
    }

    return {
      ...result,
      status: hasValue && isTaskHighRisk(task) && result.status === 'filled' ? 'review' : result.status,
      filledBy: hasValue ? (result.filledBy || 'ai') : result.filledBy,
      updatedAt: nowIso(),
    };
  });

  const byCategory = new Map();
  normalized.forEach((result) => {
    if (!normalizeString(result?.value)) return;
    const task = taskByKey.get(normalizeFieldKey(result.key));
    const category = inferTaskFactCategory(task);
    if (!category || category === 'financialRequirement') return;
    if (!byCategory.has(category)) {
      byCategory.set(category, result);
    }
  });

  return normalized.map((result) => {
    if (normalizeString(result?.value) || result?.status === 'error') return result;
    const task = taskByKey.get(normalizeFieldKey(result?.key));
    const category = inferTaskFactCategory(task);
    const source = category ? byCategory.get(category) : null;
    if (!task || !source?.value || isScoringDetailTask(task) || isBlockedAutoFillTask(task)) return result;
    const highRisk = isTaskHighRisk(task);
    return {
      ...result,
      status: highRisk ? 'review' : 'filled',
      value: source.value,
      evidence: source.evidence,
      sourceBlockIds: source.sourceBlockIds,
      confidence: Math.min(86, clampConfidence(source.confidence || 80)),
      reason: `与已填字段“${source.label || category}”语义一致，复用其已溯源结果。`,
      filledBy: 'postprocess',
      missingKind: undefined,
      updatedAt: nowIso(),
    };
  });
}

async function writeFillRunJson(runDir, fileName, value) {
  await writeJsonFile(path.join(runDir, fileName), value);
}

async function writeFillRunBatchJson(runDir, batchIndex, suffix, value) {
  await writeJsonFile(path.join(runDir, 'batches', `batch-${String(batchIndex).padStart(3, '0')}-${suffix}.json`), value);
}

async function savePageTaskFillPack(app, templateId, fillPack) {
  const filePath = getTemplateFillPackPath(app, templateId);
  await writeJsonFile(filePath, fillPack);
  return fillPack;
}

async function readStoredPageTaskFillPack(app, templateId) {
  const normalizedTemplateId = normalizeString(templateId);
  if (!normalizedTemplateId) return null;
  try {
    const fillPack = await readJsonFile(getTemplateFillPackPath(app, normalizedTemplateId));
    return fillPack && typeof fillPack === 'object' ? fillPack : null;
  } catch {
    return null;
  }
}

function createPageTaskFillPackSummary(fillPack) {
  const results = Array.isArray(fillPack?.results) ? fillPack.results : [];
  const completedCount = results.filter((item) => item.status === 'filled' || item.status === 'review').length;
  const reviewCount = results.filter((item) => item.status === 'review').length;
  const missingCount = results.filter((item) => item.status === 'missing').length;
  const errorCount = results.filter((item) => item.status === 'error').length;
  return {
    taskCount: results.length,
    completedCount,
    reviewCount,
    missingCount,
    errorCount,
  };
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildParagraphTextSegments(paragraph) {
  const segments = [];
  let fullText = '';
  descendants(paragraph, 't').forEach((textNode) => {
    let run = textNode.parentNode;
    while (run && localName(run) !== 'r') {
      run = run.parentNode;
    }
    const text = textNode.textContent || '';
    const start = fullText.length;
    fullText += text;
    segments.push({
      node: textNode,
      run,
      text,
      start,
      end: start + text.length,
    });
  });
  return { segments, fullText };
}

function setWordTextNode(textNode, text) {
  textNode.textContent = text;
  if (/^\s|\s$|\s{2,}/.test(String(text || ''))) {
    textNode.setAttribute('xml:space', 'preserve');
  }
}

function appendTextToRun(doc, run, text) {
  const parts = String(text || '').split(/\n/);
  parts.forEach((part, index) => {
    if (index > 0) {
      run.appendChild(doc.createElement('w:br'));
    }
    const textNode = doc.createElement('w:t');
    if (/^\s|\s$|\s{2,}/.test(part)) {
      textNode.setAttribute('xml:space', 'preserve');
    }
    textNode.appendChild(doc.createTextNode(part));
    run.appendChild(textNode);
  });
}

function createStyledTextRun(doc, value, styleRun) {
  const run = doc.createElement('w:r');
  const sourceProperties = styleRun ? elementChildren(styleRun, 'rPr')[0] : null;
  if (sourceProperties) {
    run.appendChild(sourceProperties.cloneNode(true));
  }
  appendTextToRun(doc, run, value);
  return run;
}

function insertNodeAfter(referenceNode, nextNode) {
  const parent = referenceNode?.parentNode;
  if (!parent) return false;
  if (referenceNode.nextSibling) {
    parent.insertBefore(nextNode, referenceNode.nextSibling);
  } else {
    parent.appendChild(nextNode);
  }
  return true;
}

function segmentAtIndex(segments, index, preferPrevious = false) {
  if (!segments.length) return null;
  if (preferPrevious) {
    for (let cursor = segments.length - 1; cursor >= 0; cursor -= 1) {
      const segment = segments[cursor];
      if (index >= segment.start && index <= segment.end) return segment;
    }
  }
  return segments.find((segment) => index >= segment.start && index <= segment.end) || segments[segments.length - 1];
}

function insertTextAtParagraphIndex(doc, paragraph, index, value) {
  const { segments, fullText } = buildParagraphTextSegments(paragraph);
  if (!segments.length) {
    const run = createStyledTextRun(doc, value, null);
    paragraph.appendChild(run);
    return true;
  }

  const boundedIndex = Math.max(0, Math.min(Number(index || 0), fullText.length));
  const segment = segmentAtIndex(segments, boundedIndex, true) || segments[segments.length - 1];
  const offset = Math.max(0, Math.min(boundedIndex - segment.start, segment.text.length));
  const before = segment.text.slice(0, offset);
  const after = segment.text.slice(offset);
  setWordTextNode(segment.node, before);

  const insertedRun = createStyledTextRun(doc, value, segment.run);
  insertNodeAfter(segment.run, insertedRun);
  if (after) {
    const afterRun = createStyledTextRun(doc, after, segment.run);
    insertNodeAfter(insertedRun, afterRun);
  }
  return true;
}

function replaceParagraphTextRange(doc, paragraph, start, end, value) {
  const { segments, fullText } = buildParagraphTextSegments(paragraph);
  if (!segments.length) return false;
  const boundedStart = Math.max(0, Math.min(Number(start || 0), fullText.length));
  const boundedEnd = Math.max(boundedStart, Math.min(Number(end || boundedStart), fullText.length));
  if (boundedStart === boundedEnd) {
    return insertTextAtParagraphIndex(doc, paragraph, boundedStart, value);
  }

  const firstSegment = segmentAtIndex(segments, boundedStart) || segments[0];
  const lastSegment = segmentAtIndex(segments, boundedEnd, true) || firstSegment;
  const firstIndex = segments.indexOf(firstSegment);
  const lastIndex = segments.indexOf(lastSegment);

  if (firstSegment === lastSegment) {
    const before = firstSegment.text.slice(0, boundedStart - firstSegment.start);
    const after = firstSegment.text.slice(boundedEnd - firstSegment.start);
    setWordTextNode(firstSegment.node, `${before}${value}${after}`);
    return true;
  }

  const before = firstSegment.text.slice(0, boundedStart - firstSegment.start);
  const after = lastSegment.text.slice(boundedEnd - lastSegment.start);
  setWordTextNode(firstSegment.node, `${before}${value}`);
  for (let index = firstIndex + 1; index < lastIndex; index += 1) {
    setWordTextNode(segments[index].node, '');
  }
  setWordTextNode(lastSegment.node, after);
  return true;
}

function findLooseRange(rawText, query) {
  const raw = String(rawText || '');
  const target = normalizeLooseText(query);
  if (!target) return null;
  for (let start = 0; start < raw.length; start += 1) {
    while (start < raw.length && /\s/.test(raw[start])) start += 1;
    let cursor = start;
    let targetCursor = 0;
    while (cursor < raw.length && targetCursor < target.length) {
      const char = raw[cursor];
      if (/\s/.test(char)) {
        cursor += 1;
        continue;
      }
      if (char.toLowerCase() !== target[targetCursor]) break;
      cursor += 1;
      targetCursor += 1;
    }
    if (targetCursor === target.length) {
      return { start, end: cursor };
    }
  }
  return null;
}

function collectTaskAnchorCandidates(task) {
  const candidates = [];
  (Array.isArray(task?.anchors) ? task.anchors : []).forEach((anchor) => {
    [anchor?.sourceText, anchor?.matchText].forEach((value) => {
      const text = normalizeString(value);
      if (text && text.length >= 2) candidates.push(text);
    });
  });
  [task?.label ? `${task.label}：` : '', task?.label ? `${task.label}:` : '', task?.label, task?.placeholder]
    .map(normalizeString)
    .filter((value) => value && value.length >= 2)
    .forEach((value) => candidates.push(value));
  return [...new Set(candidates)].sort((first, second) => second.length - first.length);
}

function collectPrioritizedTaskAnchorCandidates(task, value) {
  const all = collectTaskAnchorCandidates(task);
  const selectedOptions = normalizeChoiceValueSet(value, task?.options || []);
  const selectedNeedles = [...selectedOptions].map(normalizeLooseText).filter(Boolean);
  if (!selectedNeedles.length) {
    return { preferred: [], all };
  }
  const preferred = all.filter((candidate) => {
    const normalized = normalizeLooseText(candidate);
    return selectedNeedles.some((needle) => normalized.includes(needle));
  });
  return {
    preferred,
    all,
  };
}

function findAnchorRangeInText(rawText, candidates) {
  const raw = String(rawText || '');
  for (const candidate of candidates) {
    const exactIndex = raw.indexOf(candidate);
    if (exactIndex >= 0) {
      return { start: exactIndex, end: exactIndex + candidate.length, candidate };
    }
  }
  for (const candidate of candidates) {
    const range = findLooseRange(raw, candidate);
    if (range) return { ...range, candidate };
  }
  return null;
}

function textMatchesAnyCandidate(paragraphText, rawText, candidates) {
  const normalizedParagraph = normalizeLooseText(paragraphText || rawText);
  const normalizedRaw = normalizeLooseText(rawText);
  return candidates.some((candidate) => {
    const normalized = normalizeLooseText(candidate);
    return normalized && (normalizedParagraph.includes(normalized) || normalizedRaw.includes(normalized));
  });
}

function createDocxParagraphIndex(doc) {
  return descendants(doc, 'p').map((paragraph, index) => {
    const { fullText } = buildParagraphTextSegments(paragraph);
    return {
      paragraph,
      index,
      rawText: fullText,
      text: getNodeText(paragraph),
    };
  });
}

function refreshParagraphIndexItem(item) {
  const { fullText } = buildParagraphTextSegments(item.paragraph);
  item.rawText = fullText;
  item.text = getNodeText(item.paragraph);
}

function findParagraphForCandidates(paragraphs, candidates, startIndex) {
  if (!candidates.length) return null;
  const boundedStart = Math.max(0, Math.min(Number(startIndex || 0), Math.max(0, paragraphs.length - 1)));
  const ranges = [
    [boundedStart, paragraphs.length],
    [0, boundedStart],
  ];

  for (const [from, to] of ranges) {
    for (let index = from; index < to; index += 1) {
      const item = paragraphs[index];
      if (!item) continue;
      if (textMatchesAnyCandidate(item.text, item.rawText, candidates)) {
        const anchorRange = findAnchorRangeInText(item.rawText, candidates);
        return { item, anchorRange, candidates };
      }
    }
  }
  return null;
}

function findParagraphForTask(paragraphs, task, startIndex, value = '') {
  const candidates = collectPrioritizedTaskAnchorCandidates(task, value);
  return findParagraphForCandidates(paragraphs, candidates.preferred, startIndex)
    || findParagraphForCandidates(paragraphs, candidates.all, startIndex);
}

function findRegexRangeInText(text, regex) {
  const match = regex.exec(text);
  if (!match) return null;
  return {
    start: match.index,
    end: match.index + match[0].length,
    match,
  };
}

function findLastBlankRangeBeforeUnit(rangeText) {
  const regex = /([ \t\u00A0_＿]{1,})((?:日历天|个标段|万元|元|个|天|%|％)|[。；;，,、）)])/g;
  let selected = null;
  let match;
  while ((match = regex.exec(rangeText)) !== null) {
    selected = {
      start: match.index,
      end: match.index + match[1].length,
    };
  }
  return selected;
}

function findValueTargetRange(rawText, task, anchorRange) {
  const raw = String(rawText || '');
  const rangeStart = anchorRange?.start ?? 0;
  const rangeEnd = anchorRange?.end ?? raw.length;
  const rangeText = raw.slice(rangeStart, rangeEnd);
  const placeholders = [
    task?.placeholder,
    task?.label,
    '采购项目名称',
    '项目名称',
    '项目编号',
    '年 月 日',
  ].map(normalizeString).filter((value, index, array) => value && array.indexOf(value) === index);

  for (const placeholder of placeholders) {
    const bracketRange = findRegexRangeInText(
      rangeText,
      new RegExp(`[（(【\\[]\\s*${escapeRegExp(placeholder)}\\s*[）)】\\]]`),
    );
    if (bracketRange) {
      return {
        start: rangeStart + bracketRange.start,
        end: rangeStart + bracketRange.end,
      };
    }
  }

  const quoteRange = findRegexRangeInText(rangeText, /[“"]\s*[”"]/);
  if (quoteRange) {
    return {
      start: rangeStart + quoteRange.start + 1,
      end: rangeStart + quoteRange.end - 1,
    };
  }

  const dateRange = findRegexRangeInText(rangeText, /年\s*月\s*日/);
  if (/日期|时间/.test(task?.label || '') && dateRange) {
    return {
      start: rangeStart + dateRange.start,
      end: rangeStart + dateRange.end,
    };
  }

  const blankRange = findLastBlankRangeBeforeUnit(rangeText);
  if (blankRange) {
    return {
      start: rangeStart + blankRange.start,
      end: rangeStart + blankRange.end,
    };
  }

  const labelColonCandidates = [
    task?.label ? `${task.label}：` : '',
    task?.label ? `${task.label}:` : '',
  ].map(normalizeString).filter(Boolean);
  for (const labelColon of labelColonCandidates) {
    const labelIndex = raw.indexOf(labelColon, Math.max(0, rangeStart - 20));
    if (labelIndex >= 0 && labelIndex <= rangeEnd) {
      let start = labelIndex + labelColon.length;
      let end = start;
      while (end < raw.length && /[ \t\u00A0_＿]/.test(raw[end])) end += 1;
      return { start, end };
    }
  }

  const colonIndex = Math.max(rangeText.lastIndexOf('：'), rangeText.lastIndexOf(':'));
  if (colonIndex >= 0) {
    let start = rangeStart + colonIndex + 1;
    let end = start;
    while (end < raw.length && /[ \t\u00A0_＿]/.test(raw[end])) end += 1;
    return { start, end };
  }

  return {
    start: rangeEnd,
    end: rangeEnd,
  };
}

function normalizeChoiceValueSet(value, options = []) {
  const valueText = normalizeLooseText(value);
  const selected = new Set();
  const sortedOptions = [...options].map(normalizeString).filter(Boolean).sort((first, second) => second.length - first.length);
  sortedOptions.forEach((option) => {
    const optionText = normalizeLooseText(option);
    if (optionText && valueText.includes(optionText)) {
      selected.add(option);
    }
  });
  sortedOptions.forEach((option) => {
    if (![...selected].some((selectedOption) => selectedOption !== option && normalizeLooseText(selectedOption).includes(normalizeLooseText(option)))) {
      return;
    }
    selected.delete(option);
  });
  return selected;
}

function removeSelectedOptionsFromValue(value, selectedOptions) {
  let text = normalizeString(value);
  [...selectedOptions].sort((first, second) => second.length - first.length).forEach((option) => {
    text = text.replace(new RegExp(escapeRegExp(option), 'g'), '');
  });
  return text
    .replace(/[（(]\s*[）)]/g, '')
    .replace(/[【\[]\s*[】\]]/g, '')
    .replace(/^[：:，,；;、\s]+|[：:，,；;、\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyChoiceMarkersToParagraph(paragraph, task, value) {
  const options = Array.isArray(task?.options) ? task.options.map(normalizeString).filter(Boolean) : [];
  if (!options.length || !String(value || '').trim()) {
    return { changed: false, handled: false, selected: new Set(), textValue: normalizeString(value) };
  }
  const selected = normalizeChoiceValueSet(value, options);
  if (!selected.size) {
    return { changed: false, handled: false, selected, textValue: normalizeString(value) };
  }

  const optionTexts = options.map((option) => ({
    option,
    normalized: normalizeLooseText(option),
  })).filter((option) => option.normalized);
  let changed = false;
  const { segments, fullText } = buildParagraphTextSegments(paragraph);
  const segmentTextByIndex = new Map(segments.map((segment, index) => [index, [...segment.text]]));
  const checkboxRanges = [];
  const checkboxPattern = /[□■☑]/g;
  let checkboxMatch;
  while ((checkboxMatch = checkboxPattern.exec(fullText)) !== null) {
    checkboxRanges.push(checkboxMatch.index);
  }

  checkboxRanges.forEach((checkboxIndex, boxOrder) => {
    const nextCheckboxIndex = checkboxRanges[boxOrder + 1] ?? Math.min(fullText.length, checkboxIndex + 100);
    const followingText = fullText.slice(checkboxIndex + 1, nextCheckboxIndex);
    const normalizedFollowing = normalizeLooseText(followingText);
    const matchedOptions = optionTexts.filter((item) => normalizedFollowing.includes(item.normalized));
    if (!matchedOptions.length) return;
    const shouldSelect = matchedOptions.some((item) => selected.has(item.option));
    const segmentIndex = segments.findIndex((segment) => checkboxIndex >= segment.start && checkboxIndex < segment.end);
    if (segmentIndex < 0) return;
    const chars = segmentTextByIndex.get(segmentIndex);
    const charIndex = checkboxIndex - segments[segmentIndex].start;
    const nextChar = shouldSelect ? '■' : '□';
    if (chars[charIndex] !== nextChar) {
      chars[charIndex] = nextChar;
      changed = true;
    }
  });

  segments.forEach((segment) => {
    const segmentIndex = segments.indexOf(segment);
    const nextText = (segmentTextByIndex.get(segmentIndex) || []).join('');
    if (nextText !== segment.text) {
      setWordTextNode(segment.node, nextText);
    }
  });

  return {
    changed,
    handled: true,
    selected,
    textValue: removeSelectedOptionsFromValue(value, selected),
  };
}

function applyTaskFillToParagraph(doc, paragraph, task, value, anchorRange) {
  const choiceResult = applyChoiceMarkersToParagraph(paragraph, task, value);
  const type = normalizeString(task?.type || 'blank');
  if (['choice', 'multiChoice'].includes(type) && choiceResult.handled) {
    return true;
  }

  const textValue = type === 'compound'
    ? choiceResult.textValue
    : normalizeString(value);
  if (!String(textValue || '').trim()) {
    return Boolean(choiceResult.changed);
  }

  const { fullText } = buildParagraphTextSegments(paragraph);
  const targetRange = findValueTargetRange(fullText, task, anchorRange);
  return replaceParagraphTextRange(doc, paragraph, targetRange.start, targetRange.end, textValue) || choiceResult.changed;
}

function getTaskAnchorText(task) {
  return (Array.isArray(task?.anchors) ? task.anchors : [])
    .map((anchor) => `${anchor?.sourceText || ''} ${anchor?.matchText || ''}`)
    .join(' ');
}

function hasExplicitFillTarget(task) {
  const text = getTaskAnchorText(task);
  return /[□■☑]/.test(text)
    || /[“"]\s*[”"]/.test(text)
    || /[_＿]{1,}/.test(text)
    || /年\s*月\s*日/.test(text)
    || /[ \t\u00A0]{2,}(?:[。；;，,、）)]|元|万元|日历天|个标段|个|天|%|％)/.test(text);
}

function isOptionOnlyCompoundWithoutTarget(task, value) {
  if (normalizeString(task?.type) !== 'compound') return false;
  const selected = normalizeChoiceValueSet(value, task?.options || []);
  if (!selected.size) return false;
  return !removeSelectedOptionsFromValue(value, selected) && !hasExplicitFillTarget(task);
}

function applyChoiceMarkersNearParagraph(paragraphs, paragraphIndex, task, value) {
  const options = Array.isArray(task?.options) ? task.options.map(normalizeString).filter(Boolean) : [];
  if (!options.length) return false;
  for (let offset = 0; offset <= 3; offset += 1) {
    const item = paragraphs[paragraphIndex + offset];
    if (!item) continue;
    if (!/[□■☑]/.test(item.rawText || item.text || '')) continue;
    const result = applyChoiceMarkersToParagraph(item.paragraph, task, value);
    if (result.handled) {
      refreshParagraphIndexItem(item);
      return true;
    }
  }
  return false;
}

function indexPageTasksByKey(pageTaskPack) {
  const byKey = new Map();
  (Array.isArray(pageTaskPack?.pages) ? pageTaskPack.pages : []).forEach((page, pageIndex) => {
    (Array.isArray(page.tasks) ? page.tasks : []).forEach((task, taskIndex) => {
      byKey.set(normalizeFieldKey(task.key), {
        ...task,
        page: Number(page.page || task.page || 0),
        pageTitle: page.pageTitle || task.pageTitle || `第 ${page.page || 0} 页`,
        _pageIndex: pageIndex,
        _taskIndex: taskIndex,
      });
    });
  });
  return byKey;
}

function createDocxExportItems(pageTaskPack, fillPack) {
  const taskByKey = indexPageTasksByKey(pageTaskPack);
  return (Array.isArray(fillPack?.results) ? fillPack.results : [])
    .map((result, resultIndex) => {
      const key = normalizeFieldKey(result?.key);
      const task = taskByKey.get(key);
      return {
        key,
        result,
        task,
        resultIndex,
      };
    })
    .filter((item) => item.task && normalizeString(item.result?.value) && !['missing', 'error', 'waiting', 'running'].includes(normalizeString(item.result?.status)))
    .sort((first, second) => {
      const pageDiff = Number(first.task.page || 0) - Number(second.task.page || 0);
      if (pageDiff) return pageDiff;
      const taskDiff = Number(first.task._taskIndex || 0) - Number(second.task._taskIndex || 0);
      return taskDiff || first.resultIndex - second.resultIndex;
    });
}

function ensureDocxExtension(filePath) {
  return path.extname(filePath).toLowerCase() === '.docx' ? filePath : `${filePath}.docx`;
}

function ensureStateShape(state) {
  const empty = createEmptyState();
  const templateTaskPack = {
    ...createEmptyTemplateTaskPack(state?.activeTemplateId || '', state?.task?.templateName || ''),
    ...(state?.templateTaskPack || {}),
    tasks: Array.isArray(state?.templateTaskPack?.tasks) ? state.templateTaskPack.tasks : [],
  };
  const questions = createTemplateQuestions(templateTaskPack.tasks);
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
    templateTaskPack,
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

function buildExtractionMessages(markdown, task, sourceBlocks, questions = createTemplateQuestions()) {
  const questionPayload = questions.map((question) => ({
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
      content: `任务基础信息：\n${JSON.stringify(task || {}, null, 2)}\n\n模板题目清单：\n${JSON.stringify(questionPayload, null, 2)}`,
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

function guessQuestionType(value) {
  const type = normalizeString(value);
  if (['choice', 'multiChoice', 'compound', 'blank'].includes(type)) return type;
  return 'blank';
}

function normalizeAiTaskKey(value, fallback) {
  const key = normalizeFieldKey(value);
  if (key && key !== 'field') return key;
  return normalizeFieldKey(fallback) || `ai_task_${crypto.randomUUID().slice(0, 8)}`;
}

function createAiTemplateAnalysisMessages({ template, blocks, outline }) {
  const outlineById = new Map((outline || []).map((node) => [node.id, node]));
  const blockPayload = blocks.map((block) => ({
    blockId: block.id,
    order: block.order,
    pageHint: block.pageHint,
    outlineId: block.outlineId,
    chapter: outlineById.get(block.outlineId)?.title || '未归类章节',
    type: block.type,
    text: block.text,
  }));

  return [
    {
      role: 'system',
      content: [
        '你是中国工程类询比采购文件模板结构解析助手。',
        '你的任务是把模板原文解析成“固定任务 JSON 包”，供后续 AI 根据采购需求方案逐项填空、选择和回填 Word 使用。',
        '必须只返回 JSON，不要 Markdown，不要解释，不要代码块。',
        '只能根据用户提供的 blockId 和 text 生成任务，不允许引用不存在的 blockId。',
        '只抽取需要后续填写、选择、勾选或复合判断的项目；纯说明、固定条款、注释、格式标题不要生成任务。',
        '同一业务字段在多个章节重复出现时，应合并成同一个 task，并在 anchors 中保留多个落点。',
        '遇到“□有/□无 + 空白”“□接受/□不接受”“资质/业绩/人员/财务 + 空白”必须用 compound。',
        'key 必须使用英文 snake_case，稳定、简短、可复用，例如 project_name、financial_requirement。',
        'type 只能是 blank、choice、multiChoice、compound；inputKind 只能是 short-text、long-text、select、compound。',
        'anchor.matchText 必须是原文中能定位的短文本，anchor.sourceText 必须摘取对应 block 的原文片段。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `模板名称：${template.name || template.fileName}`,
        '请解析以下模板原文块，输出严格 JSON：',
        JSON.stringify(blockPayload, null, 2),
        '',
        '输出结构必须为：',
        JSON.stringify({
          tasks: [
            {
              key: 'project_name',
              label: '项目名称',
              type: 'blank',
              inputKind: 'short-text',
              group: '基础信息',
              chapter: '封面',
              required: true,
              risk: false,
              prompt: '从采购需求方案中提取项目名称。',
              placeholder: '填写项目名称',
              options: [],
              anchors: [
                {
                  blockId: 'tpl_block_xxx',
                  matchText: '项目名称',
                  sourceText: '项目名称：',
                  pageHint: 1,
                  fillTarget: 'label_tail_blank',
                },
              ],
            },
          ],
        }, null, 2),
      ].join('\n'),
    },
  ];
}

function normalizeAiTaskPack({ template, aiPayload, blocks, outline }) {
  const generatedAt = nowIso();
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const outlineById = new Map((outline || []).map((node) => [node.id, node]));
  const tasksByKey = new Map();

  const rawTasks = Array.isArray(aiPayload?.tasks) ? aiPayload.tasks : [];
  rawTasks.forEach((rawTask, taskIndex) => {
    const label = normalizeString(rawTask?.label || rawTask?.name || rawTask?.title || '');
    const key = normalizeAiTaskKey(rawTask?.key || rawTask?.id, label || `ai_task_${taskIndex + 1}`);
    if (!key || !label) return;
    const type = guessQuestionType(rawTask?.type);
    const anchors = (Array.isArray(rawTask?.anchors) ? rawTask.anchors : [])
      .map((anchor, anchorIndex) => {
        const blockId = normalizeString(anchor?.blockId || anchor?.block_id || anchor?.id || '');
        const block = blockById.get(blockId);
        if (!block) return null;
        return {
          id: `${key}_anchor_${String(anchorIndex + 1).padStart(3, '0')}`,
          fieldId: `ai_field_${key}_${String(anchorIndex + 1).padStart(3, '0')}`,
          blockId: block.id,
          outlineId: block.outlineId,
          blockOrder: block.order,
          matchText: normalizeString(anchor?.matchText || anchor?.match_text || label),
          sourceText: normalizeString(anchor?.sourceText || anchor?.source_text || block.text).slice(0, 1200),
          pageHint: Number(anchor?.pageHint || anchor?.page_hint || block.pageHint || 0) || null,
          fillTarget: normalizeString(anchor?.fillTarget || anchor?.fill_target || ''),
        };
      })
      .filter(Boolean);
    if (!anchors.length) return;
    const firstBlock = blockById.get(anchors[0].blockId);
    const task = {
      key,
      label,
      type,
      inputKind: normalizeString(rawTask?.inputKind || rawTask?.input_kind) || inferInputKind(type),
      group: normalizeString(rawTask?.group) || inferTaskGroup({ label, type, risk: rawTask?.risk }, ''),
      chapter: normalizeString(rawTask?.chapter) || outlineById.get(firstBlock?.outlineId)?.title || '未归类章节',
      required: Boolean(rawTask?.required),
      risk: Boolean(rawTask?.risk),
      order: 50000 + (taskIndex + 1) * 10,
      prompt: normalizeString(rawTask?.prompt) || createTaskPrompt({ label, type, risk: rawTask?.risk }),
      placeholder: normalizeString(rawTask?.placeholder) || label,
      options: Array.isArray(rawTask?.options) ? rawTask.options.map(normalizeString).filter(Boolean) : [],
      anchors,
      validation: { minLength: rawTask?.required ? 1 : 0 },
      createdAt: generatedAt,
      updatedAt: generatedAt,
    };
    const existing = tasksByKey.get(key);
    if (existing) {
      existing.anchors.push(...task.anchors.map((anchor, index) => ({
        ...anchor,
        id: `${key}_anchor_${String(existing.anchors.length + index + 1).padStart(3, '0')}`,
      })));
    } else {
      tasksByKey.set(key, task);
    }
  });

  const tasks = [...tasksByKey.values()].map((task, index) => ({
    ...task,
    order: (index + 1) * 10,
    anchors: task.anchors.sort((first, second) => first.blockOrder - second.blockOrder),
  }));

  return {
    templateId: template.id,
    templateName: template.name,
    schemaVersion: `${TEMPLATE_TASK_SCHEMA_VERSION}-ai`,
    taskCount: tasks.length,
    generatedAt,
    tasks,
  };
}

const PAGE_TASK_PROMPT_VERSION = 'page-task-v1';
const PAGE_TASK_ALLOWED_TYPES = new Set(['blank', 'choice', 'multiChoice', 'compound', 'calculated']);
const PAGE_TASK_ALLOWED_INPUT_KINDS = new Set(['short-text', 'long-text', 'select', 'multi-select', 'compound', 'number']);

function createPageTaskAnalysisMessages({ template, page, pageCount }) {
  const pageNumber = Number(page.page || 0);
  const schemaExample = {
    templateId: template.id,
    templateName: template.name,
    page: pageNumber,
    pageTitle: '封面',
    status: 'ready',
    tasks: [
      {
        key: `page_${String(pageNumber || 1).padStart(3, '0')}_project_code`,
        label: '项目编号',
        type: 'blank',
        inputKind: 'short-text',
        required: true,
        risk: false,
        group: '基础信息',
        chapter: '封面',
        prompt: '从采购需求方案中提取项目编号，用于填写封面项目编号。',
        placeholder: '项目编号',
        options: [],
        anchors: [
          {
            matchText: '项目编号：',
            sourceText: '项目编号：',
            pageHint: pageNumber,
          },
        ],
      },
    ],
    noTaskReason: '',
  };

  return [
    {
      role: 'system',
      content: [
        '你是模板任务标注员，不是文档改写员。',
        '你的任务是逐页阅读采购文件模板原文，判断本页哪些内容需要后续 AI 根据“采购需求方案”填写、选择或计算。',
        '只返回一个严格 JSON 对象，不要 Markdown，不要解释，不要代码块，不要输出多余文本。',
        '每次只处理当前页，不跨页合并，不为其他页生成任务。',
        '不要根据经验臆造字段；只能根据当前页原文中真实存在的空白、勾选项、金额/日期/数量/比例/时限、项目范围、资格条件、评分参数、合同商务条款生成任务。',
        '固定采购人、固定代理机构、固定地址、固定流程条款、纪律条款、说明性注释，不生成任务。',
        '带“□”且会随项目变化的内容生成 choice 或 multiChoice。',
        '同时包含“□”和填空的内容生成 compound。',
        '需要按金额、比例或规则计算的内容生成 calculated。',
        '空白、年月日、金额、数量、比例、时限、联系人、电话、邮箱、项目范围、资格条件、评分参数、合同商务条款等需要生成任务。',
        'anchors[].sourceText 必须逐字复制当前页原文中的连续片段，不能改写，不能来自其他页。',
        'anchors[].matchText 必须是 sourceText 中适合定位的短文本。',
        `anchors[].pageHint 必须等于当前页码 ${pageNumber}。`,
        '如果本页没有任务，tasks 必须为空数组，并给出明确 noTaskReason。',
        'key 必须是英文 snake_case，并以 page_页码三位_ 开头，例如 page_003_max_price。',
        'type 只能是 blank、choice、multiChoice、compound、calculated。',
        'inputKind 只能是 short-text、long-text、select、multi-select、compound、number。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `模板ID：${template.id}`,
        `模板名称：${template.name || template.fileName}`,
        `当前页码：${pageNumber}`,
        `总页数：${pageCount}`,
        '',
        '当前页原文：',
        page.text || '',
        '',
        '输出 JSON Schema 示例，字段必须完整保留：',
        JSON.stringify(schemaExample, null, 2),
      ].join('\n'),
    },
  ];
}

function normalizePageTaskType(value) {
  const type = normalizeString(value);
  return PAGE_TASK_ALLOWED_TYPES.has(type) ? type : 'blank';
}

function normalizePageTaskInputKind(value, type) {
  const inputKind = normalizeString(value);
  if (PAGE_TASK_ALLOWED_INPUT_KINDS.has(inputKind)) return inputKind;
  if (type === 'choice') return 'select';
  if (type === 'multiChoice') return 'multi-select';
  if (type === 'compound') return 'compound';
  if (type === 'calculated') return 'number';
  return 'short-text';
}

function normalizePageTaskKey(value, pageNumber, label, index) {
  const normalized = normalizeFieldKey(value);
  const prefix = `page_${String(pageNumber).padStart(3, '0')}_`;
  if (normalized.startsWith(prefix)) return normalized;
  const fallback = normalizeFieldKey(label) || `task_${index + 1}`;
  return `${prefix}${normalized || fallback}`;
}

function sourceTextExistsOnPage(sourceText, pageText) {
  const source = String(sourceText || '').trim();
  if (!source) return false;
  if (pageText.includes(source)) return true;
  return normalizeLooseText(pageText).includes(normalizeLooseText(source));
}

function recoverExactSourceTextFromPage(sourceText, pageText) {
  const source = String(sourceText || '').trim();
  const text = String(pageText || '');
  if (!source) return '';
  if (text.includes(source)) return source;

  const target = normalizeLooseText(source);
  if (!target) return '';
  for (let start = 0; start < text.length; start += 1) {
    while (start < text.length && /\s/.test(text[start])) start += 1;
    let cursor = start;
    let targetCursor = 0;
    while (cursor < text.length && targetCursor < target.length) {
      const char = text[cursor];
      if (/\s/.test(char)) {
        cursor += 1;
        continue;
      }
      if (char.toLowerCase() !== target[targetCursor]) break;
      cursor += 1;
      targetCursor += 1;
    }
    if (targetCursor === target.length) {
      return text.slice(start, cursor).trim();
    }
  }
  return '';
}

function normalizePageTaskPayload({ template, page, pageCount, aiPayload }) {
  const pageNumber = Number(page.page || 0);
  const pageText = String(page.text || '');
  const rawTasks = Array.isArray(aiPayload?.tasks) ? aiPayload.tasks : [];
  const tasks = rawTasks.map((rawTask, taskIndex) => {
    const label = normalizeString(rawTask?.label || rawTask?.name || rawTask?.title || '');
    if (!label) return null;
    const type = normalizePageTaskType(rawTask?.type);
    const anchors = (Array.isArray(rawTask?.anchors) ? rawTask.anchors : [])
      .map((anchor) => {
        const sourceText = recoverExactSourceTextFromPage(anchor?.sourceText || anchor?.source_text || '', pageText);
        if (!sourceText || !sourceTextExistsOnPage(sourceText, pageText)) return null;
        const matchText = normalizeString(anchor?.matchText || anchor?.match_text || sourceText.slice(0, 30));
        return {
          matchText: sourceText.includes(matchText) ? matchText : sourceText.slice(0, 30),
          sourceText,
          pageHint: pageNumber,
        };
      })
      .filter(Boolean);
    if (!anchors.length) return null;
    const key = normalizePageTaskKey(rawTask?.key || rawTask?.id, pageNumber, label, taskIndex);
    return {
      key,
      label,
      type,
      inputKind: normalizePageTaskInputKind(rawTask?.inputKind || rawTask?.input_kind, type),
      required: Boolean(rawTask?.required),
      risk: Boolean(rawTask?.risk),
      group: normalizeString(rawTask?.group) || '页面任务',
      chapter: normalizeString(rawTask?.chapter) || normalizeString(aiPayload?.pageTitle || aiPayload?.page_title) || `第 ${pageNumber} 页`,
      prompt: normalizeString(rawTask?.prompt) || `从采购需求方案中提取“${label}”。`,
      placeholder: normalizeString(rawTask?.placeholder) || label,
      options: Array.isArray(rawTask?.options) ? rawTask.options.map(normalizeString).filter(Boolean) : [],
      anchors,
    };
  }).filter(Boolean);

  return {
    templateId: template.id,
    templateName: template.name || template.fileName || '',
    page: pageNumber,
    pageTitle: normalizeString(aiPayload?.pageTitle || aiPayload?.page_title) || `第 ${pageNumber} 页`,
    status: 'ready',
    tasks,
    noTaskReason: tasks.length ? '' : normalizeString(aiPayload?.noTaskReason || aiPayload?.no_task_reason) || '本页为固定说明或流程条款，无需根据采购需求方案回填',
    _pageCount: pageCount,
  };
}

async function extractPdfPageTexts(pdfPath) {
  const parser = new PDFParse({ data: await fs.readFile(pdfPath) });
  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    const pageCount = Math.max(1, Number(info.total || 0));
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const result = await parser.getText({ partial: [pageNumber] });
      const pageText = String(result.pages?.[0]?.text || result.text || '')
        .replace(new RegExp(`\\n*--\\s*${pageNumber}\\s+of\\s+${pageCount}\\s*--\\s*$`), '')
        .trim();
      pages.push({
        page: pageNumber,
        text: pageText,
      });
    }
    return { pageCount, pages };
  } finally {
    try {
      await parser.destroy();
    } catch {
      // PDF parser cleanup failure should not hide the original parsing result.
    }
  }
}

function createFieldsFromTaskPack(taskPack) {
  return (Array.isArray(taskPack?.tasks) ? taskPack.tasks : []).flatMap((task) => (
    (Array.isArray(task.anchors) ? task.anchors : []).map((anchor) => ({
      id: anchor.fieldId,
      key: task.key,
      label: task.label,
      type: task.type,
      required: Boolean(task.required),
      risk: Boolean(task.risk),
      options: Array.isArray(task.options) ? task.options : [],
      outlineId: anchor.outlineId,
      blockId: anchor.blockId,
      blockOrder: anchor.blockOrder,
      sourceText: anchor.sourceText,
      placeholder: task.placeholder || anchor.matchText || task.label,
      confidence: 68,
      status: 'pending',
    }))
  ));
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, items.length || 1));

  async function runNext() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runNext()));
  return results;
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
  const subscribers = new Set();

  function subscribe(webContents) {
    if (!webContents || webContents.isDestroyed()) return;
    subscribers.add(webContents);
    webContents.once('destroyed', () => subscribers.delete(webContents));
  }

  function emitEvent(event) {
    for (const webContents of subscribers) {
      if (!webContents.isDestroyed()) {
        webContents.send('procurement-agent:event', event);
      }
    }
  }

  function emitAiAnalysisProgress(patch) {
    emitEvent({
      type: 'template-ai-analysis',
      updatedAt: nowIso(),
      ...patch,
    });
  }

  function emitPageTaskFillProgress(patch) {
    emitEvent({
      type: 'page-task-fill',
      updatedAt: nowIso(),
      ...patch,
    });
  }

  function estimateStreamTokens(text) {
    const value = String(text || '');
    if (!value) return 0;
    const cjkCount = (value.match(/[\u3400-\u9fff]/g) || []).length;
    const otherCount = Math.max(0, value.length - cjkCount);
    return Math.max(1, Math.round(cjkCount + otherCount / 4));
  }

  function createStreamEmitter(template, batchIndex, totalBatches) {
    let buffer = '';
    let outputText = '';
    let lastFlushAt = 0;
    let firstTokenAt = 0;
    let lastModelStats = null;
    let finished = false;
    const startedAt = Date.now();

    function buildStats(now = Date.now()) {
      const elapsedMs = Math.max(0, now - startedAt);
      const charCount = outputText.length;
      const estimatedTokens = estimateStreamTokens(outputText);
      const activeMs = firstTokenAt ? Math.max(1, now - firstTokenAt) : 0;
      const tokensPerSecond = firstTokenAt ? estimatedTokens / (activeMs / 1000) : 0;
      const overallTokensPerSecond = elapsedMs ? estimatedTokens / (elapsedMs / 1000) : 0;
      const timing = lastModelStats?.timing || {};
      return {
        elapsedMs,
        timeToFirstTokenMs: firstTokenAt ? firstTokenAt - startedAt : elapsedMs,
        waitingForFirstToken: !firstTokenAt,
        charCount,
        estimatedTokens,
        tokensPerSecond,
        overallTokensPerSecond,
        secondsPerToken: tokensPerSecond ? 1 / tokensPerSecond : 0,
        modelTokensPerSecond: Number(timing.completionTokensPerSecond || 0),
        modelSecondsPerToken: Number(timing.secondsPerToken || 0),
        promptTokens: Number(timing.promptTokens || 0),
        completionTokens: Number(timing.completionTokens || 0),
        promptMs: Number(timing.promptMs || 0),
        completionMs: Number(timing.completionMs || 0),
      };
    }

    function emitStreamEvent(status, delta = '') {
      emitEvent({
        type: 'template-ai-analysis-stream',
        status,
        templateId: template.id,
        templateName: template.name,
        batchIndex,
        totalBatches,
        delta,
        stats: buildStats(),
        updatedAt: nowIso(),
      });
    }

    function flush(force = false) {
      const now = Date.now();
      if (!buffer || (!force && now - lastFlushAt < 180)) return;
      const delta = buffer;
      buffer = '';
      lastFlushAt = now;
      emitStreamEvent('streaming', delta);
    }

    const timer = setInterval(() => {
      if (finished) return;
      flush(true);
      if (!buffer) {
        emitStreamEvent(firstTokenAt ? 'streaming' : 'stream-waiting');
      }
    }, 1000);
    timer.unref?.();

    return {
      push(delta) {
        const text = String(delta || '');
        if (!text) return;
        if (!firstTokenAt) {
          firstTokenAt = Date.now();
        }
        outputText += text;
        buffer += text;
        flush(false);
      },
      pushStats(stats) {
        lastModelStats = stats || null;
        emitStreamEvent('stream-stats');
      },
      mark(message) {
        emitStreamEvent(firstTokenAt ? 'streaming' : 'stream-waiting', message);
      },
      flush,
      finish() {
        finished = true;
        flush(true);
        emitStreamEvent('stream-finished');
        clearInterval(timer);
      },
    };
  }

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
      const rawQuestionCount = Array.isArray(rawState?.questions) ? rawState.questions.length : 0;
      if (state.templateTaskPack.tasks.length && state.questions.length !== rawQuestionCount) {
        return persist(addLog(state, `已同步模板任务包题目：${state.questions.length} 个`));
      }
      if (dedupedLibrary.removed.length) {
        await Promise.allSettled(dedupedLibrary.removed.map((template) => removeStoredTemplate(app, template)));
        return persist(addLog(state, `已清理 ${dedupedLibrary.removed.length} 个重复模板记录`));
      }
      const activeTemplate = state.templateLibrary.find((template) => template.id === state.activeTemplateId);
      if (activeTemplate && (!state.templateTaskPack.tasks.length || !isCurrentTemplateTaskSchema(state.templateTaskPack.schemaVersion))) {
        const taskPack = await readTemplateTaskPack(app, activeTemplate);
        if (taskPack.tasks.length && isCurrentTemplateTaskSchema(taskPack.schemaVersion)) {
          return persist(ensureStateShape({
            ...state,
            templateTaskPack: taskPack,
          }));
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
          return persist(ensureStateShape({
            ...state,
            templateOutline: scanResult.outline,
            templateBlocks: scanResult.blocks,
            templateFields: scanResult.fields,
            templateTaskPack: generatedTaskPack,
          }));
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

    const nextState = addLog(ensureStateShape({
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
    }), `已导入并扫描模板：${fileName}`);

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
    const questions = createStateQuestions(current);
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
        messages: buildExtractionMessages(markdown, runningState.task, sourceBlocks, runningState.questions),
        temperature: 0.1,
        timeout_ms: 300000,
        schemaName: 'procurement_template_answers',
        progressLabel: '采购模板答题',
        failureMessage: '模型返回的采购模板答案 JSON 无效',
        logTitle: '采购模板答题',
      });
      const answers = normalizeExtractedAnswers(payload, markdown, sourceBlocks, runningState.questions);
      const fields = answersToFields(answers, runningState.questions);
      const nextTask = applyTaskFromFields(runningState.task, fields);
      const nextState = addLog({
        ...runningState,
        task: {
          ...nextTask,
          status: 'answers',
        },
        questions: runningState.questions,
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
    const questions = createStateQuestions(state);
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
    const questions = createStateQuestions(state);
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

  async function readTemplatePageTasks(payload = {}) {
    const state = await loadState();
    const templateId = normalizeString(payload?.templateId) || state.activeTemplateId;
    const template = state.templateLibrary.find((item) => item.id === templateId)
      || state.templateLibrary.find((item) => item.id === state.activeTemplateId);
    if (!template) {
      return {
        templateId,
        templateName: '',
        pageCount: 0,
        generatedAt: '',
        pages: [],
      };
    }
    return readTemplatePageTaskPack(app, template);
  }

  async function readPageTaskFillPack(payload = {}) {
    const state = await loadState();
    const templateId = normalizeString(payload?.templateId) || state.activeTemplateId;
    const template = state.templateLibrary.find((item) => item.id === templateId)
      || state.templateLibrary.find((item) => item.id === state.activeTemplateId);
    if (!template) return null;
    return readStoredPageTaskFillPack(app, template.id);
  }

  async function updatePageTaskFillResult(payload = {}) {
    const state = await loadState();
    const templateId = normalizeString(payload?.templateId) || state.activeTemplateId;
    const key = normalizeFieldKey(payload?.key || payload?.taskKey || payload?.task_key);
    const template = state.templateLibrary.find((item) => item.id === templateId)
      || state.templateLibrary.find((item) => item.id === state.activeTemplateId);
    if (!template) {
      throw new Error('请先选择采购模板');
    }
    if (!key) {
      throw new Error('缺少要更新的任务 key');
    }

    const fillPack = await readStoredPageTaskFillPack(app, template.id);
    if (!fillPack || !Array.isArray(fillPack.results)) {
      throw new Error('当前模板还没有可编辑的填充结果');
    }
    const resultIndex = fillPack.results.findIndex((result) => normalizeFieldKey(result?.key) === key);
    if (resultIndex < 0) {
      throw new Error(`未找到填充任务：${key}`);
    }

    const value = normalizeString(payload?.value);
    const evidence = payload?.evidence === undefined ? fillPack.results[resultIndex].evidence : normalizeString(payload?.evidence);
    const reason = payload?.reason === undefined ? fillPack.results[resultIndex].reason : normalizeString(payload?.reason);
    const requestedStatus = normalizeString(payload?.status);
    const status = PAGE_TASK_FILL_RESULT_STATUSES.has(requestedStatus) ? requestedStatus : (value ? 'review' : 'missing');
    fillPack.results[resultIndex] = {
      ...fillPack.results[resultIndex],
      value,
      evidence,
      reason,
      status,
      confidence: value ? Number(payload?.confidence || fillPack.results[resultIndex].confidence || 80) : 0,
      updatedAt: nowIso(),
    };

    const nextFillPack = {
      ...fillPack,
      ...createPageTaskFillPackSummary(fillPack),
      generatedAt: fillPack.generatedAt || nowIso(),
      updatedAt: nowIso(),
    };
    return savePageTaskFillPack(app, template.id, nextFillPack);
  }

  async function exportGeneratedWord(payload = {}) {
    const state = await loadState();
    const templateId = normalizeString(payload?.templateId) || state.activeTemplateId;
    const template = state.templateLibrary.find((item) => item.id === templateId)
      || state.templateLibrary.find((item) => item.id === state.activeTemplateId);
    if (!template) {
      return { success: false, message: '请先选择采购模板' };
    }

    const sourcePath = template.normalizedPath || template.storedPath;
    if (!sourcePath) {
      return { success: false, message: '当前模板没有可导出的 Word 源文件' };
    }
    try {
      await fs.access(sourcePath);
    } catch {
      return { success: false, message: `模板 Word 源文件不存在：${sourcePath}` };
    }

    const pageTaskPack = await readTemplatePageTaskPack(app, template);
    const fillPack = await readStoredPageTaskFillPack(app, template.id);
    if (!pageTaskPack?.pages?.length) {
      return { success: false, message: '当前模板没有页面任务包，请先执行模板 AI 解析' };
    }
    if (!fillPack?.results?.length) {
      return { success: false, message: '当前模板还没有填充结果，请先执行招标文件智能生成' };
    }

    const exportItems = createDocxExportItems(pageTaskPack, fillPack);
    if (!exportItems.length) {
      return { success: false, message: '没有可写入 Word 的已填充任务' };
    }

    let outputPath = normalizeString(payload?.outputPath);
    if (!outputPath) {
      const defaultDir = app?.getPath ? app.getPath('documents') : process.env.USERPROFILE || process.cwd();
      const projectName = normalizeString(state.task?.projectName) || normalizeString(fillPack.templateName) || template.name || '询比采购文件';
      const defaultFilename = `${safeFileStem(projectName)}-生成稿.docx`;
      const saveResult = await dialog.showSaveDialog({
        title: '导出询比采购文件 Word',
        defaultPath: path.join(defaultDir, defaultFilename),
        filters: [{ name: 'Word 文档', extensions: ['docx'] }],
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, canceled: true, message: '已取消导出' };
      }
      outputPath = saveResult.filePath;
    }
    outputPath = ensureDocxExtension(outputPath);
    const zip = await JSZip.loadAsync(await fs.readFile(sourcePath));
    const documentXml = await readDocxXml(zip, 'word/document.xml');
    if (!documentXml) {
      throw new Error('模板文件缺少 word/document.xml，无法导出');
    }

    const doc = parseXml(documentXml);
    const paragraphs = createDocxParagraphIndex(doc);
    const perPageParagraphStep = Math.max(1, Math.floor(paragraphs.length / Math.max(1, Number(pageTaskPack.pageCount || 1))));
    let cursor = 0;
    let appliedCount = 0;
    const unmatched = [];

    exportItems.forEach((item) => {
      const pageNumber = Math.max(1, Number(item.task.page || item.result.page || 1));
      const pageStartIndex = Math.max(0, Math.min(paragraphs.length - 1, Math.floor((pageNumber - 1) * perPageParagraphStep)));
      const startIndex = Math.max(cursor, pageStartIndex);
      const found = findParagraphForTask(paragraphs, item.task, startIndex, item.result.value);
      if (!found?.item) {
        unmatched.push(item.result.label || item.task.label || item.key);
        return;
      }

      if (isOptionOnlyCompoundWithoutTarget(item.task, item.result.value)) {
        unmatched.push(item.result.label || item.task.label || item.key);
        return;
      }

      const type = normalizeString(item.task?.type || item.result?.type || 'blank');
      const changed = ['choice', 'multiChoice'].includes(type)
        ? applyChoiceMarkersNearParagraph(paragraphs, found.item.index, item.task, normalizeString(item.result.value))
        : applyTaskFillToParagraph(doc, found.item.paragraph, item.task, normalizeString(item.result.value), found.anchorRange);
      if (!changed) {
        unmatched.push(item.result.label || item.task.label || item.key);
        return;
      }
      appliedCount += 1;
      cursor = Math.min(paragraphs.length - 1, found.item.index + 1);
      refreshParagraphIndexItem(found.item);
    });

    zip.file('word/document.xml', serializeXml(doc));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, await zip.generateAsync({ type: 'nodebuffer' }));

    const message = unmatched.length
      ? `Word 已导出，已写入 ${appliedCount}/${exportItems.length} 项；${unmatched.length} 项未定位，请打开文档核对。`
      : `Word 已导出，已写入 ${appliedCount} 项填充结果。`;

    return {
      success: true,
      path: outputPath,
      filePath: outputPath,
      message,
      appliedCount,
      totalCount: exportItems.length,
      unmatched,
    };
  }

  async function fillPageTasksWithAi(payload = {}) {
    const state = await loadState();
    const markdown = await readDemandMarkdown();
    if (!markdown.trim()) {
      return {
        success: false,
        message: '请先上传并解析采购需求方案',
        state,
      };
    }

    const templateId = normalizeString(payload?.templateId) || state.activeTemplateId;
    const template = state.templateLibrary.find((item) => item.id === templateId)
      || state.templateLibrary.find((item) => item.id === state.activeTemplateId);
    if (!template) {
      return { success: false, message: '请先选择采购模板', state };
    }

    const pageTaskPack = await readTemplatePageTaskPack(app, template);
    const tasks = flattenPageTasksForFill(pageTaskPack);
    if (!tasks.length) {
      return { success: false, message: '当前模板没有页面任务包，请先执行模板 AI 解析', state };
    }

    const demandDocument = state.documents.find((item) => item.role === 'demand') || null;
    const sourceBlocks = state.sourceBlocks.length ? state.sourceBlocks : createSourceBlocks(markdown);
    const globalFacts = extractDemandGlobalFacts(sourceBlocks, markdown);
    const globalFactsSummary = summarizeGlobalFacts(globalFacts);
    const runId = `fill-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
    const runDir = getTemplateFillRunDir(app, template.id, runId);
    await fs.mkdir(path.join(runDir, 'batches'), { recursive: true });
    await writeFillRunJson(runDir, 'global-facts.json', {
      runId,
      promptVersion: PAGE_TASK_FILL_PROMPT_VERSION,
      generatedAt: nowIso(),
      templateId: template.id,
      templateName: template.name || template.fileName || '',
      demandDocumentId: demandDocument?.id || '',
      demandFileName: demandDocument?.fileName || '',
      facts: globalFacts,
      summary: globalFactsSummary,
    });
    const batchSize = Math.max(1, Math.min(Number(payload?.batchSize) || 6, 12));
    const batches = [];
    for (let index = 0; index < tasks.length; index += batchSize) {
      batches.push(tasks.slice(index, index + batchSize));
    }

    const startedState = await persist(addLog({
      ...state,
      sourceBlocks,
      extraction: {
        ...state.extraction,
        status: 'extracting',
        message: `正在调用当前文本模型填充页面任务包，共 ${tasks.length} 项（${PAGE_TASK_FILL_PROMPT_VERSION}）`,
      },
    }, `开始填充页面任务包：${tasks.length} 项，${PAGE_TASK_FILL_PROMPT_VERSION}`));

    emitPageTaskFillProgress({
      status: 'running',
      templateId: template.id,
      templateName: template.name,
      runId,
      promptVersion: PAGE_TASK_FILL_PROMPT_VERSION,
      totalBatches: batches.length,
      completedBatches: 0,
      totalTasks: tasks.length,
      completedTasks: 0,
      message: `开始填充任务包，共 ${tasks.length} 项，${batches.length} 批`,
    });

    const results = [];
    let completedBatches = 0;
    let failedBatches = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      emitPageTaskFillProgress({
        status: 'batch-running',
        templateId: template.id,
        templateName: template.name,
        runId,
        promptVersion: PAGE_TASK_FILL_PROMPT_VERSION,
        batchIndex: batchIndex + 1,
        totalBatches: batches.length,
        completedBatches,
        failedBatches,
        totalTasks: tasks.length,
        completedTasks: results.length,
        currentTaskLabel: batch[0]?.label || '',
        message: `正在填充第 ${batchIndex + 1}/${batches.length} 批，${batch.length} 项`,
      });

      try {
        const taskEvidenceMap = createTaskEvidenceMap(batch, sourceBlocks, globalFacts);
        const messages = createPageTaskFillMessages({
          template,
          demandDocument,
          tasks: batch,
          batchIndex: batchIndex + 1,
          totalBatches: batches.length,
          globalFacts,
          taskEvidenceMap,
        });
        await writeFillRunBatchJson(runDir, batchIndex + 1, 'input', {
          runId,
          promptVersion: PAGE_TASK_FILL_PROMPT_VERSION,
          batchIndex: batchIndex + 1,
          totalBatches: batches.length,
          tasks: batch,
          taskEvidenceMap,
          messages,
        });
        const aiPayload = await aiService.requestJson({
          messages,
          temperature: 0.1,
          max_tokens: 2600,
          timeout_ms: 300000,
          schemaName: 'procurement_page_task_fill',
          progressLabel: `采购页面任务填充 第 ${batchIndex + 1} 批`,
          failureMessage: '模型返回的页面任务填充 JSON 无效',
          logTitle: '采购页面任务填充',
        });
        const normalizedBatch = normalizePageTaskFillPayload(aiPayload, batch, sourceBlocks);
        await writeFillRunBatchJson(runDir, batchIndex + 1, 'raw', aiPayload);
        await writeFillRunBatchJson(runDir, batchIndex + 1, 'normalized', normalizedBatch);
        results.push(...normalizedBatch);
        completedBatches += 1;
        emitPageTaskFillProgress({
          status: 'batch-done',
          templateId: template.id,
          templateName: template.name,
          runId,
          promptVersion: PAGE_TASK_FILL_PROMPT_VERSION,
          batchIndex: batchIndex + 1,
          totalBatches: batches.length,
          completedBatches,
          failedBatches,
          totalTasks: tasks.length,
          completedTasks: results.length,
          results: normalizedBatch,
          message: `第 ${batchIndex + 1}/${batches.length} 批完成`,
        });
      } catch (error) {
        failedBatches += 1;
        const message = error?.message || '任务包填充失败';
        const failedResults = batch.map((task) => normalizePageTaskFillResult({
          status: 'error',
          reason: message,
        }, task, sourceBlocks));
        await writeFillRunBatchJson(runDir, batchIndex + 1, 'error', {
          message,
          stack: error?.stack || '',
          batch,
          failedResults,
        });
        results.push(...failedResults);
        emitPageTaskFillProgress({
          status: 'batch-error',
          templateId: template.id,
          templateName: template.name,
          runId,
          promptVersion: PAGE_TASK_FILL_PROMPT_VERSION,
          batchIndex: batchIndex + 1,
          totalBatches: batches.length,
          completedBatches,
          failedBatches,
          totalTasks: tasks.length,
          completedTasks: results.length,
          results: failedResults,
          message: `第 ${batchIndex + 1}/${batches.length} 批失败：${message}`,
        });
      }
    }

    const finalResults = postprocessPageTaskFillResults(results, tasks, globalFacts, sourceBlocks);
    const baseFillPack = {
      templateId: template.id,
      templateName: template.name || template.fileName || '',
      demandDocumentId: demandDocument?.id || '',
      demandFileName: demandDocument?.fileName || '',
      generatedAt: nowIso(),
      status: failedBatches ? 'partial' : 'done',
      promptVersion: PAGE_TASK_FILL_PROMPT_VERSION,
      runId,
      debugPath: runDir,
      globalFactsSummary,
      results: finalResults,
    };
    const fillPack = {
      ...baseFillPack,
      ...createPageTaskFillPackSummary(baseFillPack),
    };
    await savePageTaskFillPack(app, template.id, fillPack);
    await writeFillRunJson(runDir, 'summary.json', {
      runId,
      promptVersion: PAGE_TASK_FILL_PROMPT_VERSION,
      generatedAt: fillPack.generatedAt,
      status: fillPack.status,
      templateId: template.id,
      templateName: template.name || template.fileName || '',
      demandDocumentId: demandDocument?.id || '',
      demandFileName: demandDocument?.fileName || '',
      batchCount: batches.length,
      failedBatches,
      ...createPageTaskFillPackSummary(fillPack),
      missingResults: finalResults
        .filter((result) => result.status === 'missing' || result.status === 'error')
        .map((result) => ({
          key: result.key,
          label: result.label,
          page: result.page,
          status: result.status,
          missingKind: result.missingKind || '',
          reason: result.reason || '',
        })),
    });

    const nextState = addLog({
      ...startedState,
      sourceBlocks,
      extraction: {
        ...startedState.extraction,
        status: failedBatches ? 'error' : 'extracted',
        message: failedBatches
          ? `页面任务包部分填充完成：${fillPack.completedCount}/${fillPack.taskCount} 项，${failedBatches} 批失败`
          : `页面任务包填充完成：${fillPack.completedCount}/${fillPack.taskCount} 项，${fillPack.reviewCount} 项需确认`,
        extractedAt: nowIso(),
        fieldCount: fillPack.completedCount,
        missingCount: fillPack.missingCount,
        riskCount: fillPack.reviewCount,
        pendingCount: fillPack.reviewCount,
      },
    }, `页面任务包填充完成：${fillPack.completedCount}/${fillPack.taskCount} 项`);
    const persistedState = await persist(nextState);

    emitPageTaskFillProgress({
      status: failedBatches ? 'partial' : 'success',
      templateId: template.id,
      templateName: template.name,
      runId,
      promptVersion: PAGE_TASK_FILL_PROMPT_VERSION,
      totalBatches: batches.length,
      completedBatches,
      failedBatches,
      totalTasks: tasks.length,
      completedTasks: finalResults.length,
      fillPack,
      message: failedBatches ? '页面任务包部分填充完成' : '页面任务包填充完成',
    });

    return {
      success: !failedBatches,
      message: failedBatches ? '页面任务包部分填充完成，请查看异常任务' : '页面任务包填充完成',
      state: persistedState,
      fillPack,
    };
  }

  async function analyzeTemplateWithAi(payload = {}) {
    const state = await loadState();
    const templateId = normalizeString(payload?.templateId) || state.activeTemplateId;
    const concurrency = Math.max(1, Math.min(Number(payload?.concurrency) || 1, 2));
    const template = state.templateLibrary.find((item) => item.id === templateId);
    if (!template) {
      return { success: false, message: '未找到要进行 AI 解析的模板', state };
    }

    if (!template.previewPdfPath) {
      return { success: false, message: '当前模板没有 PDF 预览，无法按页进行 AI 解析', state };
    }

    const baseDir = path.resolve(getProcurementDir(app));
    const pdfPath = path.resolve(template.previewPdfPath);
    if (pdfPath !== baseDir && !pdfPath.startsWith(`${baseDir}${path.sep}`)) {
      throw new Error('PDF 预览文件不在采购智能体工作目录内');
    }

    const pdfPageTextPack = await extractPdfPageTexts(pdfPath);
    const pages = pdfPageTextPack.pages.filter((page) => normalizeString(page.text).length >= 1);
    if (!pages.length) {
      return { success: false, message: 'PDF 没有可供 AI 解析的页面文本', state };
    }

    emitAiAnalysisProgress({
      status: 'running',
      templateId: template.id,
      templateName: template.name,
      totalBatches: pages.length,
      completedBatches: 0,
      failedBatches: 0,
      generatedTasks: 0,
      concurrency,
      promptVersion: PAGE_TASK_PROMPT_VERSION,
      message: `开始逐页 AI 解析，共 ${pages.length} 页`,
    });

    let completedBatches = 0;
    let failedBatches = 0;
    let generatedTasks = 0;

    const pageResults = await runWithConcurrency(pages, concurrency, async (page, index) => {
      const batchIndex = index + 1;
      const streamEmitter = createStreamEmitter(template, batchIndex, pages.length);
      emitAiAnalysisProgress({
        status: 'batch-running',
        templateId: template.id,
        templateName: template.name,
        batchIndex,
        page: page.page,
        totalBatches: pages.length,
        completedBatches,
        failedBatches,
        generatedTasks,
        promptVersion: PAGE_TASK_PROMPT_VERSION,
        message: `正在解析第 ${page.page}/${pdfPageTextPack.pageCount} 页`,
      });
      streamEmitter.mark(`\n[第 ${page.page}/${pdfPageTextPack.pageCount} 页已发送到模型，等待首个Token...]\n`);
      let aiPayload;
      try {
        aiPayload = await aiService.requestJson({
          messages: createPageTaskAnalysisMessages({ template, page, pageCount: pdfPageTextPack.pageCount }),
          temperature: 0.1,
          max_tokens: 1600,
          max_retries: 0,
          timeout_ms: 300000,
          schemaName: 'procurement_template_page_task',
          progressLabel: `模板逐页任务解析 第 ${page.page} 页`,
          failureMessage: '模型返回的页面任务 JSON 无效',
          logTitle: '模板页面任务解析',
          streamCallback: (delta) => streamEmitter.push(delta),
          streamStatsCallback: (stats) => streamEmitter.pushStats(stats),
        });
        streamEmitter.finish();
        const normalizedPageTask = normalizePageTaskPayload({
          template,
          page,
          pageCount: pdfPageTextPack.pageCount,
          aiPayload,
        });
        completedBatches += 1;
        generatedTasks += normalizedPageTask.tasks.length;
        emitAiAnalysisProgress({
          status: 'batch-done',
          templateId: template.id,
          templateName: template.name,
          batchIndex,
          page: page.page,
          totalBatches: pages.length,
          completedBatches,
          failedBatches,
          generatedTasks,
          promptVersion: PAGE_TASK_PROMPT_VERSION,
          message: `第 ${page.page}/${pdfPageTextPack.pageCount} 页完成，生成 ${normalizedPageTask.tasks.length} 个页面任务`,
        });
        return { pageTask: normalizedPageTask };
      } catch (error) {
        streamEmitter.finish();
        const config = configStore.load();
        const baseUrl = normalizeString(config.base_url || 'http://127.0.0.1:8088/v1');
        const reason = error?.message || '未知错误';
        const hint = /fetch failed|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|Failed to fetch/i.test(reason)
          ? `无法连接本地文本模型服务：${baseUrl}。请先启动当前配置的本地模型服务，确认接口可用后重试。`
          : `第 ${page.page} 页模板 AI 解析失败：${reason}`;
        failedBatches += 1;
        emitAiAnalysisProgress({
          status: 'batch-error',
          templateId: template.id,
          templateName: template.name,
          batchIndex,
          page: page.page,
          totalBatches: pages.length,
          completedBatches,
          failedBatches,
          generatedTasks,
          promptVersion: PAGE_TASK_PROMPT_VERSION,
          message: hint,
        });
        return {
          pageTask: {
            templateId: template.id,
            templateName: template.name || template.fileName || '',
            page: page.page,
            pageTitle: `第 ${page.page} 页`,
            status: 'error',
            tasks: [],
            noTaskReason: hint,
          },
          error: hint,
        };
      }
    });

    const pageTasks = pageResults.map((result) => result?.pageTask).filter(Boolean);
    const totalPageTaskCount = pageTasks.reduce((sum, pageTask) => sum + (Array.isArray(pageTask.tasks) ? pageTask.tasks.length : 0), 0);
    if (!totalPageTaskCount) {
      emitAiAnalysisProgress({
        status: 'error',
        templateId: template.id,
        templateName: template.name,
        totalBatches: pages.length,
        completedBatches,
        failedBatches,
        generatedTasks: 0,
        promptVersion: PAGE_TASK_PROMPT_VERSION,
        message: 'AI 没有识别出可用页面任务，请调整提示词或模板结构后重试',
      });
      return { success: false, message: 'AI 没有识别出可用页面任务，请调整提示词或模板结构后重试', state };
    }

    const savedPageTaskPack = await saveTemplatePageTaskPack(app, {
      templateId: template.id,
      templateName: template.name || template.fileName || '',
      pageCount: pdfPageTextPack.pageCount,
      generatedAt: nowIso(),
      mode: 'ai-page-task-semantic',
      promptVersion: PAGE_TASK_PROMPT_VERSION,
      pages: pageTasks,
    });
    const nextState = addLog(ensureStateShape({
      ...state,
      task: {
        ...state.task,
        templateName: template.name,
      },
      activeTemplateId: template.id,
      templateScan: {
        ...state.templateScan,
        status: 'loaded',
        message: `AI 逐页解析完成：生成 ${totalPageTaskCount} 个页面任务，覆盖 ${savedPageTaskPack.pages.length}/${pdfPageTextPack.pageCount} 页`,
        scannedAt: state.templateScan.scannedAt || nowIso(),
        normalizedAt: state.templateScan.normalizedAt || '',
        outlineCount: state.templateScan.outlineCount || 0,
        blockCount: state.templateScan.blockCount || 0,
        fieldCount: state.templateScan.fieldCount || 0,
        warningCount: state.templateScan.warningCount || 0,
        previewStatus: template.previewPdfPath ? 'ready' : 'unavailable',
        previewMessage: template.previewPdfPath ? 'PDF 预览已就绪' : '当前模板没有 PDF 预览',
      },
    }), `AI 已按页解析模板任务包：${template.fileName}，生成 ${totalPageTaskCount} 个页面任务`);

    const result = {
      success: true,
      message: `AI 逐页解析完成，生成 ${totalPageTaskCount} 个页面任务`,
      state: await persist(nextState),
    };
    emitAiAnalysisProgress({
      status: 'success',
      templateId: template.id,
      templateName: template.name,
      totalBatches: pages.length,
      completedBatches,
      failedBatches,
      generatedTasks: totalPageTaskCount,
      promptVersion: PAGE_TASK_PROMPT_VERSION,
      message: result.message,
    });
    return result;
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
    if (!taskPack.tasks.length || !isCurrentTemplateTaskSchema(taskPack.schemaVersion)) {
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
    subscribe,
    loadState,
    saveTask,
    importTemplateDocument,
    importDemandDocument,
    extractFields,
    updateField,
    acceptHighConfidence,
    readTemplatePdf,
    readTemplatePageTasks,
    readPageTaskFillPack,
    updatePageTaskFillResult,
    exportGeneratedWord,
    analyzeTemplateWithAi,
    fillPageTasksWithAi,
    selectTemplate,
    deleteTemplate,
    clear,
  };
}

module.exports = {
  createProcurementAgentService,
};
