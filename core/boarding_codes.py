BOARDING_CODE_PALETTE = [
    {'color': '#A855F7', 'shape': 'circle', 'number': 1},
    {'color': '#EC4899', 'shape': 'square', 'number': 2},
    {'color': '#06B6D4', 'shape': 'triangle', 'number': 3},
    {'color': '#6366F1', 'shape': 'diamond', 'number': 4},
    {'color': '#E11D48', 'shape': 'star', 'number': 5},
    {'color': '#16A34A', 'shape': 'hexagon', 'number': 6},
]


def resolve_boarding_code(index):
    if index is None or not 0 <= index < len(BOARDING_CODE_PALETTE):
        return {'color': None, 'shape': None, 'number': None}
    return BOARDING_CODE_PALETTE[index].copy()
