"""Export the local OCR draft with source links and explicit review markers."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'mednexus'))
from materials import DATA, load_materials


def main():
    data = load_materials()['histology']
    if not data.get('pages'):
        raise SystemExit('No local histology material has been imported.')
    pages = data['pages']
    lines = [
        '# 组胚复习资料 · OCR优化稿（待校对）', '',
        '来源：用户提供的《组胚复习资料.docx》。原图序号仅用于定位，不是教材页码。', '',
        f'共{len(pages)}张原图；逐行识别结果尚未全部人工审核。'
        '【优先核对】表示低置信度或两次识别存在差异，不代表已确定有错；未标记的文字仍需核对。', '',
        '按图像位置分行，同一行的不同片段以“ ｜ ”分开，不推断表格各栏的语义关联。'
        '手写批注可能混入自动识别文字，不作为标准答案。原OCR与原图均已保留。', '',
    ]
    for page in pages:
        lines += [f"## 原图 {page['image_number']}", '',
                  f"[打开原图](images/{page['image']})", '']
        if page.get('transcription'):
            transcription = page['transcription']
            lines += ['### 对照原图整理', '', transcription['basis'], '']
            for section in transcription['sections']:
                lines += [f"#### {section['heading']}", '', section['text'], '']
                if section.get('warning'):
                    lines += ['> 原资料疑点：' + section['warning'], '']
        lines += ['### 自动识别片段（仍待逐行校对）', '']
        for row in page['reading_rows']:
            cells = []
            for line in row['segments']:
                label = '【本机修订，已标记对图核对，非医学审核】' if line.get('user_reviewed') else (
                    '【本机修订待核对】' if line.get('user_edited') else (
                    '【已对图修字，非医学审核】' if line.get('visually_checked') else (
                    '【优先核对】' if line['needs_review'] else '')))
                text = label + line['text']
                if line.get('source_text') or line.get('previous_text'):
                    text += '〔原识别：' + (line.get('source_text') or line['previous_text']) + '〕'
                alternative = line.get('alternative', {})
                if alternative and alternative['text'] != line['text']:
                    text += '〔未采用的局部识别候选：' + alternative['text'] + '〕'
                cells.append(text)
            lines += [' ｜ '.join(cells), '']
    destination = DATA / '组胚复习资料_OCR优化稿_待校对.md'
    destination.write_text('\n'.join(lines), encoding='utf-8')
    print(destination)


if __name__ == '__main__':
    main()
