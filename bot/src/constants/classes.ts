// RotMG classes for selection menu
export const ROTMG_CLASSES = [
    'Rogue',
    'Archer',
    'Wizard',
    'Priest',
    'Warrior',
    'Knight',
    'Paladin',
    'Assassin',
    'Necromancer',
    'Huntress',
    'Mystic',
    'Trickster',
    'Sorcerer',
    'Ninja',
    'Samurai',
    'Bard',
    'Summoner',
    'Kensei'
] as const;

export type RotmgClass = typeof ROTMG_CLASSES[number];
