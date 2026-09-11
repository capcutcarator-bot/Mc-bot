const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { plugin: pvpPlugin } = require('mineflayer-pvp');
const { plugin: collectBlockPlugin } = require('mineflayer-collectblock');

// ---------- CONFIG (hardcoded — no .env needed) ----------
const CONFIG = {
  host: 'pvpbd.aternos.me',
  port: 57489,
  username: 'shuvo_kanokar',
  version: false, // false = auto-detect
  auth: 'offline',
  owner: 'play_yt', // lowercase
  prefix: '.',
};

// Structure signature blocks (best-effort scan, mineflayer can't natively
// locate generated structures — this checks nearby loaded chunks for
// blocks that are strong indicators of a given structure)
const STRUCTURE_HINTS = {
  village: ['bell', 'lectern', 'composter'],
  stronghold: ['end_portal_frame', 'mossy_stone_bricks', 'stone_bricks'],
  mineshaft: ['rail', 'cobweb'],
  nether_fortress: ['nether_brick_fence', 'nether_brick_stairs'],
  ocean_monument: ['prismarine', 'sea_lantern'],
};

let bot;
let reconnectDelay = 5000;

function createBot() {
  bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version,
    auth: CONFIG.auth,
  });

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvpPlugin);
  bot.loadPlugin(collectBlockPlugin);

  // per-bot runtime state
  bot.helper = {
    afkEnabled: true,
    guardEnabled: false,
    guardPlayers: false,
    autoEat: true,
    autoTotem: true,
    autoArmor: true,
    fishing: false,
    farming: false,
    roaming: false,
    followTarget: null,
    guardInterval: null,
    afkInterval: null,
    maintenanceInterval: null,
    farmInterval: null,
    busy: false,
  };

  bot.once('spawn', onSpawn);
  bot.on('chat', onChat);
  bot.on('kicked', (reason) => console.log('[KICKED]', reason));
  bot.on('error', (err) => console.log('[ERROR]', err.message));
  bot.on('end', onEnd);
}

function onSpawn() {
  console.log(`[OK] Bot spawned as ${bot.username} on ${CONFIG.host}:${CONFIG.port}`);
  reconnectDelay = 5000;

  const mcData = require('minecraft-data')(bot.version);
  const movements = new Movements(bot, mcData);
  bot.pathfinder.setMovements(movements);

  startAfkLoop();
  startMaintenanceLoop();
}

function onEnd() {
  console.log('[DISCONNECTED] retrying in', reconnectDelay / 1000, 's');
  clearAfkLoop();
  clearGuardLoop();
  clearMaintenanceLoop();
  clearFarmLoop();
  setTimeout(createBot, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 1.5, 60000);
}

// ---------- CHAT / COMMANDS ----------
function onChat(username, message) {
  if (username === bot.username) return;
  if (!message.startsWith(CONFIG.prefix)) return;

  // Only the owner can control the bot (prevents randoms hijacking it)
  if (CONFIG.owner && username.toLowerCase() !== CONFIG.owner) {
    return;
  }

  const args = message.slice(CONFIG.prefix.length).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  try {
    handleCommand(username, cmd, args);
  } catch (err) {
    bot.chat(`Error: ${err.message}`);
  }
}

function handleCommand(username, cmd, args) {
  switch (cmd) {
    case 'help':
      return cmdHelp();
    case 'come':
      return cmdCome(username);
    case 'follow':
      return cmdFollow(args[0] || username);
    case 'mine':
      return cmdMine(args);
    case 'find':
      return cmdFind(args);
    case 'guard':
      return cmdGuard(args[0], args[1]);
    case 'afk':
      return cmdAfk(args[0]);
    case 'goto':
      return cmdGoto(args);
    case 'status':
      return cmdStatus();
    case 'inventory':
    case 'inv':
      return cmdInventory();
    case 'drop':
      return cmdDrop(args);
    case 'equip':
      return cmdEquip(args);
    case 'fish':
      return cmdFish(args[0]);
    case 'farm':
      return cmdFarm(args[0]);
    case 'autoeat':
      return cmdAutoEat(args[0]);
    case 'autoarmor':
      return cmdAutoArmor(args[0]);
    case 'autototem':
      return cmdAutoTotem(args[0]);
    case 'cmd':
      return cmdRaw(args);
    case 'online':
      return cmdOnline(args);
    case 'stop':
      return cmdStop();
    default:
      bot.chat(`Unknown command. Try ${CONFIG.prefix}help`);
  }
}

