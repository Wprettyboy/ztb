const { ipcMain } = require('electron');

function registerProcurementAgentIpc({ procurementAgentService }) {
  ipcMain.on('procurement-agent:subscribe', (event) => procurementAgentService.subscribe(event.sender));
  ipcMain.handle('procurement-agent:load-state', () => procurementAgentService.loadState());
  ipcMain.handle('procurement-agent:save-task', (_event, payload) => procurementAgentService.saveTask(payload));
  ipcMain.handle('procurement-agent:import-template-document', (_event, payload) => procurementAgentService.importTemplateDocument(payload));
  ipcMain.handle('procurement-agent:import-demand-document', () => procurementAgentService.importDemandDocument());
  ipcMain.handle('procurement-agent:extract-fields', () => procurementAgentService.extractFields());
  ipcMain.handle('procurement-agent:update-field', (_event, payload) => procurementAgentService.updateField(payload));
  ipcMain.handle('procurement-agent:accept-high-confidence', (_event, threshold) => procurementAgentService.acceptHighConfidence(threshold));
  ipcMain.handle('procurement-agent:read-template-pdf', (_event, payload) => procurementAgentService.readTemplatePdf(payload));
  ipcMain.handle('procurement-agent:read-template-page-tasks', (_event, payload) => procurementAgentService.readTemplatePageTasks(payload));
  ipcMain.handle('procurement-agent:read-page-task-fill-pack', (_event, payload) => procurementAgentService.readPageTaskFillPack(payload));
  ipcMain.handle('procurement-agent:analyze-template-with-ai', (_event, payload) => procurementAgentService.analyzeTemplateWithAi(payload));
  ipcMain.handle('procurement-agent:fill-page-tasks-with-ai', (_event, payload) => procurementAgentService.fillPageTasksWithAi(payload));
  ipcMain.handle('procurement-agent:select-template', (_event, payload) => procurementAgentService.selectTemplate(payload));
  ipcMain.handle('procurement-agent:delete-template', (_event, payload) => procurementAgentService.deleteTemplate(payload));
  ipcMain.handle('procurement-agent:clear', () => procurementAgentService.clear());
}

module.exports = {
  registerProcurementAgentIpc,
};
