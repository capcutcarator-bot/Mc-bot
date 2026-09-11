# MC Helper Bot

Mineflayer-based Minecraft utility bot: AFK anti-kick, mining, structure/block finding, follow, and mob-guard — all chat-command controlled with on/off toggles.

## Commands (in-game chat, default prefix `.`)

| Command | Description |
|---|---|
| `.help` | Shows all commands |
| `.come` | Bot walks to you |
| `.follow [player]` | Bot follows a player continuously (default: you) |
| `.mine <block> [count]` | Mines the nearest matching block(s), e.g. `.mine diamond_ore 5` |
| `.find <name>` | Finds nearest block, or approximates a structure (`village`, `stronghold`, `mineshaft`, `nether_fortress`, `ocean_monument`) |
| `.guard on` / `.guard off` | Auto-attacks nearby hostile mobs so it doesn't die |
| `.guard players on/off` | Also targets nearby players while guard is on (own server only — use carefully) |
| `.afk on` / `.afk off` | Anti-kick idle look/jump loop (on by default) |
| `.goto <x> <y> <z>` | Walks to exact coordinates |
| `.status` | Shows health, food, position, dimension |
| `.inv` | Lists inventory contents |
| `.drop <item> [count]` | Tosses an item (omit count to drop all) |
| `.equip <item> [slot]` | Equips an item to `hand` (default), `head`, `torso`, `legs`, `feet`, or `off-hand` |
| `.fish on` / `.fish off` | Auto-fishing loop (equips rod, casts, repeats) |
| `.farm on` / `.farm off` | Auto-harvests mature wheat/carrots/potatoes/beetroots and replants |
| `.autoeat on/off` | Eats food from inventory when hungry (on by default) |
| `.autoarmor on/off` | Auto-equips the best armor piece it's carrying per slot (on by default) |
| `.autototem on/off` | Keeps a Totem of Undying in the off-hand if it has one (on by default) |
| `.cmd <text>` | Sends a raw chat/command line — only does anything privileged if the bot's account has OP/permissions on your server |
| `.online on [radius]` | Requires bot to be OP'd + creative — flies to random points within `radius` blocks (default 250) continuously, like a roaming player |
| `.online off` | Stops roaming |
| `.stop` | Cancels current pathing/fighting/roaming |

Only the username set as `owner` in `index.js`'s `CONFIG` can issue commands — this stops random players in your server chat from controlling the bot.

## Config (hardcoded in `index.js`)

No `.env` needed — everything is set directly at the top of `index.js`:

```js
const CONFIG = {
  host: 'pvpbd.aternos.me',
  port: 57489,
  username: 'shuvo_kanokar',
  version: false,      // false = auto-detect
  auth: 'offline',
  owner: 'play_yt',    // lowercase
  prefix: '.',
};
```

Edit these values directly in the file if your server IP, bot name, or owner username ever changes.

## Running it (any hosting panel / Termux / PC)

```bash
npm install
npm start
```

That's it — since config is hardcoded, any host that just runs `npm install && npm start` (your BotNest panel, Termux, Railway, Render, etc.) will work with no extra environment variable setup.

**Note:** if your host restarts/sleeps the process on inactivity, the bot's own `onEnd` handler auto-reconnects with backoff on disconnect — but if the whole process is killed, your hosting panel needs to restart it (most panels/`npm start` process managers do this automatically).

## Notes on `.find`

Mineflayer can't natively "locate" generated structures the way `/locate` does — `.find village` etc. works by scanning already-loaded chunks (128-block radius) for a telltale block (e.g. `bell` for villages, `end_portal_frame` for strongholds). It's a best-effort heuristic, not a guaranteed structure locator — fly/walk around first so more chunks are loaded if it comes back empty.

## Notes on `.online` (roam mode)

- The bot's Minecraft account needs to actually be OP'd on the server (`/op <bot_username>` in the server console) for `/gamemode creative` and creative-flight to work — without OP the server will just reject it.
- **If you're on Aternos (or another free host):** their terms of service disallow bots/AFK clients on the server, regardless of whether the bot moves around or sits still. Roaming reduces the odds of a naive idle-timeout kick but doesn't make it compliant — there's still a ban/flag risk. Use at your own judgment.

## If you see ECONNREFUSED 127.0.0.1:25565

That means `CONFIG.host`/`CONFIG.port` in `index.js` weren't pointing at your real server (or got reset to a default) — double check the values at the top of `index.js` match your actual server address and port.

## Customizing

- Add more hostile mobs to guard against: edit `HOSTILE_MOBS` in `index.js`.
- Add more structure hints: edit `STRUCTURE_HINTS` in `index.js`.
- Add new commands: add a `case` in `handleCommand()`.
