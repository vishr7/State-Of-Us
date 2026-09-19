import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, createDecision, getCity, getPolicies, resolveTurn } from '../apiClient';

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiClient', () => {
  it('getCity requests the right path and returns the parsed body', async () => {
    const fetchMock = mockFetchOnce(200, { id: 'city-1', name: 'Marrow Bay' });
    const result = await getCity('city-1');
    expect(fetchMock).toHaveBeenCalledWith('/api/city/city-1', expect.objectContaining({}));
    expect(result).toEqual({ id: 'city-1', name: 'Marrow Bay' });
  });

  it('createDecision POSTs policy_id and player_reasoning as JSON', async () => {
    const fetchMock = mockFetchOnce(201, { id: 'decision-1', turn: 0 });
    await createDecision('city-1', 'policy-1', 'because reasons');
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/city/city-1/decisions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ policy_id: 'policy-1', player_reasoning: 'because reasons' });
  });

  it('resolveTurn POSTs with no body', async () => {
    const fetchMock = mockFetchOnce(200, { turn: 1, applied_decisions: [] });
    await resolveTurn('city-1');
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/city/city-1/resolve-turn');
    expect(init.method).toBe('POST');
  });

  it('throws ApiClientError with the server message and status on a non-2xx response', async () => {
    mockFetchOnce(409, { error: 'A decision for this policy already exists' });
    await expect(createDecision('city-1', 'policy-1')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 409,
      message: 'A decision for this policy already exists',
    });
  });

  it('getPolicies returns the array body on success', async () => {
    mockFetchOnce(200, [{ id: 'p-1' }, { id: 'p-2' }]);
    const result = await getPolicies();
    expect(result).toHaveLength(2);
  });

  it('rejects with ApiClientError even when the error body is unparseable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getCity('city-1')).rejects.toBeInstanceOf(ApiClientError);
  });
});
