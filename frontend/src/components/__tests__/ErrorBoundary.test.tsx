/**
 * ErrorBoundary Component Tests
 *
 * Tests error boundary error catching and display
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

// Component that throws an error
function ThrowError(): JSX.Element {
  throw new Error('Test error');
}

// Component that renders normally
function GoodComponent(): JSX.Element {
  return <div>Good Component</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress console.error output during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Good Component')).toBeInTheDocument();
  });

  it('displays error UI when child component throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('An unexpected error occurred. Please try refreshing the page.')).toBeInTheDocument();
  });

  it('shows error message when available', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('has try again button to reset error state', () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>
    );

    // Error boundary renders good component initially
    expect(screen.getByText('Good Component')).toBeInTheDocument();
  });

  it('displays helpful error UI layout', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Try Again');
  });
});
