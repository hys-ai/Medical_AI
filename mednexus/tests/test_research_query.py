"""Explicit focus suggestions with synthetic prompts, no network or model."""
import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from knowledge import CONCEPTS, CONCEPT_MAP
from research_query import build_query_proposal


class ResearchQueryTests(unittest.TestCase):
    def proposal(self, question, cid='oculomotor'):
        return build_query_proposal(CONCEPT_MAP[cid], question)

    def test_all_ten_authored_questions_and_empty_input_keep_their_exact_templates(self):
        for concept in CONCEPTS:
            for question in ('', '   ', concept['research'], ' ' + concept['research'] + ' '):
                with self.subTest(concept=concept['id'], question=question):
                    result = build_query_proposal(concept, question)
                    self.assertEqual(result['query'], concept['query'])
                    self.assertEqual(result['mode'], 'template')
                    self.assertIsNone(result['focus'])
                    self.assertTrue(result['fallback_reason'])

    def test_recovery_suggestion_keeps_the_authored_subject_and_explains_unconverted_comparison(self):
        result = self.proposal('动眼神经损伤恢复是否存在差异？')
        self.assertEqual(result['mode'], 'focused')
        self.assertEqual(result['focus']['id'], 'recovery')
        self.assertEqual(result['query'], result['subject'] + ' AND recovery[Title/Abstract]')
        self.assertIn('"Oculomotor Nerve Diseases"[MeSH Terms] OR "third nerve palsy"[Title/Abstract]', result['subject'])
        self.assertNotIn('pupil[Title/Abstract]', result['query'])
        self.assertEqual(result['original_query'], CONCEPT_MAP['oculomotor']['query'])
        self.assertIn('比较对象', result['mapping'])
        self.assertIn('不是逐句翻译', result['notice'])

    def test_supported_single_focus_mappings_are_literal_and_retain_the_subject(self):
        cases = [('病因', 'etiology', '(etiology[Title/Abstract] OR aetiology[Title/Abstract])'),
                 ('预后', 'prognosis', 'prognosis[Title/Abstract]'),
                 ('机制', 'mechanism', 'mechanism[Title/Abstract]'),
                 ('结局指标', 'outcome', '("outcome measure"[Title/Abstract] OR "outcome measures"[Title/Abstract])')]
        for word, focus, expression in cases:
            with self.subTest(word=word):
                result = self.proposal('动眼神经的' + word + '有哪些研究证据？')
                self.assertEqual(result['mode'], 'focused')
                self.assertEqual(result['focus']['id'], focus)
                self.assertEqual(result['query'], result['subject'] + ' AND ' + expression)
                self.assertEqual(result['matches'][0]['term'], word)

    def test_a_single_focus_works_for_each_authored_subject_without_borrowing_other_conditions(self):
        for concept in CONCEPTS:
            with self.subTest(concept=concept['id']):
                result = build_query_proposal(concept, concept['terms'][0] + '的恢复有哪些研究？')
                self.assertEqual(result['mode'], 'focused')
                self.assertTrue(result['query'].endswith(' AND recovery[Title/Abstract]'))
                self.assertTrue(result['subject'])

    def test_traditional_and_english_focus_words_are_preserved_as_the_actual_match(self):
        result = self.proposal('動眼神經損傷的恢復有何研究？')
        self.assertEqual(result['focus']['id'], 'recovery')
        self.assertEqual(result['matches'][0]['term'], '恢復')
        result = self.proposal('oculomotor prognosis evidence')
        self.assertEqual(result['focus']['id'], 'prognosis')
        self.assertEqual(result['matches'][0]['term'], 'prognosis')

    def test_cross_subject_comparison_keeps_selected_concept_and_full_authored_template(self):
        for question, cid in [('上斜肌与外直肌损伤的恢复差异？', 'trochlear'),
                              ('动眼神经和展神经的恢复是否不同？', 'oculomotor'),
                              ('角膜反射与瞳孔反射的机制是否不同？', 'corneal')]:
            with self.subTest(question=question):
                result = self.proposal(question, cid)
                self.assertEqual(result['query'], CONCEPT_MAP[cid]['query'])
                self.assertEqual(result['mode'], 'template')
                self.assertIn('其他', result['fallback_reason'])

    def test_multiple_supported_focuses_do_not_create_an_unreviewed_intersection(self):
        for question in ('动眼神经恢复与病因的研究？', '动眼神经恢复机制是什么？',
                         '动眼神经预后与功能评价有何关系？'):
            with self.subTest(question=question):
                result = self.proposal(question)
                self.assertEqual(result['query'], CONCEPT_MAP['oculomotor']['query'])
                self.assertEqual(result['mode'], 'template')
                self.assertIn('多个', result['fallback_reason'])

    def test_topic_negation_or_indecision_does_not_select_the_negated_focus(self):
        for question in ('动眼神经不要讨论恢复', '动眼神经不研究预后', '动眼神经不确定要查恢复',
                         '动眼神经不是病因研究', 'oculomotor not prognosis', '動眼神經不要討論機制'):
            with self.subTest(question=question):
                result = self.proposal(question)
                self.assertEqual(result['mode'], 'template')
                self.assertEqual(result['query'], CONCEPT_MAP['oculomotor']['query'])
                self.assertIn('否定', result['fallback_reason'])

    def test_question_words_do_not_turn_a_positive_research_focus_into_negation(self):
        for question in ('动眼神经恢复是否有差异？', '动眼神经机制尚不明确，有什么研究证据？'):
            with self.subTest(question=question):
                self.assertEqual(self.proposal(question)['mode'], 'focused')

    def test_unsupported_or_generic_terms_do_not_claim_a_focus_translation(self):
        for question in ('动眼神经有哪些前沿研究？', '动眼神经有哪些不同？', '动眼神经的作用是什么？'):
            with self.subTest(question=question):
                result = self.proposal(question)
                self.assertEqual(result['mode'], 'template')
                self.assertEqual(result['matches'], [])
                self.assertEqual(result['query'], CONCEPT_MAP['oculomotor']['query'])

    def test_subject_extraction_respects_the_authored_parentheses_and_quoted_and(self):
        concept = {**CONCEPT_MAP['oculomotor'], 'query': '("one AND two"[Title] OR other[Title]) AND old[Title/Abstract]'}
        result = build_query_proposal(concept, '动眼神经恢复有何研究？')
        self.assertEqual(result['query'], '("one AND two"[Title] OR other[Title]) AND recovery[Title/Abstract]')
        malformed = {**concept, 'query': '("one"[Title] AND old[Title/Abstract]'}
        result = build_query_proposal(malformed, '动眼神经恢复有何研究？')
        self.assertEqual(result['mode'], 'template')
        self.assertEqual(result['query'], malformed['query'])

    def test_input_is_unchanged_and_invalid_shapes_are_not_silently_coerced(self):
        concept = copy.deepcopy(CONCEPT_MAP['oculomotor'])
        before = copy.deepcopy(concept)
        build_query_proposal(concept, '动眼神经恢复有哪些研究？')
        self.assertEqual(concept, before)
        for invalid in (None, [], 'text', {'query': 1}):
            with self.subTest(concept=invalid), self.assertRaises(ValueError):
                build_query_proposal(invalid, '恢复')
        for invalid in (None, [], 42):
            with self.subTest(question=invalid), self.assertRaises(ValueError):
                build_query_proposal(concept, invalid)
        unknown = {**concept, 'id': 'unknown'}
        result = build_query_proposal(unknown, '动眼神经恢复有哪些研究？')
        self.assertEqual(result['mode'], 'template')
        self.assertEqual(result['query'], unknown['query'])
        self.assertIn('未知', result['fallback_reason'])


if __name__ == '__main__':
    unittest.main()
