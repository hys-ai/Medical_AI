"""Import user-supplied local DOCX materials without publishing their contents."""
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

W = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
     'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'mednexus' / 'data' / 'course_materials'

def save(name, value):
    (DEST / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def import_syllabus(path):
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read('word/document.xml'))
    rows = [''.join(t.text or '' for t in p.findall('.//w:t', W)).strip()
            for p in root.findall('.//w:p', W)]
    chapter, category, items, chapters = '绪论', '知识目标', [], []
    active = False
    for number, text in enumerate(rows, 1):
        if text == '绪论': active = True
        if not active: continue
        if text.startswith('四、实践环节'): break
        if text == '绪论' or re.match(r'^第[一二三四五六七八九十]+章', text):
            chapter, category = text, '知识目标'
            chapters.append(chapter)
            continue
        if re.match(r'^(?:[123][.．、]\s*)?(?:知识|能力|思政)目标', text):
            category = next(k for k in ['知识目标','能力目标','思政目标'] if k in text)
            continue
        if not text: continue
        level = '掌握' if '掌握' in text else '了解' if '了解' in text else '未单列'
        items.append({'id': 'syllabus-' + str(number), 'chapter': chapter,
            'category': category, 'level': level, 'text': text,
            'locator': '文档段落 ' + str(number), 'source': path.name})
    save('syllabus.json', {'source':path.name, 'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
         'chapters':chapters,'items':items,'note':'用户提供的课程大纲，要求分掌握/了解两级；段落编号不是教材页码。'})
    print('syllabus entries:', len(items), flush=True)

def import_histology(path, deps):
    sys.path.insert(0, str(deps))
    from rapidocr_onnxruntime import RapidOCR
    engine = RapidOCR()
    images = DEST / 'images'; images.mkdir(exist_ok=True)
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read('word/document.xml'))
        rels = {n.attrib['Id']: n.attrib['Target'] for n in ET.fromstring(z.read('word/_rels/document.xml.rels'))}
        ids = [n.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed') for n in root.findall('.//a:blip',W)]
        targets = list(dict.fromkeys(rels[i] for i in ids if i in rels and rels[i].startswith('media/')))
        pages=[]
        for number, target in enumerate(targets,1):
            filename = 'histology-' + str(number) + Path(target).suffix.lower()
            image = images / filename
            image.write_bytes(z.read('word/' + target))
            result, _ = engine(str(image))
            lines=[{'text':text, 'confidence':round(float(score),4), 'box':box} for box,text,score in result or []]
            pages.append({'id':'histology-'+str(number),'image':filename,'image_number':number,
                          'lines':lines,'text':'\n'.join(line['text'] for line in lines),
                          'source':path.name,'status':'OCR待校对'})
            save('histology.json',{'source':path.name,'pages':pages,'total_images':len(targets),
                  'complete':number==len(targets),'note':'原图顺序号不是教材页码；OCR仅供检索，答案以原图为准。'})
            print('histology image',number,'/',len(targets),'lines',len(lines),flush=True)

if __name__ == '__main__':
    DEST.mkdir(parents=True,exist_ok=True)
    folder = Path(sys.argv[1])
    import_syllabus(folder / '系统解剖学-课程大纲Systematic Anatomy - Course Syllabus.docx')
    import_histology(folder / '组胚复习资料.docx', Path(sys.argv[2]))