function cmdHelp() {
  const p = CONFIG.prefix;
  const lines = [
    `${p}come - amar kache asbe`,
    `${p}follow [player] - piche piche hatbe (off korte ${p}stop)`,
    `${p}mine <block> [count] - block mine korbe (e.g. ${p}mine diamond_ore 5)`,
    `${p}find <name> - block/structure khuje ber korbe (village, stronghold, ba jekono block name)`,
    `${p}guard on/off - kache ashle hostile mob attack korbe`,
    `${p}guard players on/off - mob shoho nearby player o attack korbe (own server e sabdhane use koro)`,
    `${p}afk on/off - anti-kick idle movement`,
    `${p}goto <x> <y> <z> - specific coordinate e jabe`,
    `${p}status - health/food/position dekhabe`,
    `${p}inv - inventory list dekhabe`,
    `${p}drop <item> [count] - item felbe`,
    `${p}equip <item> [head|torso|legs|feet|off-hand|hand] - item equip korbe`,
    `${p}fish on/off - auto fishing loop`,
    `${p}farm on/off - auto crop harvest+replant (wheat/carrot/potato/beetroot)`,
    `${p}autoeat on/off - kom khabar thakle nijei khabe (default ON)`,
    `${p}autoarmor on/off - best armor nijei pore nibe (default ON)`,
    `${p}autototem on/off - totem of undying thakle off-hand e nijei lagabe (default ON)`,
    `${p}cmd <text> - raw server command pathabe (e.g. ${p}cmd /gamemode creative) - bot OP hole e kaj korbe`,
    `${p}online on [radius] - bot ke OP+creative dile, random e fly kore pura world ghurbe (default radius 250)`,
    `${p}online off - roaming bondho, .stop dileo thambe`,
    `${p}stop - shob current action bondho`,
  ];
  lines.forEach((l) => bot.chat(l));
}

function cmdCome(username) {
  const target = bot.players[username]?.entity;
  if (!target) return bot.chat("Tomake dekhte parchi na, kache aso.");
  bot.helper.busy = true;
  const goal = new goals.GoalNear(target.position.x, target.position.y, target.position.z, 1);
  bot.pathfinder.setGoal(goal);
  bot.chat('Aschi!');
}

function cmdFollow(playerName) {
  const target = bot.players[playerName]?.entity;
  if (!target) return bot.chat(`${playerName} ke dekhte parchi na.`);
  bot.helper.followTarget = playerName;
  bot.helper.busy = true;
  const goal = new goals.GoalFollow(target, 2);
  bot.pathfinder.setGoal(goal, true);
  bot.chat(`${playerName} ke follow korchi.`);
}

async function cmdMine(args) {
  const blockName = args[0];
  const count = parseInt(args[1] || '1');
  if (!blockName) return bot.chat(`Use: ${CONFIG.prefix}mine <block_name> [count]`);

  const mcData = require('minecraft-data')(bot.version);
  const blockType = mcData.blocksByName[blockName];
  if (!blockType) return bot.chat(`"${blockName}" naame kono block nai. Minecraft block id use koro (e.g. diamond_ore).`);

  const blocks = bot.findBlocks({
    matching: blockType.id,
    maxDistance: 64,
    count: Math.max(count, 1),
  });

  if (!blocks.length) return bot.chat(`Kache "${blockName}" pelam na (64 block radius e).`);

  bot.helper.busy = true;
  bot.chat(`${blocks.length}ta ${blockName} khuje pelam, mine korchi...`);
  try {
    const targets = blocks.map((pos) => bot.blockAt(pos)).filter(Boolean);
    await bot.collectBlock.collect(targets, { ignoreNoPath: true });
    bot.chat('Mining shesh!');
  } catch (err) {
    bot.chat(`Mining fail: ${err.message}`);
  }
  bot.helper.busy = false;
}

