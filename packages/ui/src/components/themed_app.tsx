import React from 'react';
import { ThemeProviderComponent } from '../theme';
import { App, AppProps } from './App';

/**
 * App component wrapped with theme provider
 */
export interface ThemedAppProps extends AppProps {
  forceStandalone?: boolean;
}

export function ThemedApp({ forceStandalone, ...appProps }: ThemedAppProps) {
  return (
    <ThemeProviderComponent forceStandalone={forceStandalone}>
      <App {...appProps} />
    </ThemeProviderComponent>
  );
}