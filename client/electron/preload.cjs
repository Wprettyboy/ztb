const { contextBridge, ipcRenderer } = require('electron');

const bridge = {
  appName: '易标投标工具箱',
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getGpuHardwareAccelerationStatus: () => ipcRenderer.invoke('app:get-gpu-hardware-acceleration-status'),
  saveGpuHardwareAccelerationPreference: (enabled) => ipcRenderer.invoke('app:save-gpu-hardware-acceleration-preference', enabled),
  startGpuHardwareAccelerationTrial: () => ipcRenderer.invoke('app:start-gpu-hardware-acceleration-trial'),
  relaunchWithGpuHardwareAccelerationDisabled: () => ipcRenderer.invoke('app:relaunch-with-gpu-hardware-acceleration-disabled'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  database: {
    getStatus: () => ipcRenderer.invoke('workspace-database:get-status'),
    onStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('workspace-database:status', listener);
      return () => ipcRenderer.removeListener('workspace-database:status', listener);
    },
  },
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (config) => ipcRenderer.invoke('config:save', config),
    listModels: (config) => ipcRenderer.invoke('config:list-models', config),
    openConfigFolder: () => ipcRenderer.invoke('config:open-config-folder'),
  },
  ai: {
    chat: (request) => ipcRenderer.invoke('ai:chat', request),
    requestJson: (request) => ipcRenderer.invoke('ai:request-json', request),
    testImageModel: (config) => ipcRenderer.invoke('ai:test-image-model', config),
  },
  procurementAgent: {
    loadState: () => ipcRenderer.invoke('procurement-agent:load-state'),
    saveTask: (payload) => ipcRenderer.invoke('procurement-agent:save-task', payload),
    importTemplateDocument: (payload) => ipcRenderer.invoke('procurement-agent:import-template-document', payload),
    importDemandDocument: () => ipcRenderer.invoke('procurement-agent:import-demand-document'),
    extractFields: () => ipcRenderer.invoke('procurement-agent:extract-fields'),
    updateField: (payload) => ipcRenderer.invoke('procurement-agent:update-field', payload),
    acceptHighConfidence: (threshold) => ipcRenderer.invoke('procurement-agent:accept-high-confidence', threshold),
    readTemplatePdf: (payload) => ipcRenderer.invoke('procurement-agent:read-template-pdf', payload),
    analyzeTemplateWithAi: (payload) => ipcRenderer.invoke('procurement-agent:analyze-template-with-ai', payload),
    onEvent: (callback) => {
      ipcRenderer.send('procurement-agent:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('procurement-agent:event', listener);
      return () => ipcRenderer.removeListener('procurement-agent:event', listener);
    },
    selectTemplate: (payload) => ipcRenderer.invoke('procurement-agent:select-template', payload),
    deleteTemplate: (payload) => ipcRenderer.invoke('procurement-agent:delete-template', payload),
    clear: () => ipcRenderer.invoke('procurement-agent:clear'),
  },
  knowledgeBase: {
    getMigrationStatus: () => ipcRenderer.invoke('knowledge-base:get-migration-status'),
    migrateLegacy: () => ipcRenderer.invoke('knowledge-base:migrate-legacy'),
    list: () => ipcRenderer.invoke('knowledge-base:list'),
    createFolder: (name) => ipcRenderer.invoke('knowledge-base:create-folder', name),
    renameFolder: (folderId, name) => ipcRenderer.invoke('knowledge-base:rename-folder', folderId, name),
    reorderFolder: (draggedFolderId, targetFolderId, position) => ipcRenderer.invoke('knowledge-base:reorder-folder', draggedFolderId, targetFolderId, position),
    deleteFolder: (folderId) => ipcRenderer.invoke('knowledge-base:delete-folder', folderId),
    deleteDocument: (documentId) => ipcRenderer.invoke('knowledge-base:delete-document', documentId),
    moveDocument: (documentId, targetFolderId, targetDocumentId, position) => ipcRenderer.invoke('knowledge-base:move-document', documentId, targetFolderId, targetDocumentId, position),
    uploadDocuments: (folderId) => ipcRenderer.invoke('knowledge-base:upload-documents', folderId),
    retryDocument: (documentId) => ipcRenderer.invoke('knowledge-base:retry-document', documentId),
    startMatching: (documentId, batchSize) => ipcRenderer.invoke('knowledge-base:start-matching', documentId, batchSize),
    readMarkdown: (documentId) => ipcRenderer.invoke('knowledge-base:read-markdown', documentId),
    readItems: (documentId) => ipcRenderer.invoke('knowledge-base:read-items', documentId),
    readAnalysis: (documentId) => ipcRenderer.invoke('knowledge-base:read-analysis', documentId),
    onEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('knowledge-base:event', listener);
      return () => ipcRenderer.removeListener('knowledge-base:event', listener);
    },
  },
  technicalPlan: {
    loadState: () => ipcRenderer.invoke('technical-plan:load-state'),
    importTenderDocument: () => ipcRenderer.invoke('technical-plan:import-tender-document'),
    importOriginalPlanDocument: () => ipcRenderer.invoke('technical-plan:import-original-plan-document'),
    selectBidSection: (selectedSection) => ipcRenderer.invoke('technical-plan:select-bid-section', selectedSection),
    cancelBidSectionSelection: () => ipcRenderer.invoke('technical-plan:cancel-bid-section-selection'),
    readTenderMarkdown: () => ipcRenderer.invoke('technical-plan:read-tender-markdown'),
    readOriginalPlanMarkdown: () => ipcRenderer.invoke('technical-plan:read-original-plan-markdown'),
    updateStep: (step) => ipcRenderer.invoke('technical-plan:update-step', step),
    setWorkflowKind: (workflowKind) => ipcRenderer.invoke('technical-plan:set-workflow-kind', workflowKind),
    switchWorkflowKind: (workflowKind) => ipcRenderer.invoke('technical-plan:switch-workflow-kind', workflowKind),
    saveBidAnalysisConfig: (payload) => ipcRenderer.invoke('technical-plan:save-bid-analysis-config', payload),
    saveOutlineConfig: (payload) => ipcRenderer.invoke('technical-plan:save-outline-config', payload),
    saveOutline: (outlineData) => ipcRenderer.invoke('technical-plan:save-outline', outlineData),
    saveGlobalFacts: (globalFacts) => ipcRenderer.invoke('technical-plan:save-global-facts', globalFacts),
    saveContentGenerationOptions: (options) => ipcRenderer.invoke('technical-plan:save-content-generation-options', options),
    saveChapterContent: (payload) => ipcRenderer.invoke('technical-plan:save-chapter-content', payload),
    clear: () => ipcRenderer.invoke('technical-plan:clear'),
  },
  tasks: {
    startBidAnalysis: (payload) => ipcRenderer.invoke('tasks:start-bid-analysis', payload),
    startOutlineGeneration: (payload) => ipcRenderer.invoke('tasks:start-outline-generation', payload),
    startGlobalFactsGeneration: (payload) => ipcRenderer.invoke('tasks:start-global-facts-generation', payload),
    startContentGeneration: (payload) => ipcRenderer.invoke('tasks:start-content-generation', payload),
    pauseContentGeneration: () => ipcRenderer.invoke('tasks:pause-content-generation'),
    getActiveTasks: () => ipcRenderer.invoke('tasks:get-active'),
    onTaskEvent: (callback) => {
      ipcRenderer.send('tasks:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('tasks:event', listener);
      return () => ipcRenderer.removeListener('tasks:event', listener);
    },
  },
  export: {
    exportWord: (payload) => ipcRenderer.invoke('export:word', payload),
    onWordExportProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('export:word-progress', listener);
      return () => ipcRenderer.removeListener('export:word-progress', listener);
    },
  },
};

contextBridge.exposeInMainWorld('yibiao', bridge);

contextBridge.exposeInMainWorld('yibiaoClient', {
  appName: bridge.appName,
  platform: bridge.platform,
});