function cmdFind(args) {
  const query = (args[0] || '').toLowerCase();
  if (!query) return bot.chat(`Use: ${CONFIG.prefix}find <village|stronghold|mineshaft|block_name>`);

  const mcData = require('minecraft-data')(bot.version);
  const hints = STRUCTURE_HINTS[query];

  if (hints) {
    // Structure search: scan for the strongest signature block among hints
    for (const blockName of hints) {
      const bt = mcData.blocksByName[blockName];
      if (!bt) continue;
      const found = bot.findBlock({ matching: bt.id, maxDistance: 128 });
      if (found) {
        bot.chat(`${query} er signature (${blockName}) paoa gelo: ${found.position.x}, ${found.position.y}, ${found.position.z} (~approx, exact structure na o hote pare)`);
        return;
      }
    }
    return bot.chat(`128 block radius e "${query}" er kono chinho pelam na. Loaded chunk kom thakle dure gele abar try koro.`);
  }

  // plain block search
  const blockType = mcData.blocksByName[query];
  if (!blockType) return bot.chat(`"${query}" chinte parlam na. Block name ba: village/stronghold/mineshaft/nether_fortress/ocean_monument use koro.`);

  const found = bot.findBlock({ matching: blockType.id, maxDistance: 128 });
  if (!found) return bot.chat(`"${query}" 128 block radius e nai.`);
  bot.chat(`Paoa gelo: ${found.position.x}, ${found.position.y}, ${found.position.z}`);
}

function cmdGuard(sub, state) {
  // ".guard players on/off" toggles whether hostile-player targeting is included
  if (sub === 'players') {
    if (state === 'on') {
      bot.helper.guardPlayers = true;
      if (!bot.helper.guardEnabled) {
        bot.helper.guardEnabled = true;
        startGuardLoop();
      }
      bot.chat('Guard: players o target korbo ekhon theke.');
    } else if (state === 'off') {
      bot.helper.guardPlayers = false;
      bot.chat('Guard: player targeting OFF (mob-only).');
    } else {
      bot.chat(`Use: ${CONFIG.prefix}guard players on | ${CONFIG.prefix}guard players off`);
    }
    return;
  }

  if (sub === 'on') {
    if (bot.helper.guardEnabled) return bot.chat('Guard already ON ache.');
    bot.helper.guardEnabled = true;
    startGuardLoop();
    bot.chat('Guard mode ON - kache mob asle attack korbo.');
  } else if (sub === 'off') {
    bot.helper.guardEnabled = false;
    bot.helper.guardPlayers = false;
    clearGuardLoop();
    bot.pvp.stop();
    bot.chat('Guard mode OFF.');
  } else {
    bot.chat(`Use: ${CONFIG.prefix}guard on | ${CONFIG.prefix}guard off | ${CONFIG.prefix}guard players on/off`);
  }
}

function cmdAfk(state) {
  if (state === 'on') {
    bot.helper.afkEnabled = true;
    startAfkLoop();
    bot.chat('AFK anti-kick ON.');
  } else if (state === 'off') {
    bot.helper.afkEnabled = false;
    clearAfkLoop();
    bot.chat('AFK anti-kick OFF.');
  } else {
    bot.chat(`Use: ${CONFIG.prefix}afk on | ${CONFIG.prefix}afk off`);
  }
}

function cmdStop() {
  bot.pathfinder.setGoal(null);
  bot.pvp.stop();
  bot.helper.followTarget = null;
  bot.helper.busy = false;
  bot.helper.roaming = false;
  clearControlStates();
  bot.chat('Stopped.');
}

function clearControlStates() {
  ['forward', 'back', 'left', 'right', 'jump', 'sprint'].forEach((c) => bot.setControlState(c, false));
}

// ---------- GUARD LOOP (auto-fight nearby hostiles) ----------
const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'creeper', 'spider', 'cave_spider', 'enderman',
  'witch', 'zombie_villager', 'husk', 'stray', 'drowned', 'phantom',
  'pillager', 'vindicator', 'evoker', 'ravager', 'blaze', 'ghast',
  'magma_cube', 'slime', 'silverfish', 'guardian', 'elder_guardian',
]);

function startGuardLoop() {
  clearGuardLoop();
  bot.helper.guardInterval = setInterval(() => {
    if (!bot.helper.guardEnabled) return;
    if (bot.pvp.target) return; // already fighting someone

    const entity = bot.nearestEntity((e) => {
      if (e === bot.entity) return false;
      if (bot.entity.position.distanceTo(e.position) > 16) return false;

      if (e.type === 'mob') {
        const name = (e.name || e.mobType || '').toLowerCase();
        return HOSTILE_MOBS.has(name);
      }
      if (e.type === 'player' && bot.helper.guardPlayers) {
        return e.username && e.username.toLowerCase() !== CONFIG.owner;
      }
      return false;
    });

    if (entity) {
      bot.pvp.attack(entity);
    }
  }, 1000);
}

function clearGuardLoop() {
  if (bot.helper.guardInterval) {
    clearInterval(bot.helper.guardInterval);
    bot.helper.guardInterval = null;
  }
}

