// Nocturne generators: human-readable passwords + a wide nickname engine.
// All randomness comes from crypto.getRandomValues with rejection sampling.

export const rng = {
  int(n) {
    if (n <= 1) return 0;
    const lim = Math.floor(0x100000000 / n) * n;
    const b = new Uint32Array(1);
    let x;
    do { crypto.getRandomValues(b); x = b[0]; } while (x >= lim);
    return x % n;
  },
  pick(a) { return a[this.int(a.length)]; },
  chance(p) { return this.int(1000000) < p * 1000000; },
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = this.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; },
};

const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1) : w);
const words = (s) => [...new Set(s.trim().split(/\s+/))];

// ~1100 short, easy-to-spell words. Entropy is computed from the real size.
export const WORDS = words(`
able acid acorn actor adapt adobe aero agent agile aisle alarm album alert algae alien alley alloy alpha amber ample angel angle ankle anvil apple apron arbor arena armor arrow aspen atlas atom attic audio autumn avid award awake axis azure
bacon badge bagel baker balm bamboo banjo banner barge barn basil basin batch beach beacon beam bean beard beast beaver bedrock beetle bell bench berry bike birch bison blade blast blaze blend bliss block bloom blossom blue board boat bolt bonus booth border bottle boulder bounce brain brass brave bread breeze brick bridge bright brisk broom brook brush bubble bucket buddy budget buffalo bugle bunny burst butter button buzz
cabin cable cactus cadet cake camel camera camp canal candle candy canoe canvas canyon cape captain carbon cargo carol carpet carrot castle cedar cello chalk champ charm chart chase cheese cherry chess chief chili chimp chip choir cider cinema circle citrus civic clamp clay cliff climb clock cloud clover coach coast cobalt cocoa coconut comet comic coral cosmic cotton couch cougar cozy crab craft crane crater crayon cream crest cricket crisp crown crumb crystal cube cupcake curve cushion cycle
dagger daisy dance dawn decal decoy delta denim depot desert desk dial diary diesel digit dingo diner disco dock dolphin domain donut dove dragon drama dream drift drill drum dune dusk dust dwarf dynamo
eagle early earth easel echo eclipse edge elbow elder elite elk ember emblem emerald empire energy engine epic equal escape essay ether event exact expert
fable fabric falcon fancy farm feast feather fence ferry fiber fiddle field fiesta figure filter final finch fjord flag flame flash fleet flint float flock flora flour flute focus foggy forest forge fossil fox frame freckle fresh frost fruit fudge funnel fuzzy
gadget galaxy gallon garden garlic gate gazelle gecko gem genie ghost giant ginger giraffe glacier glade glass glide globe glory glove glow gnome goblin golden gopher gorilla grace grain granite grape graph grass gravel gravy grid grill grove guard guava guest guide guitar gull gumbo gust
habit hammer hamster harbor harp harvest hatch haven hawk hazel heart helmet herb hero heron hill hippo hobby honey hood hook hope horizon hornet hotel hound humble hunter hurdle husky hybrid
icicle icon igloo image impala index indigo ink inlet input iris iron island ivory ivy
jacket jaguar jam jasmine jazz jelly jersey jet jewel jigsaw jockey jolly journal journey judge juice jumbo jungle juniper
kayak kebab kernel kettle keypad kiln kingdom kiosk kitten kiwi knight koala kraken kudos
label ladder lagoon lake lamb lamp lantern laptop laser latch lava lawn layer leaf ledge legend lemon lens leopard level lever light lilac lily limit linen lion lizard llama lobby lobster locket lodge logic lotus lucky lumber lunar lunch lynx lyric
macro magic magnet mango manor maple marble margin marina market marsh mascot meadow medal melody melon memo mentor merit mesa metal meteor metro micro mild mint mirror mist mitten mobile model mocha modest molten monk moose morning mosaic moss motel motor mound mountain mouse muffin mural museum music mustard myth
nacho napkin narrow native nature navy nebula nectar needle neon nest nickel night nimble ninja noble noodle north notch novel nugget nutmeg nylon
oak oasis oat ocean octave octopus office olive omega onion onyx opal opera orange orbit orchid organ origin osprey otter outer oval oven owl oxygen oyster
paddle pagoda palace palm panda panel panther paper parade parrot pasta pastel patch path peach peak peanut pearl pebble pecan pedal pelican pencil penguin pepper pickle picnic pigeon pillow pilot pine pioneer pirate pixel pizza planet plasma plaza plum plume pocket poem polar pony popcorn poplar portal potato powder prairie prism puffin pulse puma pumpkin puppet puzzle pyramid
quail quartz quasar queen quest quick quiet quill quilt quiver quota
rabbit raccoon radar radio radish raft rain raisin rally ramen ranch ranger rapid raven razor reef relic remedy rhino ribbon rice ridge ripple river road robin robot rocket rodeo rogue roof rookie rose rover royal ruby rumble rustic
saddle safari saga sage salmon salsa sandal satin saturn sauce savvy scarf scenic scout seal season shadow shark sheep shell sherpa shield shiny shore shrimp sierra signal silk silver siren sketch skiff skate slate sleek slope smoke snail snow soda sofa solar sonic spark sparrow spice spider spiral splash sponge spoon spring sprout spruce squid stable stamp star steam steel stone storm story stream studio sugar summit sunset super surf swamp swan sweater swift symbol syrup
table tackle taco talon tango tank tapir target tavern teapot temple tennis tent thistle thunder ticket tiger timber tinsel toast token tomato tonic topaz torch tornado totem toucan tower tractor trail train tram treaty trek tribe trophy tropic trout truffle trumpet tulip tundra tunnel turbo turtle tuxedo twig twist
ultra umber umbrella unicorn union unique unit upbeat upper urban utopia
vacuum valley vanilla vapor velvet vendor venom venus verse vessel vest vibe video viking villa vine vinyl violet violin viper visor vista vivid vocal volcano voyage vortex
waffle wagon walnut walrus wander wasabi water wave wax weasel wheat whale wheel whisk whistle widget willow window winter wizard wolf wombat wonder woods woven wrench
xenon yacht yak yard yarn yeti yodel yogurt yonder young yoyo zebra zenith zephyr zero zest zigzag zinc zipper zodiac zone zoom
bold brave calm clever crafty daring eager fierce gentle giddy grand happy hardy jumpy keen lively loyal lush mellow mighty misty nifty peppy plucky proud rowdy sassy shy silent smart snappy spry sturdy sunny tidy vast warm wild witty zany zippy
`);

