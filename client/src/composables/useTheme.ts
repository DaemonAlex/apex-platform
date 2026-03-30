import { ref, computed } from 'vue';
import { darkTheme } from 'naive-ui';
import type { GlobalThemeOverrides } from 'naive-ui';

// Shared reactive ref updated by both MutationObserver and custom event
const isDarkRef = ref(document.documentElement.getAttribute('data-theme') === 'dark');

function syncTheme() {
  isDarkRef.value = document.documentElement.getAttribute('data-theme') === 'dark';
}

// Listen for monolith's custom event (most reliable)
window.addEventListener('apex-theme-change', () => syncTheme());

// MutationObserver as backup
const observer = new MutationObserver(() => syncTheme());
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

export function useTheme() {
  const isDark = computed(() => isDarkRef.value);

  const darkOverrides: GlobalThemeOverrides = {
    common: {
      bodyColor: 'transparent',
      cardColor: '#1e2130',
      modalColor: '#1e2130',
      popoverColor: '#1e2130',
      tableColor: '#1e2130',
      inputColor: '#161822',
      borderColor: '#2a2d3e',
      textColorBase: '#eef0f4',
      textColor1: '#eef0f4',
      textColor2: '#c0c6d4',
      textColor3: '#8890a4',
      primaryColor: '#38bdf8',
      primaryColorHover: '#0ea5e9',
      primaryColorPressed: '#0284c7',
      successColor: '#4ade80',
      warningColor: '#fbbf24',
      errorColor: '#f87171',
    },
    Card: { colorEmbedded: '#161822' },
    DataTable: {
      thColor: '#161822', tdColor: 'transparent',
      tdColorStriped: 'rgba(255,255,255,0.02)',
      tdColorHover: 'rgba(255,255,255,0.04)',
      borderColor: '#2a2d3e', thTextColor: '#a0a8bc',
    },
    Tabs: {
      tabTextColorLine: '#a0a8bc',
      tabTextColorActiveLine: '#38bdf8',
      tabTextColorHoverLine: '#38bdf8',
      barColor: '#38bdf8',
    },
    Tag: { colorBordered: 'transparent' },
    Input: {
      color: '#161822', border: '1px solid #2a2d3e',
      colorFocus: '#161822', borderFocus: '1px solid #38bdf8',
      textColor: '#eef0f4', placeholderColor: '#4a4d5e',
    },
    InternalSelection: {
      color: '#161822', border: '1px solid #2a2d3e',
      textColor: '#eef0f4', placeholderColor: '#4a4d5e', colorActive: '#161822',
    },
    Button: { textColorPrimary: '#fff' },
    Collapse: { titleTextColor: '#eef0f4' },
    Descriptions: { thColor: '#161822', tdColor: 'transparent', borderColor: '#2a2d3e' },
    Progress: { railColor: '#2a2d3e' },
  };

  const lightOverrides: GlobalThemeOverrides = {
    common: {
      bodyColor: 'transparent',
      cardColor: '#ffffff',
      modalColor: '#ffffff',
      popoverColor: '#ffffff',
      tableColor: '#ffffff',
      inputColor: '#ffffff',
      borderColor: '#e2e8f0',
      dividerColor: '#e2e8f0',
      textColorBase: '#1e293b',
      textColor1: '#1e293b',
      textColor2: '#475569',
      textColor3: '#94a3b8',
      primaryColor: '#0ea5e9',
      primaryColorHover: '#0284c7',
      primaryColorPressed: '#0369a1',
      successColor: '#22c55e',
      warningColor: '#f59e0b',
      errorColor: '#ef4444',
    },
    Card: {
      colorEmbedded: '#f8fafc',
      borderColor: '#e2e8f0',
      color: '#ffffff',
    },
    DataTable: {
      thColor: '#f1f5f9',
      tdColor: '#ffffff',
      tdColorStriped: '#f8fafc',
      tdColorHover: '#f1f5f9',
      borderColor: '#e2e8f0',
      thTextColor: '#475569',
    },
    Tabs: {
      tabTextColorLine: '#64748b',
      tabTextColorActiveLine: '#0ea5e9',
      tabTextColorHoverLine: '#0ea5e9',
      barColor: '#0ea5e9',
    },
    Tag: { colorBordered: 'transparent' },
    Input: {
      color: '#ffffff',
      border: '1px solid #e2e8f0',
      colorFocus: '#ffffff',
      borderFocus: '1px solid #0ea5e9',
      textColor: '#1e293b',
      placeholderColor: '#94a3b8',
    },
    InternalSelection: {
      color: '#ffffff',
      border: '1px solid #e2e8f0',
      textColor: '#1e293b',
      placeholderColor: '#94a3b8',
      colorActive: '#ffffff',
    },
    Button: { textColorPrimary: '#fff' },
    Collapse: { titleTextColor: '#1e293b' },
    Descriptions: { thColor: '#f1f5f9', tdColor: '#ffffff', borderColor: '#e2e8f0' },
    Progress: { railColor: '#e2e8f0' },
  };

  // Semantic colors that switch with theme
  const colors = computed(() => isDark.value ? {
    textMuted: '#94a3b8',
    textSecondary: '#c0c6d4',
    textPrimary: '#eef0f4',
    cardBg: '#1e2130',
    railColor: '#2a2d3e',
    borderSubtle: 'rgba(255,255,255,0.06)',
    tooltipBg: '#1e2130',
    tooltipBorder: '#2a2d3e',
    tooltipText: '#eef0f4',
  } : {
    textMuted: '#64748b',
    textSecondary: '#475569',
    textPrimary: '#1e293b',
    cardBg: '#ffffff',
    railColor: '#e2e8f0',
    borderSubtle: 'rgba(0,0,0,0.06)',
    tooltipBg: '#ffffff',
    tooltipBorder: '#e2e8f0',
    tooltipText: '#1e293b',
  });

  return {
    isDark,
    darkTheme,
    colors,
    themeOverrides: computed(() => isDark.value ? darkOverrides : lightOverrides),
    naiveTheme: computed(() => isDark.value ? darkTheme : undefined),
  };
}
