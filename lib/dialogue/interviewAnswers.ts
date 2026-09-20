/**
 * Chooses who writes each interviewee's answer:
 *
 *   1. Gemini, live, from their Nemotron persona + the selected option + what it changes for them
 *   2. NVIDIA Nemotron fills any missing answers after Gemini
 *   3. (the caller) an answer built from the persona's own profile, for anyone still missing
 *
 * Returns a map of residentId -> answer + which model wrote it. Every provider's output has already
 * been validated, so anything in the map is safe to put in the anchor's mouth.
 */
import { interviewDialogue } from './interviewDialogue';
import { geminiInterviewAnswers, type InterviewOption, type InterviewSubject } from './geminiInterview';

export type AnswerSource = 'gemini' | 'nemotron';
export interface GeneratedAnswer { answer: string; source: AnswerSource }

export interface AnswerProviders {
  gemini: (subjects: InterviewSubject[], option: InterviewOption) => Promise<{ residentId: string; answer: string }[] | null>;
  nemotron: (people: Parameters<typeof interviewDialogue>[0], option: unknown) => Promise<{ residentId: string; answer: string }[] | null>;
}

const defaultProviders: AnswerProviders = {
  gemini: (subjects, option) => geminiInterviewAnswers(subjects, option),
  nemotron: (people, option) => interviewDialogue(people, option),
};

export async function interviewAnswers(
  subjects: InterviewSubject[],
  option: InterviewOption,
  providers: AnswerProviders = defaultProviders,
): Promise<Map<string, GeneratedAnswer>> {
  const answers = new Map<string, GeneratedAnswer>();

  const accept = (items: { residentId: string; answer: string }[] | null, source: AnswerSource) => {
    for (const item of items ?? []) {
      if (!subjects.some(s => s.residentId === item.residentId) || answers.has(item.residentId)) continue;
      if ([...answers.values()].some(saved => saved.answer.trim().toLowerCase() === item.answer.trim().toLowerCase())) continue;
      answers.set(item.residentId, { answer: item.answer, source });
    }
  };
  try { accept(await providers.gemini(subjects, option), 'gemini'); } catch { /* Continue to the next writer. */ }
  if (answers.size === subjects.length) return answers;

  const people = subjects.map(subject => ({
    resident: { id: subject.residentId },
    persona: subject.persona,
    district: subject.neighborhood,
    housing: subject.housing,
    mood: subject.mood,
    reason: subject.feeling,
    changes: subject.changes,
  }));
  try { accept(await providers.nemotron(people, option), 'nemotron'); } catch { /* The caller has a personal scripted answer. */ }
  return answers;
}
