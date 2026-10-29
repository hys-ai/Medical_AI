"""Source-independent reasoning scaffolds; never disclose scoring keys as hints."""


def hint_text(question, index, level):
    point = question['points'][index]
    if level == 1:
        return '先单独分析“' + point['label'] + '”：列出题干给出的条件与限制，再比较选项。'
    if question['kind'] == 'transfer':
        return '先找出与原情境相同和变化的条件，只在题干给出的定位范围内推理，再说明排除其他选项的依据。'
    return '按“结构或通路 → 对应功能 → 可能表现”口述依据。遇到“所有、必然”等表述，检查题干是否支持这样的范围。'