const SYMBOLS = '!#$%&*+-=?@^_~';
const SEPS = '-.!_+*#~=';
const DIGITS = '0123456789';

const log2 = Math.log2;

function digits(n) { let s = ''; for (let i = 0; i < n; i++) s += DIGITS[rng.int(10)]; return s; }

// ---------- password styles ----------

export const PW_STYLES = {
  spit: { label: 'Spit', hint: 'Readable words, numbers and symbols mixed in. Strong, easy to type.' },
  phrase: { label: 'Passphrase', hint: 'Several random words. Very strong and easy to remember.' },
  speak: { label: 'Pronounceable', hint: 'Made-up words you can say out loud.' },
  random: { label: 'Random', hint: 'Classic random characters, for sites that need it.' },
  pin: { label: 'PIN', hint: 'Digits only.' },
};

export const PW_DEFAULTS = {
  spit: { words: 3 },
  phrase: { words: 5, sep: '-', caps: true, number: true },
  speak: { chunks: 3, number: true, symbol: true },
  random: { length: 20, upper: true, lower: true, digits: true, symbols: true, noAmbiguous: true },
  pin: { length: 6 },
};

/** Returns { value, bits } */
export function generatePassword(style = 'spit', opts = {}) {
  const o = { ...PW_DEFAULTS[style], ...opts };
  const W = WORDS.length;
  if (style === 'spit') {
    const n = Math.max(2, Math.min(6, o.words | 0));
    const parts = Array.from({ length: n }, () => cap(rng.pick(WORDS)));
    const numLen = 2 + rng.int(2);
    const slot = rng.int(n + 1);
    parts.splice(slot, 0, digits(numLen));
    let out = '';
    parts.forEach((p, i) => { out += p; if (i < parts.length - 1) out += SEPS[rng.int(SEPS.length)]; });
    out += SYMBOLS[rng.int(SYMBOLS.length)];
    const bits = n * log2(W) + numLen * log2(10) + (parts.length - 1) * log2(SEPS.length) + log2(SYMBOLS.length) + log2(n + 1);
    return { value: out, bits };
  }
  if (style === 'phrase') {
    const n = Math.max(3, Math.min(10, o.words | 0));
    const parts = Array.from({ length: n }, () => (o.caps ? cap(rng.pick(WORDS)) : rng.pick(WORDS)));
    let bits = n * log2(W);
    if (o.number) { const i = rng.int(n); parts[i] += DIGITS[rng.int(10)]; bits += log2(10) + log2(n); }
    return { value: parts.join(o.sep ?? '-'), bits };
  }
  if (style === 'speak') {
    const C = 'bdfghjklmnprstvz', V = 'aeiou';
    const n = Math.max(2, Math.min(6, o.chunks | 0));
    const chunks = [];
    let bits = 0;
    for (let c = 0; c < n; c++) {
      const syl = 2 + rng.int(2);
      let w = '';
      for (let s = 0; s < syl; s++) { w += C[rng.int(C.length)] + V[rng.int(V.length)]; bits += log2(C.length * V.length); }
      if (rng.chance(0.5)) { w += C[rng.int(C.length)]; }
      bits += 1.5;
      chunks.push(cap(w));
    }
    if (o.number) { chunks.splice(rng.int(n + 1), 0, digits(2)); bits += log2(100) + log2(n + 1); }
    let out = chunks.join('-');
    if (o.symbol) { out += SYMBOLS[rng.int(SYMBOLS.length)]; bits += log2(SYMBOLS.length); }
    return { value: out, bits };
  }
  if (style === 'pin') {
    const n = Math.max(4, Math.min(12, o.length | 0));
    return { value: digits(n), bits: n * log2(10) };
  }
  // random
  const amb = /[Il1O0o]/g;
  const sets = [];
  if (o.lower) sets.push('abcdefghijkmnopqrstuvwxyz');
  if (o.upper) sets.push('ABCDEFGHJKLMNPQRSTUVWXYZ');
  if (o.digits) sets.push('23456789' + (o.noAmbiguous ? '' : '01'));
  if (o.symbols) sets.push(SYMBOLS);
  if (!sets.length) sets.push('abcdefghijkmnopqrstuvwxyz');
  const clean = sets.map((s) => (o.noAmbiguous ? s.replace(amb, '') : s));
  const all = clean.join('');
  const len = Math.max(6, Math.min(128, o.length | 0));
  const chars = clean.map((s) => s[rng.int(s.length)]);
  while (chars.length < len) chars.push(all[rng.int(all.length)]);
  rng.shuffle(chars);
  return { value: chars.slice(0, len).join(''), bits: len * log2(all.length) };
}

