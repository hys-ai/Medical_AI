"""Second local OCR pass with original output retained; no cloud or inferred answers."""
import argparse
import json
from pathlib import Path
import sys
from difflib import SequenceMatcher

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--deps', required=True)
    args = parser.parse_args()
    sys.path.insert(0, args.deps)
    from rapidocr_onnxruntime import RapidOCR
    from PIL import Image
    folder = Path(__file__).resolve().parents[1] / 'mednexus/data/course_materials'
    source = folder / 'histology.json'
    backup = folder / 'histology.original.json'
    if not backup.exists(): backup.write_bytes(source.read_bytes())
    original = json.loads(backup.read_text(encoding='utf-8'))
    candidate = folder / 'histology.enhanced.json'
    data = json.loads(candidate.read_text(encoding='utf-8')) if candidate.exists() else {**original, 'pages': []}
    done = {p['id'] for p in data['pages']}
    engine = RapidOCR(det_limit_side_len=1280, max_side_len=3200,
                      intra_op_num_threads=4, inter_op_num_threads=1)
    for page in original['pages']:
        if page['id'] in done: continue
        image = folder / 'images' / page['image']
        result, _ = engine(str(image))
        if not result: raise RuntimeError('Empty OCR: ' + str(image))
        with Image.open(image) as im: width, height = im.size
        lines = [{'text': text.strip(), 'confidence': round(float(score), 4), 'box': box}
                 for box, text, score in result]
        data['pages'].append({**page, 'lines': lines, 'text': '\n'.join(x['text'] for x in lines),
            'original_text': page['text'], 'original_lines': page['lines'],
            'width': width, 'height': height, 'ocr_pass': 'local-high-resolution-v2'})
        candidate.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        print('refined',page['image_number'],'/',len(original['pages']), 'lines',len(lines),flush=True)
    data['ocr_revision'] = 2
    for page in data['pages']:
        if page.get('crop_pass'): continue
        image = Image.open(folder / 'images' / page['image']).convert('RGB')
        for line in page['lines']:
            if line['confidence'] >= .9 or len(line['text']) < 2: continue
            box = line['box']
            left=max(0,int(min(p[0] for p in box))-3); top=max(0,int(min(p[1] for p in box))-3)
            right=min(image.width,int(max(p[0] for p in box))+3); bottom=min(image.height,int(max(p[1] for p in box))+3)
            crop=image.crop((left,top,right,bottom))
            crop=crop.resize((crop.width*2,crop.height*2))
            import numpy as np
            results,_=engine(np.array(crop),use_det=False,use_cls=False)
            if not results: continue
            entry=results[0]
            text,score=entry[-2],float(entry[-1])
            if text != line['text']:
                line['alternative']={'text':text,'confidence':round(score,4)}
                similarity=SequenceMatcher(None,text,line['text']).ratio()
                if score>=.94 and score>line['confidence']+.06 and similarity>=.8:
                    line['previous_text']=line['text']
                    line['text']=text
                    line['confidence']=round(score,4)
        image.close()
        page['crop_pass']=True
        page['text']='\n'.join(line['text'] for line in page['lines'])
        candidate.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
        print('crop recognition',page['image_number'],'/',len(data['pages']),flush=True)
    data['ocr_note'] = '本地高分辨率重新识别；原OCR保留。置信度仅代表识别模型信心，不是医学准确率。'
    candidate.write_text(json.dumps(data, ensure_ascii=False, indent=2),encoding='utf-8')
    temporary = folder / 'histology.tmp.json'
    temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    temporary.replace(source)
    print('Published enhanced OCR with original backup retained.',flush=True)

if __name__ == '__main__': main()
