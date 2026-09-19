"""Import 100 adult synthetic personas; no browser/runtime Hugging Face requests.
Uses the public Dataset Viewer API by default. --backend datasets uses HF streaming.
Optional authentication: HF_TOKEN environment variable or `hf auth login` for datasets.
"""
import argparse, ast, datetime, json, os, re, urllib.parse, urllib.request
from pathlib import Path

DATASET = 'nvidia/Nemotron-Personas-USA'
OUTPUT = Path(__file__).resolve().parents[1] / 'data/personas/nemotron-usa.json'

def rows(backend):
    if backend == 'datasets':
        from datasets import load_dataset
        yield from load_dataset(DATASET, split='train', streaming=True, token=os.getenv('HF_TOKEN') or None)
        return
    for offset in range(0, 10000, 100):
        query = urllib.parse.urlencode(dict(dataset=DATASET, config='default', split='train', offset=offset, length=100))
        headers = {'Authorization': 'Bearer ' + os.environ['HF_TOKEN']} if os.getenv('HF_TOKEN') else {}
        request = urllib.request.Request('https://datasets-server.huggingface.co/rows?' + query, headers=headers)
        with urllib.request.urlopen(request, timeout=60) as response:
            batch = json.load(response)['rows']
        if not batch: return
        for entry in batch:
            if not entry.get('truncated_cells'): yield entry['row']

def list_field(value):
    if isinstance(value, str):
        try: value = ast.literal_eval(value)
        except (ValueError, SyntaxError): value = []
    return [str(item) for item in value][:6] if isinstance(value, list) else []

def normalize(row, index):
    bio = str(row.get('persona') or '')
    prefix = re.split(r',|\s+(?:is|has|works|combines|balances|channels|fuses|brings|embraces|enjoys|loves|thrives)\b', bio, maxsplit=1)[0]
    match = re.match(r"^([A-ZÀ-ÖØ-Þ][\w’'.-]+(?: [A-ZÀ-ÖØ-Þ][\w’'.-]+){1,3})(?=[ ,])", bio)
    name = match.group(1) if match else (prefix if 1 <= len(prefix.split()) <= 4 and len(prefix) < 55 else f'Resident {index + 1:03}')
    return dict(uuid=row['uuid'], name=name, nameDerived=True, age=row['age'], occupation=row.get('occupation',''), education=row.get('education_level',''), sourceCity=row.get('city',''), sourceState=row.get('state',''), biography=bio, interests=list_field(row.get('hobbies_and_interests_list')), skills=list_field(row.get('skills_and_expertise_list')))

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--backend', choices=['viewer', 'datasets'], default='viewer'); args=parser.parse_args()
    people=[]; seen=set()
    for row in rows(args.backend):
        if not isinstance(row.get('age'), int) or row['age'] < 18 or not row.get('uuid') or row['uuid'] in seen: continue
        people.append(normalize(row, len(people))); seen.add(row['uuid'])
        if len(people) == 100: break
    if len(people) != 100: raise RuntimeError(f'Expected 100 unique adults, received {len(people)}; existing file left unchanged')
    result=dict(dataset=DATASET, source='https://huggingface.co/datasets/' + DATASET, license='CC-BY-4.0', importedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), sampling='First 100 unique adults in train order; convenience sample, not representative of Pittsburgh or the USA.', residents=people)
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    temp=OUTPUT.with_suffix('.tmp');temp.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');temp.replace(OUTPUT)
    print(f'Imported {len(people)} synthetic personas to {OUTPUT}')
if __name__ == '__main__': main()
