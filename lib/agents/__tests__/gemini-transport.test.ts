import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { geminiJson } from '../gemini';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function response(text: string, status = 'completed') {
  vi.stubEnv('GEMINI_API_KEY','test-key');
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({status,steps:[{type:'thought'},{type:'model_output',content:[{type:'text',text}]}]})));
  vi.stubGlobal('fetch',fetcher); return fetcher;
}
it('uses JSON interactions without the rejected nested response schema',async()=>{
  const fetcher=response('{"value":3}');
  expect(await geminiJson({model:'test-model',system:'test',input:{},schema:z.object({value:z.number()}).strict()})).toEqual({value:3});
  const body=JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.response_format.mime_type).toBe('application/json');
  expect(body.response_format.schema.properties.value.type).toBe('number');
  expect(body.response_format.schema.$schema).toBeUndefined();
  expect(body.store).toBe(false);
  expect(body.system_instruction).toContain('"value"');
});
it('rejects output that violates the local schema',async()=>{
  response('{"value":"not a number"}');
  await expect(geminiJson({model:'test-model',system:'test',input:{},schema:z.object({value:z.number()})})).rejects.toThrow('invalid structured JSON');
});
it('rejects incomplete interactions',async()=>{
  response('{"value":3}','in_progress');
  await expect(geminiJson({model:'test-model',system:'test',input:{},schema:z.object({value:z.number()})})).rejects.toThrow();
});