// ---------- AFK ANTI-KICK LOOP ----------
function startAfkLoop() {
  clearAfkLoop();
  bot.helper.afkInterval = setInterval(() => {
    if (!bot.helper.afkEnabled) return;
    if (bot.helper.busy || bot.pathfinder?.isMoving()) return; // don't fight own pathfinding

    // small random look + jump, doesn't move the bot away from spot
    const yaw = bot.entity.yaw + (Math.random() - 0.5);
    const pitch = (Math.random() - 0.5) * 0.5;
    bot.look(yaw, pitch, true);
    bot.setControlState('jump', true);
    setTimeout(() => bot.setControlState('jump', false), 250);
  }, 20000 + Math.random() * 15000);
}

function clearAfkLoop() {
  if (bot.helper.afkInterval) {
    clearInterval(bot.helper.afkInterval);
    bot.helper.afkInterval = null;
  }
}

// ---------- GOTO / STATUS / INVENTORY ----------
function cmdGoto(args) {
  const [x, y, z] = args.map(Number);
  if ([x, y, z].some((n) => Number.isNaN(n))) {
    return bot.chat(`Use: ${CONFIG.prefix}goto <x> <y> <z>`);
  }
  bot.helper.busy = true;
  bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
  bot.chat(`Jacchi: ${x}, ${y}, ${z}`);
}

function cmdStatus() {
  const pos = bot.entity.position;
  bot.chat(
    `HP: ${bot.health?.toFixed(1)}/20 | Food: ${bot.food}/20 | ` +
    `Pos: ${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)} | ` +
    `Dimension: ${bot.game?.dimension || 'unknown'}`
  );
}

function cmdInventory() {
  const items = bot.inventory.items();
  if (!items.length) return bot.chat('Inventory empty.');
  const summary = items.map((i) => `${i.name} x${i.count}`).join(', ');
  // Minecraft chat lines get cut off if too long — split into chunks
  const chunks = summary.match(/.{1,240}(,|$)/g) || [summary];
  chunks.forEach((c) => bot.chat(c));
}

function cmdDrop(args) {
  const itemName = args[0];
  const count = parseInt(args[1] || '0'); // 0 = drop all of that item
  if (!itemName) return bot.chat(`Use: ${CONFIG.prefix}drop <item> [count]`);

  const item = bot.inventory.items().find((i) => i.name === itemName);
  if (!item) return bot.chat(`"${itemName}" tomar kache nai.`);

  const toDrop = count > 0 ? Math.min(count, item.count) : item.count;
  bot.toss(item.type, item.metadata, toDrop)
    .then(() => bot.chat(`${toDrop}x ${itemName} felce dilam.`))
    .catch((err) => bot.chat(`Drop fail: ${err.message}`));
}

const EQUIP_DESTINATIONS = new Set(['hand', 'head', 'torso', 'legs', 'feet', 'off-hand']);

function cmdEquip(args) {
  const itemName = args[0];
  const dest = args[1] || 'hand';
  if (!itemName) return bot.chat(`Use: ${CONFIG.prefix}equip <item> [head|torso|legs|feet|off-hand|hand]`);
  if (!EQUIP_DESTINATIONS.has(dest)) return bot.chat(`Invalid slot. Use: hand, head, torso, legs, feet, off-hand`);

  const item = bot.inventory.items().find((i) => i.name === itemName);
  if (!item) return bot.chat(`"${itemName}" tomar kache nai.`);

  bot.equip(item, dest)
    .then(() => bot.chat(`${itemName} equip kore nilam (${dest}).`))
    .catch((err) => bot.chat(`Equip fail: ${err.message}`));
}

function cmdRaw(args) {
  const text = args.join(' ');
  if (!text) return bot.chat(`Use: ${CONFIG.prefix}cmd <raw chat/command text>`);
  bot.chat(text); // works for /commands only if bot account has the permission (op)
}

// ---------- AUTO EAT / ARMOR / TOTEM TOGGLES ----------
function cmdAutoEat(state) {
  if (state === 'on') { bot.helper.autoEat = true; return bot.chat('Auto-eat ON.'); }
  if (state === 'off') { bot.helper.autoEat = false; return bot.chat('Auto-eat OFF.'); }
  bot.chat(`Use: ${CONFIG.prefix}autoeat on | ${CONFIG.prefix}autoeat off`);
}

