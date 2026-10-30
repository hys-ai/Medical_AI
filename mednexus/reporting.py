"""Point-level audit of saved answers; no score or mastery is inferred here.

Callers must pass attempts for the current learner only. Question identities are
kept separate, so answering a transfer question cannot erase a diagnostic error.
Only an independent correct answer to the same question/point clears that error.
"""
import json
import math


RECENT_LIMIT = 30
REVIEW_LIMIT = 20
NOTICE = ('按保存顺序核对同一道题的作答要点；其他题答对不清除旧题错点，辅助答对仍待独立复核。'
          '复测使用题库中同一题型，可能重现相同题目，不能视为新题或独立迁移验证。'
          '题干来自当前题库对应题号，评分要点来自当次记录；首次与最近分数不是教学效果实验。')


def _attempt_view(row, question_map):
    """Use saved rubric fields, never a client-authored score or new answer key."""
    question_id = row.get('question')
    known = question_map.get(question_id)
    if not known:
        return None
    concept, question = known
    if row.get('concept') != concept['id'] or row.get('kind') != question['kind']:
        return None
    try:
        payload = row['payload']
        payload = json.loads(payload) if isinstance(payload, str) else payload
        score, created = row['score'], row['created']
        if (type(row.get('id')) is not int or row['id'] < 1 or not isinstance(payload, dict)
                or type(score) not in (int, float) or not math.isfinite(score) or not 0 <= score <= 1
                or type(created) not in (int, float) or not math.isfinite(created)):
            return None
        rubric = payload['rubric']
        if not isinstance(rubric, list) or len(rubric) != len(question['points']):
            return None
        points = []
        fields = ('label', 'selected', 'expected', 'reason', 'category')
        for index, point in enumerate(rubric):
            if (not isinstance(point, dict) or type(point.get('correct')) is not bool
                    or any(not isinstance(point.get(key), str) for key in fields)):
                return None
            points.append({'index': index, **{key: point[key] for key in fields}, 'correct': point['correct']})
    except (KeyError, ValueError, TypeError):
        return None
    # Legacy records have no assistance marker. Any recorded assistance source
    # still makes a newer record assisted, even if its aggregate flag is absent.
    assisted = bool(payload.get('assisted') or payload.get('hinted_points') or payload.get('dialogue_assisted'))
    return {'attempt_id': row['id'], 'concept': concept['id'], 'name': concept['name'],
            'question_id': question_id, 'kind': question['kind'], 'prompt': question['prompt'],
            'score': round(score * 100), 'assisted': assisted, 'created': created, 'points': points}


def build_report_evidence(attempts, question_map, *, recent_limit=RECENT_LIMIT, review_limit=REVIEW_LIMIT):
    """Return bounded audit views without changing any learner state.

    Database insertion IDs define saved order, matching /api/study and grading;
    timestamps are displayed as recorded and never used to manufacture a trend.
    Counts cover every valid saved attempt, even when displayed lists are capped.
    """
    if type(recent_limit) is not int or not 1 <= recent_limit <= RECENT_LIMIT:
        raise ValueError('Recent report limit must be between 1 and 30')
    if type(review_limit) is not int or not 1 <= review_limit <= REVIEW_LIMIT:
        raise ValueError('Review report limit must be between 1 and 20')
    valid = [_attempt_view(row, question_map) for row in attempts]
    valid = sorted((row for row in valid if row is not None), key=lambda row: row['attempt_id'])
    latest_concept, latest_question, pending = {}, {}, {}
    for row in valid:
        cid, qid = row['concept'], row['question_id']
        latest_concept[cid] = row['attempt_id']
        latest_question[qid] = row
        points = pending.setdefault(qid, {})
        for point in row['points']:
            # The label participates in identity: a renamed rubric does not
            # retrospectively certify an older, different teaching point.
            key = (point['index'], point['label'])
            if not point['correct']:
                points[key] = {**point, 'status': 'needs_review', 'last_wrong_attempt_id': row['attempt_id']}
            elif key in points:
                if row['assisted']:
                    points[key] = {**point, 'status': 'independent_recheck',
                                   'last_wrong_attempt_id': points[key]['last_wrong_attempt_id']}
                else:
                    del points[key]
    for row in valid:
        row['is_latest_concept'] = latest_concept[row['concept']] == row['attempt_id']
        row['can_study_current'] = row['is_latest_concept'] and any(not point['correct'] for point in row['points'])
    review_items = []
    for qid, points in pending.items():
        if not points:
            continue
        latest = latest_question[qid]
        missing_count = sum(point['status'] == 'needs_review' for point in points.values())
        recheck_count = len(points) - missing_count
        review_items.append({**latest, 'points': list(points.values()),
                             'status': 'needs_review' if missing_count else 'independent_recheck',
                             'missing_count': missing_count, 'independent_recheck_count': recheck_count})
    review_items.sort(key=lambda row: row['attempt_id'], reverse=True)
    counts = {'attempts': len(valid), 'independent_attempts': sum(not row['assisted'] for row in valid),
              'assisted_attempts': sum(row['assisted'] for row in valid), 'review_questions': len(review_items),
              'missing_points': sum(row['missing_count'] for row in review_items),
              'independent_recheck_points': sum(row['independent_recheck_count'] for row in review_items)}
    return {'recent_attempts': list(reversed(valid))[:recent_limit], 'review_items': review_items[:review_limit],
            'counts': counts, 'limits': {'recent': recent_limit, 'review': review_limit,
                                       'recent_total': len(valid), 'review_total': len(review_items),
                                       'recent_truncated': len(valid) > recent_limit,
                                       'review_truncated': len(review_items) > review_limit},
            'notice': NOTICE}