// ---------- nickname engine ----------

const T = (adj, noun) => ({ adj: words(adj), noun: words(noun) });

export const THEMES = {
  gamer: { label: 'Gamer', syl: 'orc', ...T(
    'Savage Toxic Feral Brutal Rapid Lethal Rogue Frenzied Hyper Rabid Deadly Ruthless Turbo Wild Mad Insane Tactical Elite Crazy Furious Silent Sneaky Clutch Cracked Sweaty Raging Unhinged Max Ultra Mega Prime Alpha Omega Godly Tryhard',
    'Sniper Slayer Reaper Hunter Viper Raptor Phantom Ghost Ninja Striker Titan Warlord Ravager Demon Beast Predator Assassin Gunner Bandit Outlaw Fragger Carry Tank Healer Raider Ace Sentinel Havoc Chaos Fury Rampage Blitz Combo Legend Goat Warden Headshot Respawn Lag Noob Sweat Clutch Boss') },
  cyber: { label: 'Cyber', syl: 'scifi', ...T(
    'Neon Quantum Digital Binary Glitched Synthetic Virtual Electric Chrome Crypto Null Rogue Hex Hyper Nano Pixel Static Wired Lucid Encrypted Overclocked Analog Holo Laser Plasma Offline Root Zero',
    'Byte Glitch Cipher Matrix Vector Kernel Proxy Socket Circuit Pulse Signal Daemon Script Codec Node Packet Firewall Hacker Droid Cyborg Mainframe Protocol Bit Core Echo Sector Grid Wire Vortex Nexus Override Shell Synth Pixel Bot Router Cache Buffer Lambda Token') },
  fantasy: { label: 'Fantasy', syl: 'elf', ...T(
    'Arcane Elder Mystic Enchanted Ancient Gilded Silver Moonlit Runic Fey Wandering Fabled Hallowed Emerald Crimson Golden Twilight Starborn Wild Sacred Hidden Lost Elven Dwarven Gleaming',
    'Wizard Dragon Paladin Ranger Druid Sorcerer Griffin Phoenix Elf Knight Bard Sage Oracle Wyvern Rune Grimoire Tome Wand Crown Sword Shield Unicorn Goblin Troll Golem Familiar Mage Warlock Seer Spellblade Alchemist Dryad Centaur Squire Quest') },
  dark: { label: 'Dark', syl: 'orc', ...T(
    'Hollow Grim Wicked Cursed Shadow Black Obsidian Midnight Silent Bleak Forsaken Sinister Fallen Wretched Haunted Gloomy Void Ashen Pale Crimson Bitter Dread Eerie Morbid Nameless Sunless',
    'Raven Wraith Specter Shade Crow Abyss Omen Requiem Reaper Lich Revenant Nightmare Eclipse Thorn Grave Skull Bone Fang Venom Hex Ruin Shroud Gloom Dusk Ash Hollow Vesper Banshee Phantom Moth Coffin Rot Sorrow') },
  cute: { label: 'Cute', syl: 'jp', ...T(
    'Fluffy Sleepy Tiny Bubbly Cozy Sunny Sweet Peachy Fuzzy Snuggly Little Happy Bouncy Squishy Sparkly Dreamy Soft Comfy Silly Giggly Honey Sugar Mochi Velvet Pastel Baby Lil Smol',
    'Bunny Kitten Panda Muffin Cupcake Mochi Peach Puff Bean Button Cookie Marshmallow Pudding Bubble Daisy Petal Cloud Star Sprout Duckling Hamster Otter Fox Pancake Sugarplum Waffle Teddy Boba Biscuit Pebble Bun Paws Whisker Jellybean') },
  mythic: { label: 'Mythic', syl: 'latin', ...T(
    'Divine Eternal Immortal Celestial Titanic Olympian Legendary Sacred Primal Infernal Radiant Golden Valiant Heroic Fated Ancient Undying Exalted',
    'Zeus Odin Thor Loki Hermes Athena Ares Apollo Hydra Kraken Cerberus Minotaur Pegasus Valkyrie Titan Atlas Chimera Basilisk Sphinx Fenrir Anubis Osiris Medusa Siren Cyclops Prometheus Nemesis Kitsune Tengu Oni Ragnarok Olympus Valhalla Excalibur Gorgon Behemoth Leviathan') },
  nature: { label: 'Nature', syl: 'elf', ...T(
    'Wild Mossy Misty Verdant Rustic Golden Autumn Morning Quiet Wandering Gentle Evergreen Frosty Blooming Sunlit Earthy Rainy Windy Hidden Barefoot',
    'Willow Fern Cedar Oak Pine Aspen Maple River Brook Meadow Moss Thorn Ivy Clover Sage Birch Grove Canyon Ridge Summit Valley Pebble Stone Bramble Lotus Orchid Juniper Wren Sparrow Heron Acorn Fjord Tundra Hollow') },
  space: { label: 'Space', syl: 'scifi', ...T(
    'Cosmic Stellar Lunar Solar Astral Orbital Galactic Nebular Interstellar Zero Infinite Distant Silent Dark Ionized Radiant Starlit Quantum Gravity Deep',
    'Nova Nebula Comet Quasar Pulsar Orbit Galaxy Meteor Eclipse Zenith Horizon Rocket Astronaut Voyager Cosmos Star Moon Saturn Jupiter Mars Pluto Vega Sirius Orion Andromeda Supernova Singularity Photon Station Probe Starship Void Apollo Kepler Lightyear') },
  animal: { label: 'Animal', syl: 'elf', ...T(
    'Swift Sly Mighty Lazy Grumpy Clever Sneaky Bold Scrappy Majestic Feisty Wise Hungry Restless Lone Proud Rabid Fluffy Sleepy Angry',
    'Wolf Fox Bear Hawk Falcon Eagle Owl Lynx Panther Tiger Lion Otter Badger Raccoon Shark Orca Cobra Viper Gecko Mantis Moth Beetle Stag Bison Coyote Jackal Hyena Rhino Gorilla Koala Sloth Penguin Puffin Narwhal Axolotl Capybara Ferret Mongoose Corgi Goose') },
  food: { label: 'Food', syl: 'jp', ...T(
    'Spicy Crispy Toasty Salty Sweet Cheesy Saucy Zesty Crunchy Juicy Smoky Buttery Sour Frosted Glazed Tangy Extra Loaded Double Midnight',
    'Taco Nacho Burrito Pickle Waffle Pancake Donut Bagel Noodle Ramen Sushi Dumpling Pretzel Muffin Burger Fries Pepper Wasabi Chili Mango Lemon Kiwi Coconut Avocado Potato Biscuit Toast Cookie Brownie Espresso Latte Mocha Boba Kebab Baklava Simit Lahmacun Nugget') },
  funny: { label: 'Funny', syl: 'jp', ...T(
    'Confused Suspicious Unemployed Caffeinated Sleepless Questionable Dramatic Chaotic Accidental Reluctant Sarcastic Spicy Unbothered Feral Wobbly Clumsy Bewildered Allegedly Certified Mildly Professional Undercover Retired Haunted',
    'Potato Toaster Goose Pigeon Llama Walrus Noodle Pickle Sock Spoon Taco Burrito Nugget Waffle Penguin Platypus Duck Banana Sandwich Teapot Cactus Gremlin Raccoon Possum Shrimp Croissant Hamster Turnip Fridge Spatula Lasagna Pretzel Goblin Mayonnaise') },
  elegant: { label: 'Elegant', syl: 'latin', ...T(
    'Velvet Ivory Silk Royal Noble Gilded Opal Pearl Crystal Silver Graceful Serene Regal Luxe Satin Amber Marble Sapphire Ebony Mauve Quiet Rare',
    'Rose Swan Lily Sonata Aria Muse Reverie Belle Monarch Duchess Countess Jewel Crown Velour Etoile Lumiere Soleil Lune Fleur Cameo Allure Elixir Nocturne Ballad Waltz Prelude Orchid Atelier Riviera Solace') },
  retro: { label: 'Retro', syl: 'scifi', ...T(
    'Retro Vapor Synth Turbo Radical Neon Arcade Analog Chrome Mega Super Totally Cassette Vintage Electric Funky Groovy Rad Bodacious',
    'Wave Cassette Arcade Pixel Joystick Boombox Walkman Disco Laser Sunset Drive Highway Floppy Cartridge Vinyl Jukebox Rollerskate Polaroid Mixtape Dynamo Beeper Outrun Gameboy Modem VHS') },
  ocean: { label: 'Ocean', syl: 'elf', ...T(
    'Deep Salty Tidal Coral Abyssal Drifting Sunken Azure Briny Stormy Foamy Pearl Moonlit Lost Restless',
    'Tide Reef Kraken Siren Mariner Wave Current Lagoon Harbor Anchor Coral Squid Orca Shark Manta Dolphin Seahorse Nautilus Buoy Captain Corsair Pirate Tempest Trident Marlin Whale Wake Shoal Lighthouse') },
  elements: { label: 'Elements', syl: 'orc', ...T(
    'Blazing Frozen Molten Electric Thundering Shattered Burning Crackling Howling Scorched Glacial Volcanic Searing Stormborn Ember Static Ionic',
    'Flame Inferno Blaze Ember Frost Glacier Storm Thunder Lightning Volt Tempest Cyclone Tornado Quake Magma Ash Smoke Mist Hail Gale Spark Cinder Torrent Avalanche Monsoon Aurora Solstice Plasma') },
  anatolian: { label: 'Anatolian', syl: 'latin', ...T(
    'Kara Ak Gok Kizil Demir Deli Sessiz Yalniz Cesur Haylaz Yaman Asi Gizli Bozkir Ates Altin Gece Uzak',
    'Kurt Bozkurt Kartal Sahin Simsek Yildiz Ay Gunes Deniz Ruzgar Firtina Bulut Gece Kaya Aslan Pars Tilki Doruk Toprak Ates Atlas Cinar Efe Akin Tuna Alp Kaan Han Yigit Baran Sahan Bora Tepe') },
  japanese: { label: 'Japanese', syl: 'jp', ...T(
    'Kage Yami Kuro Shiro Aka Ao Hikari Kaze Yuki Hoshi Tsuki Sora Kami Akai Shin Ryu',
    'Ryu Kitsune Neko Sakura Tora Kumo Akuma Ronin Shinobi Oni Raijin Hana Tengu Mochi Senpai Zen Katana Shogun Okami Hebi Kaiju Yokai Taiyo Kaminari Kodama') },
};

