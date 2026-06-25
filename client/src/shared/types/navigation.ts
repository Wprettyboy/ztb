export type SectionId =
  | 'procurement-agent'
  | 'procurement-template-library'
  | 'procurement-template-detail'
  | 'procurement-document-generation'
  | 'bid-generation'
  | 'technical-plan'
  | 'existing-plan-expansion'
  | 'knowledge-base'
  | 'document-knowledge-base'
  | 'export-format'
  | 'settings';

export interface AppMenuNotice {
  message: string;
  actionLabel?: string;
  externalUrl?: string;
}

export interface AppSubMenuItem {
  id: SectionId;
  label: string;
  description: string;
  icon?: 'document' | 'expand' | 'procurement';
  hidden?: boolean;
  notice?: AppMenuNotice;
}

export interface AppMenuItem {
  id: SectionId;
  label: string;
  description: string;
  children?: AppSubMenuItem[];
  notice?: AppMenuNotice;
}