function cmdAutoArmor(state) {
  if (state === 'on') { bot.helper.autoArmor = true; return bot.chat('Auto-armor ON.'); }
  if (state === 'off') { bot.helper.autoArmor = false; return bot.chat('Auto-armor OFF.'); }
  bot.chat(`Use: ${CONFIG.prefix}autoarmor on | ${CONFIG.prefix}autoarmor off`);
}

function cmdAutoTotem(state) {
  if (state === 'on') { bot.helper.autoTotem = true; return bot.chat('Auto-totem ON.'); }
  if (state === 'off') { bot.helper.autoTotem = false; return bot.chat('Auto-totem OFF.'); }
  bot.chat(`Use: ${CONFIG.prefix}autototem on | ${CONFIG.prefix}autototem off`);
}

const FOOD_NAMES = new Set([
  'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton',
  'cooked_rabbit', 'cooked_cod', 'cooked_salmon', 'bread', 'baked_potato',
  'apple', 'golden_apple', 'enchanted_golden_apple', 'carrot', 'potato',
  'melon_slice', 'beetroot', 'pumpkin_pie', 'cookie', 'mushroom_stew',
]);

const ARMOR_RANK = ['leather', 'golden', 'chainmail', 'iron', 'diamond', 'netherite'];
const ARMOR_SLOTS = {
  helmet: 'head', chestplate: 'torso', leggings: 'legs', boots: 'feet',
};

function armorTier(name) {
  const material = ARMOR_RANK.find((m) => name.startsWith(m));
  return material ? ARMOR_RANK.indexOf(material) : -1;
}

// One loop handles auto-eat, auto-totem, and auto-armor so we don't
// stack many separate timers.
function startMaintenanceLoop() {
  clearMaintenanceLoop();
  bot.helper.maintenanceInterval = setInterval(async () => {
    try {
      if (bot.helper.autoTotem) await maintainTotem();
      if (bot.helper.autoEat) await maintainFood();
      if (bot.helper.autoArmor) await maintainArmor();
    } catch (err) {
      // swallow — these are background conveniences, don't spam chat on every miss
    }
  }, 3000);
}

function clearMaintenanceLoop() {
  if (bot.helper.maintenanceInterval) {
    clearInterval(bot.helper.maintenanceInterval);
    bot.helper.maintenanceInterval = null;
  }
}

async function maintainTotem() {
  const offhand = bot.inventory.slots[45]; // off-hand slot
  if (offhand && offhand.name === 'totem_of_undying') return;
  const totem = bot.inventory.items().find((i) => i.name === 'totem_of_undying');
  if (totem) await bot.equip(totem, 'off-hand');
}

async function maintainFood() {
  if (bot.food >= 18) return;
  if (bot.helper.busy) return; // don't interrupt mining/pathing to eat mid-swing
  const food = bot.inventory.items().find((i) => FOOD_NAMES.has(i.name));
  if (!food) return;
  await bot.equip(food, 'hand');
  await bot.consume();
}

async function maintainArmor() {
  for (const [pieceSuffix, slot] of Object.entries(ARMOR_SLOTS)) {
    const worn = bot.inventory.slots[bot.getEquipmentDestSlot(slot)];
    const candidates = bot.inventory.items().filter((i) => i.name.endsWith(pieceSuffix));
    if (!candidates.length) continue;

    const best = candidates.reduce((a, b) => (armorTier(a.name) >= armorTier(b.name) ? a : b));
    const wornTier = worn ? armorTier(worn.name) : -1;
    if (armorTier(best.name) > wornTier) {
      await bot.equip(best, slot);
    }
  }
}

// ---------- AUTO FISHING ----------
async function cmdFish(state) {
  if (state === 'on') {
    if (bot.helper.fishing) return bot.chat('Fishing already ON ache.');
    const rod = bot.inventory.items().find((i) => i.name === 'fishing_rod');
    if (!rod) return bot.chat('Fishing rod nai inventory te.');
    await bot.equip(rod, 'hand');
    bot.helper.fishing = true;
    bot.chat('Fishing ON.');
    fishLoop();
  } else if (state === 'off') {
    bot.helper.fishing = false;
    bot.chat('Fishing OFF.');
  } else {
    bot.chat(`Use: ${CONFIG.prefix}fish on | ${CONFIG.prefix}fish off`);
  }
}

async function fishLoop() {
  while (bot.helper.fishing) {
    try {
      await bot.fish();
    } catch (err) {
      bot.helper.fishing = false;
      bot.chat(`Fishing stopped: ${err.message}`);
      break;
    }
    await sleep(500);
  }
}