const SYL = {
  elf: { a: words('Ae El Gal Il Lae Lor Mel Nim Sil Thal Ya Fae Cal Eri Ara Lua Ser Vael Ith Nae'), m: ['a', 'e', 'i', 'ia', 'ae', 'ari', 'ele', 'ora', '', ''], z: words('wen riel las dor thil nor lith ion wyn ndra sse mir iel anor ith ae') },
  orc: { a: words('Gr Kr Th Zug Mog Grom Dur Bol Gor Ur Skar Rak Vrak Dro Mor Gash'), m: ['a', 'o', 'u', 'ag', 'ul', 'ar', ''], z: words('ak gar oth nak tusk mash rok zug grim dush ug gul gash kor') },
  scifi: { a: words('Zy Vex Xa Kor Ty Ry Ax Qu Ne Zo Ky Ul Jax Vy Ix Or'), m: ['ra', 'on', 'ix', 'el', 'a', 'y', 'ex', 'o', ''], z: words('on ix ar us yx ex ion ara os eth iq ax ov') },
  latin: { a: words('Aur Cas Lu Max Oct Val Ser Fla Mar Cor Sev Tib Aem Cael Liv Ner'), m: ['e', 'i', 'a', 'ia', 'ce', 'er', ''], z: words('ius ia us a or ian ex ix ens ina um is') },
  jp: { a: words('Ka Ki Ku Ke Ko Sa Shi Su Se So Ta Chi Tsu Te To Na Ni Ha Hi Fu Ho Ma Mi Mu Me Mo Ya Yu Yo Ra Ri Ru Re Ro'), m: words('ka ki ku ko sa shi su ta chi te to na ni no ha hi ma mi mo ya yu ra ri ru re ro'), z: words('ko ki ro ru to mi na ra ya shi n ji ka') },
};

