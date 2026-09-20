BOARDING_CODE_PALETTE = [
    {'color': '#E5484D', 'shape': 'circle', 'number': 1},
    {'color': '#F2A93B', 'shape': 'square', 'number': 2},
    {'color': '#5B8DEF', 'shape': 'triangle', 'number': 3},
    {'color': '#2FBF9E', 'shape': 'diamond', 'number': 4},
    {'color': '#A66CFF', 'shape': 'star', 'number': 5},
    {'color': '#E879B8', 'shape': 'hexagon', 'number': 6},
]


def resolve_boarding_code(index):
    if index is None or not 0 <= index < len(BOARDING_CODE_PALETTE):
        return {'color': None, 'shape': None, 'number': None}
    return BOARDING_CODE_PALETTE[index].copy()
