"""Synthetic abstracts test faithful grouping, not medical findings."""
import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from reading import build_reading


def paper(paragraphs):
    return {'pmid': '123456', 'title': 'Synthetic test paper', 'journal': 'Synthetic Journal',
            'year': '2025', 'authors': ['Fixture A'], 'types': ['Review'], 'evidence': '综述',
            'url': 'https://pubmed.ncbi.nlm.nih.gov/123456/', 'abstract': paragraphs}


def part(text, label='', category=''):
    return {'text': text, 'label': label, 'category': category}


def by_id(result):
    return {section['id']: section for section in result['sections']}


class ReadingTests(unittest.TestCase):
    def test_standard_categories_group_original_text_even_without_labels(self):
        paragraphs = [part('Synthetic background.', category='BACKGROUND'),
                      part('Synthetic objective.', category='OBJECTIVE'),
                      part('Synthetic methods with no inferred design.', category='METHODS'),
                      part('Synthetic result.', category='RESULTS'),
                      part('Synthetic conclusion.', category='CONCLUSIONS')]
        result = build_reading(paper(paragraphs), '原研究疑问', 'oculomotor')
        groups = by_id(result)
        self.assertEqual([p['text'] for p in groups['research_question']['excerpts']],
                         ['Synthetic background.', 'Synthetic objective.'])
        self.assertEqual(groups['methods']['excerpts'][0]['text'], paragraphs[2]['text'])
        self.assertEqual(groups['results']['excerpts'][0]['category'], 'RESULTS')
        self.assertEqual([p['text'] for p in result['evidence']], ['Synthetic result.', 'Synthetic conclusion.'])
        self.assertTrue(groups['limitations']['missing_notice'])
        self.assertFalse(result['excerpt_limits']['truncated'])

    def test_recognized_category_has_priority_over_a_conflicting_label(self):
        groups = by_id(build_reading(paper([part('Exact original paragraph.', label='RESULTS', category='METHODS')]), '疑问'))
        self.assertEqual(groups['methods']['excerpts'][0]['text'], 'Exact original paragraph.')
        self.assertEqual(groups['results']['excerpts'], [])

    def test_exact_normalized_labels_fill_unassigned_or_missing_categories(self):
        paragraphs = [part('Synthetic methods.', label='  2. materials_and_methods: '),
                      part('Synthetic finding.', label=' Findings ', category='UNASSIGNED'),
                      part('Synthetic limitation.', label='Study limitations', category='UNASSIGNED')]
        groups = by_id(build_reading(paper(paragraphs), '疑问'))
        self.assertEqual(groups['methods']['excerpts'][0]['text'], paragraphs[0]['text'])
        self.assertEqual(groups['results']['excerpts'][0]['text'], paragraphs[1]['text'])
        self.assertEqual(groups['limitations']['excerpts'][0]['text'], paragraphs[2]['text'])

    def test_mixed_or_unknown_labels_are_not_mistaken_for_results_or_conclusions(self):
        paragraphs = [part('Synthetic mixed paragraph.', label='Conclusions and limitations'),
                      part('Synthetic mixed methods.', label='Methods / Results'),
                      part('Synthetic unexpected heading.', label='Not results'),
                      part('Synthetic no heading.')]
        result = build_reading(paper(paragraphs), '疑问')
        groups = by_id(result)
        self.assertEqual(len(groups['unclassified']['excerpts']), 4)
        self.assertEqual(result['evidence'], [])
        self.assertIn('未分类', groups['methods']['missing_notice'])
        self.assertEqual(groups['conclusions']['excerpts'], [])

    def test_unstructured_original_is_visible_without_guessing_a_design_or_conclusion(self):
        text = 'Unstructured synthetic text with 13 records and an RCT mention; no section is inferred.'
        result = build_reading(paper([part(text)]), '未绑定章节的疑问')
        self.assertIsNone(result['concept'])
        self.assertEqual(result['question'], '未绑定章节的疑问')
        self.assertEqual(by_id(result)['unclassified']['excerpts'][0]['text'], text)
        self.assertEqual(by_id(result)['methods']['excerpts'], [])
        self.assertEqual(result['evidence'], [])
        self.assertNotIn('课程知识', result['relationship'])

    def test_absent_empty_and_invalid_abstracts_do_not_invent_any_contents(self):
        for abstract in (None, [], '', 'Not an array', {}, [None, {}, {'text': None}, {'text': '   '}]):
            with self.subTest(abstract=abstract):
                result = build_reading(paper(abstract), '疑问')
                self.assertFalse(result['abstract_available'])
                self.assertEqual(result['evidence'], [])
                self.assertTrue(all(section['excerpts'] == [] for section in result['sections']))
                self.assertTrue(all('未提供可阅读的摘要' in section['missing_notice'] for section in result['sections']))
                self.assertEqual(result['excerpt_limits']['shown_chars'], 0)

    def test_bounded_fair_selection_keeps_methods_results_and_limitations_when_background_is_long(self):
        paragraphs = [part('B' * 900, category='BACKGROUND') for _ in range(20)]
        paragraphs.extend([part('M' * 900, category='METHODS'), part('R' * 900, category='RESULTS'),
                           part('C' * 900, category='CONCLUSIONS'), part('L' * 900, label='LIMITATIONS'),
                           part('U' * 900)])
        result = build_reading(paper(paragraphs), '疑问')
        groups = by_id(result)
        for section in ('research_question', 'methods', 'results', 'conclusions', 'limitations', 'unclassified'):
            self.assertTrue(groups[section]['excerpts'], section)
        excerpts = [p for group in result['sections'] for p in group['excerpts']]
        self.assertEqual(len(excerpts), 12)
        self.assertLessEqual(sum(len(p['text']) for p in excerpts), 1500)
        self.assertTrue(all(0 < len(p['text']) <= 300 for p in excerpts))
        self.assertTrue(all(p['truncated'] for p in excerpts))
        self.assertEqual(groups['research_question']['omitted_count'], 13)
        self.assertEqual(result['excerpt_limits']['omitted_paragraphs'], 13)
        self.assertEqual(result['excerpt_limits']['available_paragraphs'], 25)
        self.assertTrue(result['excerpt_limits']['truncated'])
        self.assertEqual(result['excerpt_limits']['shown_chars'], sum(len(p['text']) for p in excerpts))

    def test_excerpt_is_always_a_contiguous_original_prefix_with_an_explicit_truncation_flag(self):
        original = '  Synthetic original.\nNo whitespace inside is changed. ' + 'x' * 500 + '  '
        result = build_reading(paper([part(original, label='RESULTS')]), '疑问')
        excerpt = by_id(result)['results']['excerpts'][0]
        self.assertEqual(excerpt['text'], original.strip()[:300])
        self.assertIn(excerpt['text'], original)
        self.assertTrue(excerpt['truncated'])
        self.assertNotIn('…', excerpt['text'])
        self.assertEqual(result['excerpt_limits']['shown_chars'], 300)

    def test_short_paragraphs_do_not_make_other_groups_disappear_and_order_is_preserved(self):
        paragraphs = [part('First method.', category='METHODS'), part('Second method.', category='METHODS'),
                      part('R' * 400, category='RESULTS'), part('C' * 400, category='CONCLUSIONS')]
        result = build_reading(paper(paragraphs), '疑问')
        groups = by_id(result)
        self.assertEqual([p['text'] for p in groups['methods']['excerpts']], ['First method.', 'Second method.'])
        self.assertEqual(len(groups['results']['excerpts'][0]['text']), 300)
        self.assertEqual(len(groups['conclusions']['excerpts'][0]['text']), 300)

    def test_metadata_does_not_leak_full_abstract_or_private_cache_fields_and_input_is_unchanged(self):
        original = paper([part('x' * 2000, label='RESULTS')])
        original['private_cache_marker'] = 'PRIVATE_SYNTHETIC_CACHE'
        before = copy.deepcopy(original)
        result = build_reading(original, ' 原疑问 ', 'light')
        self.assertEqual(original, before)
        self.assertEqual(result['paper']['pmid'], original['pmid'])
        self.assertEqual(result['paper']['authors'], ['Fixture A'])
        self.assertNotIn('abstract', result['paper'])
        self.assertNotIn('private_cache_marker', result['paper'])
        self.assertEqual(result['question'], '原疑问')


if __name__ == '__main__':
    unittest.main()