const TITLES = words('Sir Captain Lord Professor Doctor Agent Mister Lady Duke Baron General Chief Count Admiral Grandmaster Uncle Big Lil King Queen Saint Major');
const OFS = ['Of', 'From'];
const LEET = { a: '4', e: '3', i: '1', o: '0', s: '5', t: '7', g: '9', b: '8' };
const COOL_NUMS = ['7', '13', '21', '33', '42', '64', '69', '77', '88', '99', '101', '247', '313', '360', '404', '420', '666', '777', '808', '999', '1337', '2077', '3000', '9000'];

export const NICK_CASES = { pascal: 'PascalCase', lower: 'lowercase', snake: 'snake_case', dot: 'dot.case', kebab: 'kebab-case', camel: 'camelCase', upper: 'UPPERCASE', space: 'Spaced Words', mix: 'Mix it up' };

function blend(a, b) {
  const al = a.toLowerCase(), bl = b.toLowerCase();
  if (al.at(-1) === bl[0]) return a + bl.slice(1);
  return a.slice(0, Math.max(2, Math.ceil(a.length * 0.66))) + bl.slice(Math.floor(b.length * 0.4));
}

function syllableName(style) {
  const s = SYL[style] || SYL.elf;
  if (style === 'jp') {
    let w = rng.pick(s.a);
    const n = 1 + rng.int(2);
    for (let i = 0; i < n; i++) w += rng.pick(s.m);
    if (rng.chance(0.5)) w += rng.pick(s.z);
    return w;
  }
  return rng.pick(s.a) + rng.pick(s.m) + rng.pick(s.z);
}

