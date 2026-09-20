import { expect, it } from 'vitest';
import { catalogChoice, fillDailyChoices, validCatalogChoice } from '../catalogChoices';
import type { Policy } from '../../types/database';
const policies = ['housing','transit','tax','safety','business','environment'].map((category,i) => ({id:`99999999-9999-4999-8999-00000000000${i+1}`,name:`Policy ${i}`,description:`Authored action ${i}`,category,upfront_cost:100,recurring_cost:0,effects:{version:1}} as Policy));
it('provides five distinct executable authored choices with category diversity',()=>{
 const choices=fillDailyChoices([],policies,0);
 expect(choices).toHaveLength(5);
 expect(new Set(choices.map(c=>c.policyId)).size).toBe(5);
 expect(choices.every(c=>validCatalogChoice(c,policies.find(p=>p.id===c.policyId)!))).toBe(true);
});
it('rejects tampered catalog candidates and changed authored policies',()=>{
 const choice=catalogChoice(policies[0]);
 expect(validCatalogChoice({...choice,policyId:policies[1].id},policies[1])).toBe(false);
 expect(validCatalogChoice({...choice,title:'Fake news'},policies[0])).toBe(false);
 expect(validCatalogChoice(choice,{...policies[0],description:'Changed'})).toBe(false);
});
