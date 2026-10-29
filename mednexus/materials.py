"""Private local course documents: never pretend OCR is verified textbook text."""
import json
from pathlib import Path
import re
import copy
import hashlib
import threading
import time
import sqlite3
from contextlib import contextmanager

DATA = Path(__file__).resolve().parent / 'data' / 'course_materials'
REVIEW_LOCK = threading.RLock()


class ReviewConflict(ValueError):
    """The OCR source or saved revision changed since the editor was opened."""


def line_token(page, index, line):
    raw = json.dumps([page, index, line['text'], line.get('box')], ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def load_reviews():
    path = DATA / 'histology.reviews.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.is_file() else {}


@contextmanager
def review_file_lock():
    """Serialize JSON history updates across local server processes as well as threads."""
    db = sqlite3.connect(DATA / 'histology.reviews.lock.sqlite3', timeout=10, isolation_level=None)
    try:
        db.execute('BEGIN IMMEDIATE')
        yield
        db.execute('COMMIT')
    except BaseException:
        if db.in_transaction:
            db.execute('ROLLBACK')
        raise
    finally:
        db.close()


def save_review(body):
    """Append a local revision; never overwrite the imported OCR or old revisions."""
    page_number, index = body.get('page'), body.get('line')
    revision = body.get('revision')
    if type(page_number) is not int or type(index) is not int or index < 0:
        raise ValueError('原图序号或文字行无效')
    if type(revision) is not int or revision < 0:
        raise ValueError('缺少有效的修订版本，请刷新资料')
    if body.get('action') not in ('save', 'restore'):
        raise ValueError('未知校对操作')
    source = DATA / 'histology.json'
    if not source.is_file():
        raise ValueError('本机没有可校对的组胚资料')
    with REVIEW_LOCK, review_file_lock():
        raw = json.loads(source.read_text(encoding='utf-8'))
        page = next((p for p in raw.get('pages', []) if p['image_number'] == page_number), None)
        if not page or index >= len(page.get('lines', [])):
            raise ValueError('未找到对应的原图文字行')
        token = line_token(page_number, index, page['lines'][index])
        if body.get('token') != token:
            raise ReviewConflict('原始OCR已更新，请重新载入后对照原图再编辑')
        reviews = load_reviews()
        key = f'{page_number}:{index}'
        entry = reviews.get(key, {'token': token, 'history': []})
        # Old history is preserved even if the OCR has subsequently been regenerated.
        history = entry['history']
        if revision != len(history):
            raise ReviewConflict('这行文字已被其他窗口修改，请重新载入后再保存')
        if body['action'] == 'save':
            text = body.get('text')
            if not isinstance(text, str) or not 1 <= len(text.strip()) <= 2000:
                raise ValueError('修订文字需为1至2000个字符')
            if type(body.get('checked')) is not bool:
                raise ValueError('请明确是否已对照原图核对')
            version = {'text': text.strip(), 'checked': body['checked'], 'action': 'save'}
        else:
            version = {'checked': False, 'action': 'restore'}
        history.append({**version, 'token': token, 'created': int(time.time())})
        reviews[key] = {'token': token, 'history': history}
        temporary = DATA / 'histology.reviews.tmp.json'
        temporary.write_text(json.dumps(reviews, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.replace(DATA / 'histology.reviews.json')
        return {'ok': True, 'revision': len(history)}

def load_materials():
    out = {}
    for key in ('syllabus', 'histology'):
        path = DATA / (key + '.json')
        out[key] = json.loads(path.read_text(encoding='utf-8')) if path.is_file() else {}
    if out['histology']:
        out['histology'] = prepare_histology(out['histology'])
    return out

def prepare_histology(data):
    """Keep table cells separate and make uncertain OCR inspectable, not invisible."""
    data = copy.deepcopy(data)
    corrections_path = DATA / 'histology.corrections.json'
    corrections = json.loads(corrections_path.read_text(encoding='utf-8')) if corrections_path.is_file() else []
    transcription_path = DATA / 'histology.transcriptions.json'
    transcriptions = json.loads(transcription_path.read_text(encoding='utf-8')) if transcription_path.is_file() else {}
    reviews = load_reviews()
    for page in data.get('pages', []):
        lines = page.get('lines', [])
        changes = []
        for index, line in enumerate(lines):
            token = line_token(page['image_number'], index, line)
            before = line['text']
            for correction in corrections:
                if correction['page'] == page['image_number'] and correction['before'] == line['text']:
                    line['text'] = correction['after']
                    changes.append(correction)
                    line['source_text'] = before
                    line['visually_checked'] = True
            line['index'] = index
            line['review_token'] = token
            line['base_text'] = line['text']
            entry = reviews.get(f"{page['image_number']}:{index}", {})
            history = entry.get('history', [])
            line['review_revision'] = len(history)
            line['review_history'] = history
            line['user_reviewed'] = False
            line['user_edited'] = False
            if history and history[-1]['token'] == token and history[-1]['action'] == 'save':
                saved = history[-1]
                line['text'] = saved['text']
                line['user_reviewed'] = saved['checked']
                line['user_edited'] = True
                # A source correction is no longer verified once someone edits it.
                line['visually_checked'] = saved['checked']
            line['needs_review'] = not line.get('visually_checked') and (line.get('confidence', 0) < .9 or bool(line.get('alternative')) or line['user_edited'])
        rows = []
        def bounds(line):
            box = line.get('box', [])
            if not box: return None
            return min(p[0] for p in box), min(p[1] for p in box), max(p[0] for p in box), max(p[1] for p in box)
        indexed = [(i, line, bounds(line)) for i, line in enumerate(lines)]
        indexed.sort(key=lambda entry: (entry[2][1], entry[2][0]) if entry[2] else (entry[0]*100,0))
        for index, line, box in indexed:
            cy = (box[1]+box[3])/2 if box else index*100
            height = box[3]-box[1] if box else 20
            # Only near-identical baselines share a display row. No semantic joining.
            if rows and abs(rows[-1]['y']-cy) <= min(rows[-1]['height'],height)*.4:
                rows[-1]['segments'].append({'index':index, **line})
            else:
                rows.append({'y':cy,'height':height,'segments':[{'index':index, **line}]})
        for row in rows:
            row['segments'].sort(key=lambda line: min(p[0] for p in line.get('box', [[0,0]])))
        page['reading_rows'] = rows
        page['text'] = '\n'.join(' ｜ '.join(line['text'] for line in row['segments']) for row in rows)
        page['review_count'] = sum(bool(line['needs_review']) for line in lines)
        page['corrections'] = changes
        transcription = transcriptions.get(str(page['image_number']))
        if transcription:
            page['transcription'] = transcription
            page['text'] = '\n'.join(section['heading'] + '：' + section['text'] +
                ('【原资料疑点：' + section['warning'] + '】' if section.get('warning') else '')
                for section in transcription['sections']) + '\n' + page['text']
    return data

def image_path(name):
    if not re.fullmatch(r'histology-[1-9][0-9]*\.(?:png|jpe?g)', name):
        return None
    path = DATA / 'images' / name
    return path if path.is_file() else None

def review_cards(data):
    def overlap(a, b):
        if not a or not b:
            return 0
        ax1, ay1 = min(p[0] for p in a), min(p[1] for p in a)
        ax2, ay2 = max(p[0] for p in a), max(p[1] for p in a)
        bx1, by1 = min(p[0] for p in b), min(p[1] for p in b)
        bx2, by2 = max(p[0] for p in b), max(p[1] for p in b)
        intersection = max(0, min(ax2, bx2)-max(ax1, bx1)) * max(0, min(ay2, by2)-max(ay1, by1))
        union = (ax2-ax1)*(ay2-ay1) + (bx2-bx1)*(by2-by1) - intersection
        return intersection / union if union > 0 else 0

    cards = []
    for page in data.get('pages', []):
        blocks = []
        for line in page.get('original_lines', page.get('lines', [])):
            text = line['text'].strip()
            if re.match(r'^[1-9]\d{0,2}\s*[.．、](?!\d)', text):
                blocks.append([text])
            elif blocks:
                blocks[-1].append(text)
        for index, block in enumerate(blocks):
            # Original block IDs remain stable after a second OCR pass.
            cue = block[0]
            original_lines = page.get('original_lines')
            selected_lines = []
            if original_lines:
                anchors = [line for line in original_lines if re.match(r'^[1-9]\d{0,2}\s*[.．、](?!\d)', line['text'].strip())]
                anchor = anchors[index]
                if anchor.get('box'):
                    start = min(p[1] for p in anchor['box']) - 5
                    end = min(p[1] for p in anchors[index+1]['box']) - 5 if index+1<len(anchors) else float('inf')
                    selected_lines = [line for line in page.get('lines', []) if line.get('box') and
                        start <= sum(p[1] for p in line['box'])/len(line['box']) < end]
                    if selected_lines:
                        # A marginal annotation may precede the numbered heading.
                        # Match the old heading's geometry instead of taking line 0.
                        heading = max(selected_lines, key=lambda line: overlap(anchor['box'], line['box']))
                        if overlap(anchor['box'], heading['box']) >= .3:
                            cue = heading['text']
                        block = [line['text'] for line in selected_lines]
            cards.append({'id': page['id'] + '-' + str(index), 'cue': cue,
                'text': '\n'.join(block), 'image':page['image'], 'image_number':page['image_number'],
                'lines': selected_lines, 'review_count':sum(line.get('needs_review', False) for line in selected_lines),
                'width':page.get('width'), 'height':page.get('height'),
                'status':'OCR待校对，未配置标准答案', 'source':data.get('source','')})
    return cards
