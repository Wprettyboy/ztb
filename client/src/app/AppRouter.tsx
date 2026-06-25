import type { SectionId } from '../shared/types/navigation';
import { getAppMenuItemById } from './menuConfig';
import ExportFormatPage from '../features/export-format/pages/ExportFormatPage';
import KnowledgeBasePage from '../features/knowledge-base/pages/KnowledgeBasePage';
import ProcurementTemplateDetailPage from '../features/procurement-agent/pages/ProcurementTemplateDetailPage';
import ProcurementTemplateLibraryPage from '../features/procurement-agent/pages/ProcurementTemplateLibraryPage';
import SettingsPage from '../features/settings/pages/SettingsPage';
import TechnicalPlanHome from '../features/technical-plan/pages/TechnicalPlanHome';

interface AppRouterProps {
  activeSection: SectionId;
  developerMode: boolean;
  onDeveloperModeChange: (developerMode: boolean) => void;
  onSectionChange: (section: SectionId) => void;
  registerLeaveGuard?: (guard: ((nextSection?: string) => Promise<boolean>) | null) => void;
}

function AppRouter({ activeSection, developerMode, onDeveloperModeChange, onSectionChange, registerLeaveGuard }: AppRouterProps) {
  const activeMenuItem = getAppMenuItemById(activeSection, developerMode);
  const routedSection = activeMenuItem?.children?.find((item) => !item.hidden)?.id ?? activeSection;

  switch (routedSection) {
    case 'procurement-template-library':
      return <ProcurementTemplateLibraryPage onNavigate={onSectionChange} />;
    case 'procurement-template-detail':
      return <ProcurementTemplateDetailPage onNavigate={onSectionChange} />;
    case 'technical-plan':
      return <TechnicalPlanHome workflowKind="technical-plan" registerLeaveGuard={registerLeaveGuard} onSectionChange={onSectionChange} />;
    case 'existing-plan-expansion':
      return <TechnicalPlanHome workflowKind="existing-plan-expansion" registerLeaveGuard={registerLeaveGuard} onSectionChange={onSectionChange} />;
    case 'document-knowledge-base':
      return <KnowledgeBasePage />;
    case 'export-format':
      return <ExportFormatPage />;
    case 'settings':
      return <SettingsPage onDeveloperModeChange={onDeveloperModeChange} />;
    default:
      return null;
  }
}

export default AppRouter;
