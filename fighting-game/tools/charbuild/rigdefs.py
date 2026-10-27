"""Rig definitions for the supplied character models (assets/source/*.glb).

Coordinates are in the source model's space after normalising its height to 1.8 units:
x = character's left (+) / right (-), y = up from the soles, z = forward (+).
Joints ending in .L are mirrored to .R about the body centre `cx` unless `right` overrides them
(models holding a weapon in one hand are not symmetric). Limb joints are then refined
automatically to the centre of the limb cross-section (see rig.py).

weapon: optional held weapon: tip position (absolute source coords) and the chest-space
        direction the blade is held toward, so a raised fist does not point the blade straight up.
height: in-game height at fighter scale 1.0 (the fighter's def.scale is applied on top).
metal / rough: PBR factors replacing the export defaults (some exports set metallic 0.9 on skin).
"""
MODELS = {
    # Sora Kestrel, precision combat: tactical soldier.
    'sora': {
        'src': 'soldier.glb', 'name': 'Tactical Soldier', 'height': 1.78, 'metal': 0.05, 'rough': 0.72,
        'joints': {
            'pelvis': [0, 1.0, 0], 'spine': [0, 1.17, 0], 'chest': [0, 1.33, 0], 'neck': [0, 1.52, 0.02],
            'head': [0, 1.6, 0.05], 'headTop': [0, 1.8, 0.05],
            'clav.L': [0.04, 1.47, 0.0], 'shoulder.L': [0.21, 1.43, 0.0], 'elbow.L': [0.33, 1.17, -0.02],
            'wrist.L': [0.335, 0.96, 0.03], 'handTip.L': [0.33, 0.8, 0.06],
            'hip.L': [0.1, 0.97, 0.0], 'knee.L': [0.17, 0.57, 0.03], 'ankle.L': [0.235, 0.12, -0.1],
            'ball.L': [0.25, 0.03, 0.04], 'toe.L': [0.26, 0.02, 0.13],
        },
    },
    # Leila Haddad, boxing: leather-armoured warrior with heavy gauntlets.
    'leila': {
        'src': 'warrior.glb', 'name': 'Leather Warrior', 'height': 1.8, 'metal': 0.35, 'rough': 0.55,
        'joints': {
            'pelvis': [0, 0.97, 0], 'spine': [0, 1.12, 0], 'chest': [0, 1.3, 0], 'neck': [0, 1.5, 0.01],
            'head': [0, 1.58, 0.04], 'headTop': [0, 1.81, 0.03],
            'clav.L': [0.05, 1.46, 0.0], 'shoulder.L': [0.24, 1.42, -0.02], 'elbow.L': [0.36, 1.21, -0.04],
            'wrist.L': [0.46, 0.93, 0.0], 'handTip.L': [0.45, 0.77, 0.0],
            'hip.L': [0.1, 0.92, 0.0], 'knee.L': [0.155, 0.49, -0.02], 'ankle.L': [0.24, 0.12, -0.07],
            'ball.L': [0.25, 0.03, 0.1], 'toe.L': [0.26, 0.02, 0.2],
        },
    },
    # Caio Luz, capoeira: armoured cobra (legs + tail).
    'caio': {
        'src': 'armored_cobra.glb', 'name': 'Armored Cobra', 'height': 1.85, 'metal': 0.15, 'rough': 0.42,
        'joints': {
            'pelvis': [0, 0.88, 0.32], 'spine': [0, 1.03, 0.33], 'chest': [0, 1.18, 0.33], 'neck': [0, 1.36, 0.36],
            'head': [0, 1.46, 0.4], 'headTop': [0, 1.8, 0.32],
            'clav.L': [0.05, 1.33, 0.33], 'shoulder.L': [0.22, 1.26, 0.3], 'elbow.L': [0.42, 1.12, 0.3],
            'wrist.L': [0.53, 0.9, 0.4], 'handTip.L': [0.57, 0.72, 0.45],
            'hip.L': [0.14, 0.8, 0.3], 'knee.L': [0.26, 0.58, 0.44], 'ankle.L': [0.3, 0.13, 0.3],
            'ball.L': [0.32, 0.04, 0.45], 'toe.L': [0.33, 0.02, 0.57],
        },
        'tail': {'base': [0, 0.75, 0.12], 'segments': 5,
                 'region': lambda X: (X[:, 2] < 0.14) & (X[:, 1] < 0.85)},
    },
    # Viktor Orlov, grappling: armoured fire bear (tail).
    'viktor': {
        'src': 'fantasy_bear.glb', 'name': 'Fantasy Bear', 'height': 1.75, 'metal': 0.2, 'rough': 0.6,
        'limbScale': 1.6,
        'joints': {
            'pelvis': [0, 0.68, 0.0], 'spine': [0, 0.88, 0.02], 'chest': [0, 1.06, 0.05], 'neck': [0, 1.22, 0.15],
            'head': [0, 1.3, 0.28], 'headTop': [0, 1.65, 0.25],
            'clav.L': [0.08, 1.18, 0.08], 'shoulder.L': [0.36, 1.15, 0.0], 'elbow.L': [0.6, 0.98, 0.0],
            'wrist.L': [0.66, 0.8, 0.18], 'handTip.L': [0.69, 0.6, 0.28],
            'hip.L': [0.17, 0.6, 0.0], 'knee.L': [0.27, 0.33, 0.04], 'ankle.L': [0.33, 0.1, -0.05],
            'ball.L': [0.36, 0.03, 0.1], 'toe.L': [0.37, 0.02, 0.2],
        },
        'tail': {'base': [0.05, 0.5, -0.28], 'segments': 3,
                 'region': lambda X: (X[:, 2] < -0.29) & (X[:, 1] < 0.72) & (X[:, 1] > 0.25)},
    },
    # Maya Baptiste, kickboxing: mushroom warrior (blade in the left hand).
    'maya': {
        'src': 'mushroom_warrior.glb', 'name': 'Mushroom Warrior', 'height': 1.72, 'metal': 0.05, 'rough': 0.75,
        'cx': -0.155,
        'joints': {
            'pelvis': [0, 0.7, -0.13], 'spine': [0, 0.85, -0.12], 'chest': [0, 1.0, -0.1], 'neck': [0, 1.18, -0.06],
            'head': [0, 1.27, -0.03], 'headTop': [0, 1.8, -0.03],
            'clav.L': [0.05, 1.12, -0.08], 'shoulder.L': [0.25, 1.12, -0.08], 'elbow.L': [0.43, 0.95, -0.08],
            'wrist.L': [0.46, 0.72, -0.04], 'handTip.L': [0.5, 0.6, 0.0],
            'hip.L': [0.12, 0.66, -0.13], 'knee.L': [0.21, 0.36, -0.12], 'ankle.L': [0.22, 0.1, -0.2],
            'ball.L': [0.23, 0.03, -0.1], 'toe.L': [0.24, 0.02, -0.04],
        },
        'right': {'elbow': [-0.47, 0.97, -0.08], 'wrist': [-0.43, 0.75, -0.05], 'handTip': [-0.42, 0.53, -0.03]},
        # blade tip (absolute source coords); held forward and down in the guard (chest space)
        'weapon': {'side': 'L', 'tip': [0.68, 0.2, 0.29], 'aim': [0.15, -0.45, 1.0]},
    },
    # Ren Arashi, karate: chibi mushroom ninja (sword in the right hand).
    'ren': {
        'src': 'mushroom_ninja.glb', 'name': 'Mushroom Ninja', 'height': 1.65, 'metal': 0.0, 'rough': 0.7,
        'cx': 0.175, 'voxel': 0.01, 'sigma': 0.03,
        'joints': {
            'pelvis': [0, 0.45, 0.0], 'spine': [0, 0.6, 0.0], 'chest': [0, 0.76, 0.0], 'neck': [0, 0.93, 0.03],
            'head': [0, 1.0, 0.05], 'headTop': [0, 1.8, 0.0],
            'clav.L': [0.05, 0.88, 0.0], 'shoulder.L': [0.22, 0.86, 0.0], 'elbow.L': [0.4, 0.76, 0.03],
            'wrist.L': [0.52, 0.64, 0.07], 'handTip.L': [0.6, 0.46, 0.13],
            'hip.L': [0.12, 0.38, 0.0], 'knee.L': [0.17, 0.2, 0.02], 'ankle.L': [0.2, 0.07, -0.02],
            'ball.L': [0.2, 0.025, 0.07], 'toe.L': [0.2, 0.015, 0.12],
        },
        'right': {'elbow': [-0.42, 0.84, 0.05], 'wrist': [-0.52, 0.75, 0.1], 'handTip': [-0.55, 0.63, 0.13]},
        'weapon': {'side': 'R', 'tip': [-0.82, 1.45, 0.25], 'aim': [-0.1, 0.75, 0.65]},
        'norefine': ['knee'],
    },
}
