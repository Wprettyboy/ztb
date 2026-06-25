const { ipcMain } = require('electron');

function registerProcurementAgentIpc({ procurementAgentService }) {
  ipcMain.handle('procurement-agent:load-state', () => procurementAgentService.loadState());
  ipcMain.handle('procurement-agent:save-task', (_event, payload) => procurementAgentService.saveTask(payload));
  ipcMain.handle('procurement-agent:import-template-document', (_event, payload) => procurementAgentService.importTemplateDocument(payload));
  ipcMain.handle('procurement-agent:import-demand-document', () => procurementAgentService.importDemandDocument());
  ipcMain.handle('procurement-agent:extract-fields', () => procurementAgentService.extractFields());
  ipcMain.handle('procurement-agent:update-field', (_event, payload) => procurementAgentService.updateField(payload));
  ipcMain.handle('procurement-agent:accept-high-confidence', (_event, threshold) => procurementAgentService.acceptHighConfidence(threshold));
  ipcMain.handle('procurement-agent:read-template-pdf', (_event, payload) => procurementAgentService.readTemplatePdf(payload));
  ipcMain.handle('procurement-agent:analyze-template-with-ai', (_event, payload) => procurementAgentService.analyzeTemplateWithAi(payload));
  ipcMain.handle('procurement-agent:select-template', (_event, payload) => procurementAgentService.selectTemplate(payload));
  ipcMain.handle('procurement-agent:delete-template', (_event, payload) => procurementAgentService.deleteTemplate(payload));
  ipcMain.handle('procurement-agent:clear', () => procurementAgentService.clear());
}

module.exports = {
  registerProcurementAgentIpc,
};
