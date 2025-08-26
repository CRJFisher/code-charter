import React from 'react';
import { useTheme } from '../../theme/theme_context';
import { useFlowThemeStyles } from './use_flow_theme_styles';
import { CONFIG } from './config';

/**
 * Theme switcher specifically styled for React Flow UI
 */
export const FlowThemeSwitcher: React.FC = () => {
  const { theme, setTheme, availableThemes, isStandalone } = useTheme();
  const themeStyles = useFlowThemeStyles();

  // Only show theme switcher in standalone mode
  if (!isStandalone || !setTheme || !availableThemes) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        zIndex: CONFIG.zIndex.controls,
        ...themeStyles.getOverlayStyle(),
        padding: `${CONFIG.spacing.padding.medium}px`,
      }}
    >
      <label
        htmlFor="flow-theme-select"
        style={{
          ...themeStyles.getTextStyle('secondary'),
          fontSize: `${CONFIG.spacing.fontSize.small}px`,
          marginRight: `${CONFIG.spacing.margin.small}px`,
        }}
      >
        Theme:
      </label>
      <select
        id="flow-theme-select"
        value={theme.name}
        onChange={(e) => {
          const selectedTheme = availableThemes.find((t) => t.name === e.target.value);
          if (selectedTheme) {
            setTheme(selectedTheme);
          }
        }}
        style={{
          ...themeStyles.getButtonStyle('secondary'),
          padding: `${CONFIG.spacing.padding.small}px ${CONFIG.spacing.padding.medium}px`,
          fontSize: `${CONFIG.spacing.fontSize.small}px`,
          borderRadius: `${CONFIG.spacing.borderRadius.small}px`,
          cursor: 'pointer',
        }}
      >
        {availableThemes.map((t) => (
          <option key={t.name} value={t.name}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
};