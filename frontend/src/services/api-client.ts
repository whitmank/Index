/**
 * Centralized API Client
 *
 * Handles all communication with the backend API
 * Includes error handling, retry logic, and type-safe responses
 */

import type {
  IndexObject,
  TagDefinition,
  TagAssignment,
  Collection,
  Link,
} from '@shared/types/models';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  status: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private baseUrl: string;
  private timeout: number = 30000;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || import.meta.env.VITE_API_URL || 'http://localhost:3000';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit & { retries?: number } = {}
  ): Promise<T> {
    const { retries = 3, ...fetchOptions } = options;
    const url = `${this.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
        signal: controller.signal,
        ...fetchOptions,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let details: Record<string, unknown> | undefined;

        if (contentType?.includes('application/json')) {
          try {
            details = await response.json();
          } catch {
            // Unable to parse response as JSON
          }
        }

        throw new ApiError(response.status, `API Error: ${response.statusText}`, details);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }

      return (await response.text()) as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        // Network error - retry if retries available
        if (retries > 0) {
          return this.request<T>(endpoint, { ...options, retries: retries - 1 });
        }
        throw new ApiError(0, 'Network error: Unable to connect to server');
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError(408, 'Request timeout');
      }

      throw new ApiError(500, 'Unknown error occurred', { originalError: String(error) });
    }
  }

  // Objects endpoints
  async getObjects(filters?: Record<string, string>): Promise<IndexObject[]> {
    const params = new URLSearchParams(filters);
    const query = params.toString() ? `?${params}` : '';
    return this.request<IndexObject[]>(`/api/objects${query}`);
  }

  async getObject(id: string): Promise<IndexObject> {
    return this.request<IndexObject>(`/api/objects/${encodeURIComponent(id)}`);
  }

  async createObject(data: Omit<IndexObject, 'id' | 'created_at' | 'modified_at'>): Promise<IndexObject> {
    return this.request<IndexObject>('/api/objects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateObject(id: string, updates: Partial<IndexObject>): Promise<IndexObject> {
    return this.request<IndexObject>(`/api/objects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteObject(id: string): Promise<void> {
    await this.request<void>(`/api/objects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // Tag definitions endpoints
  async getTagDefinitions(): Promise<TagDefinition[]> {
    return this.request<TagDefinition[]>('/api/tags');
  }

  async getTagDefinition(id: string): Promise<TagDefinition> {
    return this.request<TagDefinition>(`/api/tags/${encodeURIComponent(id)}`);
  }

  async createTagDefinition(
    data: Omit<TagDefinition, 'id' | 'created_at'>
  ): Promise<TagDefinition> {
    return this.request<TagDefinition>('/api/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTagDefinition(
    id: string,
    updates: Partial<Omit<TagDefinition, 'id' | 'created_at'>>
  ): Promise<TagDefinition> {
    return this.request<TagDefinition>(`/api/tags/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteTagDefinition(id: string): Promise<void> {
    await this.request<void>(`/api/tags/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // Tag assignments endpoints
  async getTagAssignments(): Promise<TagAssignment[]> {
    return this.request<TagAssignment[]>('/api/tags/assignments');
  }

  async assignTag(tagId: string, objectId: string): Promise<TagAssignment> {
    return this.request<TagAssignment>('/api/tags/assign', {
      method: 'POST',
      body: JSON.stringify({ tag_id: tagId, object_id: objectId }),
    });
  }

  async unassignTag(assignmentId: string): Promise<void> {
    await this.request<void>(`/api/tags/assign/${encodeURIComponent(assignmentId)}`, {
      method: 'DELETE',
    });
  }

  async getTagsForObject(objectId: string): Promise<TagDefinition[]> {
    return this.request<TagDefinition[]>(
      `/api/objects/${encodeURIComponent(objectId)}/tags`
    );
  }

  async getObjectsWithTag(tagId: string): Promise<IndexObject[]> {
    return this.request<IndexObject[]>(`/api/tags/${encodeURIComponent(tagId)}/objects`);
  }

  // Collections endpoints
  async getCollections(): Promise<Collection[]> {
    return this.request<Collection[]>('/api/collections');
  }

  async getCollection(id: string): Promise<Collection> {
    return this.request<Collection>(`/api/collections/${encodeURIComponent(id)}`);
  }

  async createCollection(
    data: Omit<Collection, 'id' | 'created_at' | 'modified_at'>
  ): Promise<Collection> {
    return this.request<Collection>('/api/collections', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCollection(id: string, updates: Partial<Collection>): Promise<Collection> {
    return this.request<Collection>(`/api/collections/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteCollection(id: string): Promise<void> {
    await this.request<void>(`/api/collections/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async getCollectionObjects(id: string): Promise<IndexObject[]> {
    return this.request<IndexObject[]>(
      `/api/collections/${encodeURIComponent(id)}/objects`
    );
  }

  // Links endpoints
  async getLinks(): Promise<Link[]> {
    return this.request<Link[]>('/api/links');
  }

  async createLink(
    data: Omit<Link, 'id' | 'created_at' | 'modified_at'>
  ): Promise<Link> {
    return this.request<Link>('/api/links', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateLink(id: string, updates: Partial<Link>): Promise<Link> {
    return this.request<Link>(`/api/links/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteLink(id: string): Promise<void> {
    await this.request<void>(`/api/links/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // Import endpoint
  async importSource(
    source: string,
    options?: {
      tags?: string[];
      notes?: string;
    }
  ): Promise<IndexObject> {
    return this.request<IndexObject>('/api/objects/import', {
      method: 'POST',
      body: JSON.stringify({ source, ...options }),
    });
  }
}

// Export singleton instance
export const api = new ApiClient();
