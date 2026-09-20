import { create } from 'zustand';
import type { GeneratedEventCandidate } from '@/lib/signals/generated-events';

export function addsBusService(title: string) {
  return /busway|bus lane|bus rapid transit|expand transit|(?:add|new|expand|increase|extend).*bus|bus.*(?:service|frequency|expansion)/i.test(title)
    && !/cancel|remove|cut|reject/i.test(title);
}
export const useTransitAnimation = create<{
  services: string[]; spotlight: string | null;
}>(() => ({ services: [], spotlight: null }));

export async function playTransit(project: GeneratedEventCandidate, dayKey: string) {
  if (!addsBusService(`${project.title} ${project.actionKey.replaceAll('_', ' ')}`)) return;
  const id = `${dayKey}:${project.id}`;
  if (useTransitAnimation.getState().services.includes(id)) return;
  useTransitAnimation.setState(s => ({ services: [...s.services, id], spotlight: id }));
  await new Promise(resolve => setTimeout(resolve, 3000));
  useTransitAnimation.setState({ spotlight: null });
}