// ---------- AUTO FARMING ----------
const CROP_MAX_AGE = { wheat: 7, carrots: 7, potatoes: 7, beetroots: 3 };
const CROP_SEED = { wheat: 'wheat_seeds', carrots: 'carrot', potatoes: 'potato', beetroots: 'beetroot_seeds' };

function cmdFarm(state) {
  if (state === 'on') {
    if (bot.helper.farming) return bot.chat('Farm mode already ON ache.');
    bot.helper.farming = true;
    startFarmLoop();
    bot.chat('Auto-farm ON - mature crop pele nijei harvest+replant korbo.');
  } else if (state === 'off') {
    bot.helper.farming = false;
    clearFarmLoop();
    bot.chat('Auto-farm OFF.');
  } else {
    bot.chat(`Use: ${CONFIG.prefix}farm on | ${CONFIG.prefix}farm off`);
  }
}

function startFarmLoop() {
  clearFarmLoop();
  bot.helper.farmInterval = setInterval(async () => {
    if (!bot.helper.farming || bot.helper.busy) return;
    try {
      await farmTick();
    } catch (err) {
      // ignore single-tick failures (e.g. path blocked), retry next tick
    }
  }, 4000);
}

function clearFarmLoop() {
  if (bot.helper.farmInterval) {
    clearInterval(bot.helper.farmInterval);
    bot.helper.farmInterval = null;
  }
}

async function farmTick() {
  const mcData = require('minecraft-data')(bot.version);
  const cropNames = Object.keys(CROP_MAX_AGE);
  const cropIds = cropNames
    .map((n) => mcData.blocksByName[n]?.id)
    .filter((id) => id !== undefined);

  const matureBlock = bot.findBlock({
    matching: (block) => {
      if (!cropIds.includes(block.type)) return false;
      const name = block.name;
      const age = block.getProperties ? block.getProperties().age : undefined;
      return age !== undefined && Number(age) >= CROP_MAX_AGE[name];
    },
    maxDistance: 32,
  });

  if (!matureBlock) return;

  bot.helper.busy = true;
  try {
    await bot.pathfinder.goto(new goals.GoalNear(matureBlock.position.x, matureBlock.position.y, matureBlock.position.z, 1));
    await bot.dig(matureBlock);

    const seedName = CROP_SEED[matureBlock.name];
    const seed = bot.inventory.items().find((i) => i.name === seedName);
    const farmland = bot.blockAt(matureBlock.position.offset(0, -1, 0));
    if (seed && farmland) {
      await bot.equip(seed, 'hand');
      await bot.placeBlock(farmland, matureBlock.position.minus(farmland.position));
    }
  } finally {
    bot.helper.busy = false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- ONLINE / ROAM MODE (creative flight around the world) ----------
// Requires the bot's account to actually have OP + creative gamemode on the
// server (grant it via console: /op <bot_username> then let .online trigger
// /gamemode creative, or set it yourself). Without OP, flyTo will just fail
// or be rejected by the server's anti-cheat.
function cmdOnline(args) {
  const state = args[0];
  const radius = parseInt(args[1] || '250');

  if (state === 'on') {
    if (bot.helper.roaming) return bot.chat('Online/roam mode already ON ache.');
    if (!bot.creative) return bot.chat('Creative flight support pelam na (mineflayer version check koro).');

    bot.pathfinder.setGoal(null);
    bot.helper.busy = false;
    bot.helper.roaming = true;
    bot.chat('/gamemode creative'); // only takes effect if the bot account is OP
    bot.chat(`Online mode ON - ${radius} block radius e ghurte thakbo. (Bot OP na thakle eta kaj korbe na)`);
    roamLoop(radius);
  } else if (state === 'off') {
    bot.helper.roaming = false;
    bot.chat('Online mode OFF.');
  } else {
    bot.chat(`Use: ${CONFIG.prefix}online on [radius] | ${CONFIG.prefix}online off`);
  }
}

async function roamLoop(radius) {
  while (bot.helper.roaming) {
    const base = bot.entity.position;
    const dx = (Math.random() - 0.5) * 2 * radius;
    const dz = (Math.random() - 0.5) * 2 * radius;
    const y = 80 + Math.random() * 80; // stays well above most terrain
    const target = base.offset(dx, y - base.y, dz);

    try {
      await bot.creative.flyTo(target);
    } catch (err) {
      bot.helper.roaming = false;
      bot.chat(`Roam stopped: ${err.message}`);
      break;
    }

    if (!bot.helper.roaming) break;
    await sleep(3000 + Math.random() * 5000);
  }
}

createBot();
