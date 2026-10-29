"""Deterministic learning suggestions from this learner's actual structured attempts.

This module has no database writes, model calls or inferred medical answers.
The interval rule is an engineering aid, not a validated memory model.
"""
from datetime import datetime, timedelta, timezone
import json
import math
import time


SHANGHAI = timezone(timedelta(hours=8))
DAY = 86400
INTERVALS = (1, 3, 7, 14)
DAILY_NEW_LIMIT = 2
PLAN_LIMIT = 5


def _day(timestamp):
    return datetime.fromtimestamp(timestamp, SHANGHAI).date()


def _payload(row):
    value = row.get('payload', {})
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return {'assisted': True}
    # A damaged historical record cannot establish independent success.
    return value if isinstance(value, dict) else {'assisted': True}


def _weak_points(row):
    rubric = row['_payload'].get('rubric', []) if row else []
    if not isinstance(rubric, list):
        return []
    return list(dict.fromkeys(
        point['label'][:100] for point in rubric
        if isinstance(point, dict) and point.get('correct') is False
        and isinstance(point.get('label'), str)
    ))[:3]


def build_plan(concepts, attempts, active=None, now=None):
    """Return at most five actionable items; callers must filter attempts by learner.

    ``concepts`` is the existing progress() output and ``attempts`` comes from
    attempts_get(). IDs outside these concepts, future entries, and invalid scores
    do not affect the plan. Legacy payloads without ``assisted`` are independent.

    Due/weak counts concern the entire chapter, not just the five visible items.
    ``new`` counts all unassessed concepts. ``practiced_today`` counts distinct
    concepts attempted on the current Shanghai day. New items in the daily plan
    are capped at two, less concepts first attempted today and an unfinished new
    item already shown as ``resume``.
    """
    now = time.time() if now is None else float(now)
    if not math.isfinite(now):
        raise ValueError('now must be a finite timestamp')
    today = _day(now)
    known = {concept['id']: concept for concept in concepts}
    histories = {cid: [] for cid in known}
    for order, row in enumerate(attempts):
        if row.get('concept') not in known:
            continue
        try:
            created, score = float(row['created']), float(row['score'])
        except (KeyError, ValueError, TypeError):
            continue
        if not math.isfinite(created) or not math.isfinite(score) or not 0 <= score <= 1 or created > now:
            continue
        histories[row['concept']].append({**row, 'created': created, 'score': score,
                                         '_payload': _payload(row), '_order': order})
    for rows in histories.values():
        rows.sort(key=lambda row: (row['created'], row['_order']))

    reviews, upcoming, unseen = [], [], []
    weak_count = 0
    practiced_today = 0
    new_started_today = 0
    for position, concept in enumerate(concepts):
        cid = concept['id']
        rows = histories[cid]
        if not rows:
            unseen.append(concept)
            continue
        practiced_today += any(_day(row['created']) == today for row in rows)
        new_started_today += _day(rows[0]['created']) == today
        last = rows[-1]
        item = {'concept': cid, 'name': concept['name'], 'action': 'review',
                'kind': 'diagnostic', 'reason': '', 'due_at': last['created'],
                'last_score': round(last['score'] * 100), 'weak_points': _weak_points(last)}
        if last['score'] < .8:
            weak_count += 1
            item['reason'] = '最近作答未达标，先回顾缺失要点，再独立复测基础。'
            reviews.append((0, last['score'], last['created'], position, item))
            continue

        last_failure = next((index for index in range(len(rows)-1, -1, -1)
                             if rows[index]['score'] < .8), -1)
        cycle = rows[last_failure + 1:]
        independent = [row for row in cycle if row['score'] >= .8
                       and row['_payload'].get('assisted') is not True]
        diagnostic = [row for row in independent if row.get('kind') == 'diagnostic']
        transfer = [row for row in independent if row.get('kind') == 'transfer']
        if not transfer:
            item['kind'] = 'transfer'
            item['reason'] = ('上次借助提示完成，仍需独立完成迁移复测。'
                              if last['_payload'].get('assisted') is True else
                              '诊断题已达标，再换一个情境独立完成迁移题。')
            reviews.append((1, 0, last['created'], position, item))
            continue
        if not diagnostic:
            item['reason'] = '迁移题已有独立作答，基础诊断仍需独立复核。'
            reviews.append((1, 0, last['created'], position, item))
            continue

        # Only independent transfer success advances the interval. Multiple
        # successes on the same calendar day share its first success timestamp.
        successful_days = {}
        for row in transfer:
            successful_days.setdefault(_day(row['created']), row['created'])
        interval = INTERVALS[min(len(successful_days), len(INTERVALS)) - 1]
        anchor = successful_days[max(successful_days)]
        item['due_at'] = anchor + interval * DAY
        item['kind'] = 'transfer'
        item['reason'] = f'按独立迁移达标的学习日安排{interval}天后复习；请独立回忆再作答。'
        if item['due_at'] <= now:
            reviews.append((2, 0, item['due_at'], position, item))
        else:
            upcoming.append(item['due_at'])

    reviews.sort(key=lambda entry: entry[:4])
    items = []
    active_cid = active.get('concept') if isinstance(active, dict) else None
    if active_cid in known:
        concept = known[active_cid]
        rows = histories[active_cid]
        existing = next((entry[-1] for entry in reviews if entry[-1]['concept'] == active_cid), None)
        items.append({'concept': active_cid, 'name': concept['name'], 'action': 'resume',
                      'kind': 'auto', 'reason': '继续未完成的题目，保留当前作答任务。',
                      'due_at': existing['due_at'] if existing else None,
                      'last_score': round(rows[-1]['score'] * 100) if rows else None,
                      'weak_points': _weak_points(rows[-1]) if rows else []})
    items.extend(entry[-1] for entry in reviews if entry[-1]['concept'] != active_cid)
    new_budget = max(0, DAILY_NEW_LIMIT - new_started_today)
    if active_cid in known and not histories[active_cid]:
        new_budget = max(0, new_budget - 1)
    for concept in unseen:
        if new_budget <= 0 or len(items) >= PLAN_LIMIT:
            break
        if concept['id'] == active_cid:
            continue
        items.append({'concept': concept['id'], 'name': concept['name'], 'action': 'learn',
                      'kind': 'diagnostic', 'reason': '尚无作答记录，先用三个要点了解当前掌握情况。',
                      'due_at': None, 'last_score': None, 'weak_points': []})
        new_budget -= 1
    return {'scope': f'脑神经示例章节 · {len(concepts)}个知识点',
            'method': '优先未完成任务、薄弱要点与到期复习；每天最多安排2个新知识点。'
                      '独立迁移达标的学习日采用1/3/7/14天工程间隔，失败后重新巩固；'
                      '同日重复或借助提示的高分不延长间隔。不是经验证的记忆模型。',
            'counts': {'due': len(reviews), 'weak': weak_count, 'new': len(unseen),
                       'practiced_today': practiced_today},
            'next_due_at': min(upcoming) if upcoming else None,
            'items': items[:PLAN_LIMIT]}
