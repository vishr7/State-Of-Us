import { expect, it } from 'vitest';
import { ACTION_MAPPINGS } from '../actionMappings';
import { bindExecutableActions } from '../bindExecutableActions';
import { catalogChoice } from '../../gameplay/catalogChoices';
import type { Policy } from '../../types/database';
function fixture(index: number) {
 const mapping=ACTION_MAPPINGS[index];
 const policy={id:mapping.policyId,name:mapping.policyName,description:mapping.aliases[1],category:mapping.policyCategory,upfront_cost:0,recurring_cost:0,effects:{version:1}} as Policy;
 const candidate=catalogChoice(policy);
 candidate.actionKey=mapping.actionKey;
 candidate.category=mapping.categories[0] as typeof candidate.category;
 candidate.proposedAction=mapping.aliases[0];
 candidate.claims.proposedAction={text:mapping.aliases[0],evidence:[{sourceSignalId:'source',evidenceIndex:0,quote:mapping.aliases[0]}]};
 return {policy,candidate};
}
it.each(ACTION_MAPPINGS.map((m,i)=>[m.actionKey,i] as const))('binds the authored %s action',(_,index)=>{
 const {policy,candidate}=fixture(index);
 expect(bindExecutableActions([candidate],[policy])[0]).toMatchObject({executable:true,policyId:policy.id,bindingVersion:'authored-actions-v2'});
});
it('covers all six categories without duplicate action keys or policy IDs',()=>{
 expect(new Set(ACTION_MAPPINGS.map(m=>m.policyCategory)).size).toBe(6);
 expect(new Set(ACTION_MAPPINGS.map(m=>m.actionKey)).size).toBe(18);
 expect(new Set(ACTION_MAPPINGS.map(m=>m.policyId)).size).toBe(18);
});
it('rejects unsupported actions, negation, wrong categories and changed catalog identity',()=>{
 const {policy,candidate}=fixture(0);
 for(const changed of [ {...candidate,actionKey:'invented'}, {...candidate,category:'business' as const}, {...candidate,proposedAction:'Build a stadium'}, {...candidate,claims:{...candidate.claims,proposedAction:{text:candidate.proposedAction!,evidence:[{sourceSignalId:'source',evidenceIndex:0,quote:`Reject ${candidate.proposedAction}`} ]}}} ]) expect(bindExecutableActions([changed],[policy])[0].executable).toBe(false);
 expect(bindExecutableActions([candidate],[{...policy,name:'Changed'}])[0].executable).toBe(false);
});
