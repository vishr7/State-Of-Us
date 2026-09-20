import { afterEach, describe, expect, it, vi } from 'vitest';
import { insightRequestSchema, parseCommentary, type InsightFacts } from '../contracts';
import { fallbackCommentary, generateInsight } from '../nemotron';
const facts: InsightFacts = {
  cityName:'Test city', turn:1, mode:'briefing', current:{ treasury:100,happiness:50,approval:40,averageRent:10,revenue:20,expenses:10 }, previous:null,
  policies:[],scenarios:[],neighborhoods:[],residents:[{id:'r1',name:'Resident',occupation:'teacher',neighborhood:'Oakland',income:50000,housing:'renter',priorities:['housing'],neighborhoodHappiness:50}],
};
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('Nemotron boundary',()=>{
  it('requires two distinct policies for a comparison',()=>{
    expect(insightRequestSchema.safeParse({mode:'compare',policyIds:[]}).success).toBe(false);
    expect(insightRequestSchema.safeParse({mode:'compare',policyIds:['77777777-7777-4777-8777-000000000001','77777777-7777-4777-8777-000000000001']}).success).toBe(false);
  });
  it('rejects mutation fields in requests and model output',()=>{
    expect(insightRequestSchema.safeParse({mode:'briefing',treasury:900}).success).toBe(false);
    expect(()=>parseCommentary(JSON.stringify({...fallbackCommentary(facts),happiness:100}),facts)).toThrow();
  });
  it('rejects invented resident identities',()=>{
    const data=fallbackCommentary(facts);data.residents[0].residentId='invented';
    expect(()=>parseCommentary(JSON.stringify(data),facts)).toThrow();
  });
  it('parses fenced output without exposing reasoning traces',()=>{
    const data=fallbackCommentary(facts);
    expect(parseCommentary('<think>private reasoning</think>```json\n'+JSON.stringify(data)+'\n```',facts)).toEqual(data);
  });
  it('falls back explicitly without an API key and preserves measured facts',async()=>{
    vi.stubEnv('NVIDIA_API_KEY','');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const result=await generateInsight(facts);expect(result.source).toBe('scripted');expect(result.facts.current.happiness).toBe(50);expect(fetch).not.toHaveBeenCalled();
  });
  it('handles upstream errors without failing the simulation',async()=>{
    vi.stubEnv('NVIDIA_API_KEY','test');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:429})));
    const result=await generateInsight({...facts,turn:2});expect(result.source).toBe('scripted');expect(result.notice).toMatch(/unavailable/);
  });
  it('accepts validated narration without accepting model-written metrics',async()=>{
    vi.stubEnv('NVIDIA_API_KEY','test');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(fallbackCommentary(facts))}}]}))));
    const result=await generateInsight({...facts,turn:3});expect(result.source).toBe('nemotron');expect(result.facts.current).toEqual(facts.current);
  });
});