function seedVariants(seed) {
  const s = seed.replace(/[^\p{L}\p{N}]/gu, '');
  if (!s) return [];
  const c = cap(s.toLowerCase());
  const cut = c.slice(0, Math.max(3, Math.ceil(c.length * 0.6)));
  // Each variant is a list of parts so the case formatter keeps word boundaries.
  return [[c], [c], [cut + rng.pick(['ex', 'ix', 'on', 'yx', 'o', 'a', 'us', 'ion', 'ar', 'is'])], [c, rng.pick(['X', 'Prime', 'Zero', 'One', 'Byte', 'Main', 'Alt'])], [cap(c.split('').reverse().join('').toLowerCase())]];
}

function leetify(str) {
  return str.replace(/[aeiostgb]/gi, (ch) => (rng.chance(0.45) ? LEET[ch.toLowerCase()] : ch));
}

function format(parts, style) {
  const st = style === 'mix' ? rng.pick(['pascal', 'pascal', 'lower', 'snake', 'dot', 'camel', 'kebab']) : style;
  const w = parts.filter(Boolean).map((p) => p.toLowerCase());
  switch (st) {
    case 'lower': return w.join('');
    case 'snake': return w.join('_');
    case 'dot': return w.join('.');
    case 'kebab': return w.join('-');
    case 'upper': return w.join('').toUpperCase();
    case 'camel': return w.map((x, i) => (i ? cap(x) : x)).join('');
    case 'space': return w.map(cap).join(' ');
    default: return w.map(cap).join('');
  }
}

