import React from 'react';
import { ThemeProviderComponent } from '../theme';
import { App, AppProps } from './app';

/**
 * App component wrapped with theme provider
 */
export interface ThemedAppProps extends AppProps {
  force_standalone?: boolean;
}

export function ThemedApp({ force_standalone, ...app_props }: ThemedAppProps) {
  return (
    <ThemeProviderComponent force_standalone={force_standalone}>
      <App {...app_props} />
    </ThemeProviderComponent>
  );
}