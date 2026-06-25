export type ProcurementFieldStatus = 'confirmed' | 'pending' | 'risk' | 'missing';
export type ProcurementExtractionStatus = 'idle' | 'parsed' | 'extracting' | 'extracted' | 'error';
export type ProcurementQuestionType = 'blank' | 'choice' | 'multiChoice';
export type ProcurementQuestionInputKind = 'short-text' | 'long-text' | 'select';

export interface ProcurementTask {
  id: string;
  projectName: string;
  projectCode: string;
  procurementType: string;
  procurementMethod: string;
  reviewMethod: string;
  templateName: string;
  owner: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcurementDocument {
  id: string;
  role: string;
  label: string;
  fileName: string;
  filePath: string;
  parserLabel: string;
  markdownLength: number;
  importedAt: string;
  status: string;
}

export interface ProcurementTemplateItem {
  id: string;
  name: string;
  fileName: string;
  originalPath: string;
  storedPath: string;
  normalizedPath: string;
  previewPdfPath?: string;
  previewPdfUrl?: string;
  previewPageImages?: ProcurementTemplatePageImage[];
  importedAt: string;
  scannedAt: string;
  status: string;
  stats: {
    outlineCount: number;
    blockCount: number;
    fieldCount: number;
    warningCount: number;
    normalizedHeadingCount: number;
  };
}

export interface ProcurementTemplatePageImage {
  page: number;
  width: number;
  height: number;
  path: string;
  url: string;
}

export interface ProcurementTemplateOutlineNode {
  id: string;
  parentId: string;
  level: number;
  order: number;
  title: string;
  paragraphIndex: number;
  blockIds: string[];
  fieldIds: string[];
}

export interface ProcurementTemplateBlock {
  id: string;
  templateId: string;
  outlineId: string;
  type: 'paragraph' | 'table';
  order: number;
  paragraphIndex: number;
  tableIndex: number;
  level: number;
  styleId: string;
  styleName: string;
  isHeading: boolean;
  normalizedHeading: boolean;
  text: string;
  preview: string;
  fieldIds: string[];
}

export interface ProcurementTemplateField {
  id: string;
  key: string;
  label: string;
  type: ProcurementQuestionType;
  required: boolean;
  risk: boolean;
  options: string[];
  outlineId: string;
  blockId: string;
  blockOrder: number;
  sourceText: string;
  placeholder: string;
  confidence: number;
  status: string;
}

export interface ProcurementTemplateTaskAnchor {
  id: string;
  fieldId: string;
  blockId: string;
  outlineId: string;
  blockOrder: number;
  matchText: string;
  sourceText: string;
  pageHint?: number | null;
}

export interface ProcurementTemplateTaskDefinition {
  key: string;
  label: string;
  type: ProcurementQuestionType;
  inputKind: ProcurementQuestionInputKind;
  group: string;
  chapter: string;
  required: boolean;
  risk: boolean;
  order: number;
  prompt: string;
  placeholder: string;
  options: string[];
  anchors: ProcurementTemplateTaskAnchor[];
  validation?: {
    minLength?: number;
    pattern?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ProcurementTemplateTaskPack {
  templateId: string;
  templateName: string;
  schemaVersion: string;
  taskCount: number;
  generatedAt: string;
  tasks: ProcurementTemplateTaskDefinition[];
}

export interface ProcurementTemplateScanSummary {
  status: 'idle' | 'loaded' | 'error';
  message: string;
  scannedAt: string;
  normalizedAt: string;
  outlineCount: number;
  blockCount: number;
  fieldCount: number;
  warningCount: number;
  normalizedHeadingCount?: number;
  warnings?: string[];
  previewStatus?: 'ready' | 'unavailable';
  previewMessage?: string;
}

export interface ProcurementTemplateQuestion {
  id: string;
  fieldKey: string;
  label: string;
  group: string;
  chapter: string;
  type: ProcurementQuestionType;
  inputKind: ProcurementQuestionInputKind;
  required: boolean;
  risk: boolean;
  order: number;
  options: string[];
  targetText: string;
  placeholder: string;
}

export interface ProcurementSourceBlock {
  id: string;
  order: number;
  page: number | null;
  title: string;
  heading: string;
  text: string;
  preview: string;
  startLine: number;
  endLine: number;
  keywords: string[];
}

export interface ProcurementAnswer {
  id: string;
  questionId: string;
  fieldKey: string;
  value: string;
  confirmedValue: string;
  confidence: number;
  status: ProcurementFieldStatus;
  required: boolean;
  risk: boolean;
  sourceBlockIds: string[];
  sourceText: string;
  sourceLocation: string;
  updatedAt: string;
}

export interface ProcurementField {
  id: string;
  key: string;
  label: string;
  group: string;
  value: string;
  confirmedValue: string;
  confidence: number;
  status: ProcurementFieldStatus;
  required: boolean;
  risk: boolean;
  sourceText: string;
  sourceLocation: string;
  sourceBlockIds?: string[];
  updatedAt: string;
}

export interface ProcurementExtractionSummary {
  status: ProcurementExtractionStatus;
  message: string;
  extractedAt: string;
  fieldCount: number;
  missingCount: number;
  riskCount: number;
  pendingCount?: number;
}

export interface ProcurementLogItem {
  id: string;
  time: string;
  message: string;
}

export interface ProcurementAgentState {
  task: ProcurementTask;
  documents: ProcurementDocument[];
  templateLibrary: ProcurementTemplateItem[];
  activeTemplateId: string;
  templateOutline: ProcurementTemplateOutlineNode[];
  templateBlocks: ProcurementTemplateBlock[];
  templateFields: ProcurementTemplateField[];
  templateTaskPack: ProcurementTemplateTaskPack;
  templateScan: ProcurementTemplateScanSummary;
  questions: ProcurementTemplateQuestion[];
  sourceBlocks: ProcurementSourceBlock[];
  answers: ProcurementAnswer[];
  fields: ProcurementField[];
  extraction: ProcurementExtractionSummary;
  markdownPreview: string;
  logs: ProcurementLogItem[];
}

export interface ProcurementActionResult {
  success: boolean;
  message?: string;
  state: ProcurementAgentState;
}
