import { residentIdentity } from '@/lib/dialogue/residentIdentity';
export default function ResidentPortrait({ id, age = 35 }: { id: string; age?: number }) {
  const { seed, name } = residentIdentity(id);
  const skin = ['#efc3a0','#b77850','#845137','#d5a27d'][seed % 4];
  const shirt = ['#347b88','#a95443','#526caf','#947647','#5b8057'][Math.floor(seed / 7) % 5];
  const hair = age > 60 ? '#bbc0c3' : ['#282323','#68432b','#b68b54'][Math.floor(seed / 11) % 3];
  return <svg viewBox="0 0 200 260" role="img" aria-label={`Illustrated portrait of ${name}`}>
    <rect width="200" height="260" rx="24" fill="#17364a" />
    <circle cx="100" cy="95" r="72" fill="#244a5c" />
    <path d="M20 260v-40q0-55 80-55t80 55v40" fill={shirt} />
    <path d="M80 145v35q20 25 40 0v-35" fill={skin} />
    <ellipse cx="100" cy="101" rx="46" ry="60" fill={skin} />
    <path d={seed % 2 ? 'M52 110V68q0-48 48-48t48 48v50l-15-57q-42 18-65 0z' : 'M52 90V60q13-46 55-36q48 0 42 68l-18-40q-24 22-65 8z'} fill={hair} />
    <path d="M72 93h17m22 0h17" stroke={hair} strokeWidth="4" strokeLinecap="round" />
    <circle cx="82" cy="103" r="3" fill="#29303b" /><circle cx="119" cy="103" r="3" fill="#29303b" />
    <path d="M99 104l-4 20h9M85 139q15 8 30-1" fill="none" stroke="#824f44" strokeWidth="3" strokeLinecap="round" />
    {seed % 3 === 0 && <g fill="none" stroke="#263443" strokeWidth="3"><rect x="65" y="94" width="30" height="22" rx="6" /><rect x="106" y="94" width="30" height="22" rx="6" /><path d="M95 102h11" /></g>}
    <path d="M78 175l22 26 23-26" fill="none" stroke="#fff8" strokeWidth="4" />
  </svg>;
}
