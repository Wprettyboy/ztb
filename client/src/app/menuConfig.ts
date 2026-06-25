import type { AppMenuItem, SectionId } from '../shared/types/navigation';

export const appMenuItems: AppMenuItem[] = [
  {
    id: 'procurement-agent',
    label: '询比采购',
    description: '采购文件自动生成',
    children: [
      {
        id: 'procurement-template-library',
        label: '模板库管理',
        description: '上传、扫描、存储并管理询比采购文件模板',
        icon: 'procurement',
      },
      {
        id: 'procurement-template-detail',
        label: '模板详情查看',
        description: '查看选中模板的大纲、原文预览和待填字段',
        icon: 'document',
        hidden: true,
      },
    ],
  },
  {
    id: 'bid-generation',
    label: '标书生成',
    description: '技术方案与商务标编制',
    children: [
      {
        id: 'technical-plan',
        label: '生成技术方案',
        description: '根据招标文件重头编写一份标书',
        icon: 'document',
      },
      {
        id: 'existing-plan-expansion',
        label: '已有方案扩写',
        description: '解决人写技术方案太薄的问题，上传写好的方案，进行优化和扩充，遵从原方案真实可落地，又能扩写出厚厚的标书',
        icon: 'expand',
      },
    ],
  },
  {
    id: 'knowledge-base',
    label: '知识库',
    description: '素材、模板和案例资产',
    children: [
      {
        id: 'document-knowledge-base',
        label: '文档知识库',
        description: '管理文档资料、案例素材和可复用知识条目',
        icon: 'document',
      },
    ],
  },
  {
    id: 'export-format',
    label: '导出格式',
    description: 'Word 文档排版与编号格式设置',
  },
];

export function getAppMenuItems(developerMode: boolean): AppMenuItem[] {
  return appMenuItems;
}

export function getSectionOrder(developerMode: boolean): SectionId[] {
  return getAppMenuItems(developerMode).flatMap((item) => [item.id, ...(item.children?.map((child) => child.id) ?? [])]);
}

export function getAppMenuItemById(id: SectionId, developerMode: boolean): AppMenuItem | undefined {
  return getAppMenuItems(developerMode).find((item) => item.id === id);
}

export function getParentMenuItemBySection(section: SectionId, developerMode: boolean): AppMenuItem | undefined {
  return getAppMenuItems(developerMode).find((item) => item.id === section || item.children?.some((child) => child.id === section));
}