function buildParts(themeKeys, seed) {
  const t = THEMES[rng.pick(themeKeys)];
  const t2 = THEMES[rng.pick(themeKeys)];
  const seeds = seed ? seedVariants(seed) : [];
  const pat = rng.pick(['adjnoun', 'adjnoun', 'adjnoun', 'nounnoun', 'nounnoun', 'blend', 'syl', 'syl', 'allit', 'title', 'of', 'the', 'single']);
  let parts;
  switch (pat) {
    case 'nounnoun': parts = [rng.pick(t.noun), rng.pick(t2.noun)]; break;
    case 'blend': parts = [blend(rng.pick(t.noun), rng.pick(t2.noun))]; break;
    case 'syl': parts = rng.chance(0.35) ? [syllableName(t.syl), rng.pick(t.noun)] : [syllableName(t.syl)]; break;
    case 'allit': {
      const n = rng.pick(t.noun);
      const pool = t.adj.filter((a) => a[0].toLowerCase() === n[0].toLowerCase());
      parts = [pool.length ? rng.pick(pool) : rng.pick(t.adj), n];
      break;
    }
    case 'title': parts = [rng.pick(TITLES), rng.pick(t.noun)]; break;
    case 'of': parts = [rng.pick(t.noun), rng.pick(OFS), 'The', rng.pick(t2.noun)]; break;
    case 'the': parts = ['The', rng.pick(t.adj), rng.pick(t.noun)]; break;
    case 'single': parts = [rng.pick(t.noun)]; break;
    default: parts = [rng.pick(t.adj), rng.pick(t.noun)];
  }
  if (seeds.length && rng.chance(0.75)) {
    const v = rng.pick(seeds);
    if (v.length > 1) parts = v; // seed + suffix stands on its own
    else if (parts.length === 1 || rng.chance(0.3)) parts = rng.chance(0.5) ? [v[0], parts.at(-1)] : [parts[0], v[0]];
    else parts[rng.int(parts.length)] = v[0];
  }
  return parts;
}

/**
 * opts: { themes: string[], seed, style, numbers: 'never'|'some'|'always', leet, flair, maxLen, count }
 */
export function generateNicknames(opts = {}) {
  const themeKeys = (opts.themes && opts.themes.length ? opts.themes : Object.keys(THEMES)).filter((k) => THEMES[k]);
  const count = opts.count || 30;
  const maxLen = opts.maxLen || 0;
  const out = new Set();
  let guard = 0;
  while (out.size < count && guard++ < count * 40) {
    const parts = buildParts(themeKeys, (opts.seed || '').trim());
    let name = format(parts, opts.style || 'pascal');
    const num = opts.numbers === 'always' || (opts.numbers === 'some' && rng.chance(0.35));
    if (num) {
      const n = rng.chance(0.5) ? rng.pick(COOL_NUMS) : String(rng.int(rng.chance(0.5) ? 100 : 10000));
      const sep = /[._-]/.test(name) ? (name.match(/[._-]/) || [''])[0] : rng.chance(0.3) ? '_' : '';
      name += sep + n;
    }
    if (opts.leet && rng.chance(0.6)) name = leetify(name);
    if (opts.flair && rng.chance(0.45)) {
      const f = rng.pick(['xX_|_Xx', 'x|x', '_|_', 'iam|', '|TTV', '|YT', 'its|', '|GG', 'The|', 'Not|', '|Official', '|Main']);
      const [a, b] = f.split('|');
      name = a + name + b;
    }
    if (maxLen && name.length > maxLen) continue;
    if (name.length < 3) continue;
    out.add(name);
  }
  return [...out];
}

export const NICK_COUNT_INFO = () => {
  let n = 0;
  for (const t of Object.values(THEMES)) n += t.adj.length + t.noun.length;
  return n;
};
