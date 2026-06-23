# VoxelCraft

A Minecraft-like voxel sandbox that runs entirely in the browser. Built from scratch with **Three.js + TypeScript + Vite**. All art (textures), sound, and gameplay are original — no Mojang assets.

![mode: survival-lite](https://img.shields.io/badge/mode-survival--lite-6a9a3a)

## Run it

```bash
cd games/voxelcraft
npm install
npm run dev      # opens http://localhost:5174
```

Production build:

```bash
npm run build    # outputs static site to dist/
npm run preview
```

Click **Play**, then the pointer locks and you're in. Press **Esc** to release the mouse.

## Controls

| Input | Action |
|-------|--------|
| **WASD** | Move |
| **Mouse** | Look |
| **Space** | Jump / swim up · **double-tap** to toggle fly |
| **Ctrl** | Sprint (widens FOV) |
| **Shift** | Sneak (slow, won't walk off edges) / fly down |
| **Left click** | Break block (hold to mine) / attack mob |
| **Right click** | Place block / eat food / open crafting table |
| **1–9 / scroll** | Select hotbar slot |
| **E** | Open inventory + 2×2 crafting |
| **F5** | Cycle view: first-person → third-back → third-front |
| **F** | Toggle fly / creative (invulnerable, instant break, infinite blocks) |

## Features

- **Infinite voxel world** — seeded simplex-noise terrain: plains, hills, beaches, oceans, caves, ore veins, and oak trees. Chunked (16×128×16) with face-culled meshing and frustum culling.
- **Smooth streaming** — chunk generation + meshing run on a per-frame **time budget** (no stutter spikes while the world loads); each chunk meshes exactly once (neighbours generated first); the mesher skips the all-air region above each column.
- **Camera & views** — first-person, third-person behind, and third-person front (F5), with terrain-aware camera clipping; sprinting widens the FOV.
- **Player avatar** — a blocky Steve-like model with walk animation, shown in third-person.
- **Sky** — sun and moon that arc across the sky with the day/night cycle, plus drifting clouds.
- **Original pixel art** — every 16×16 tile is procedurally painted into a texture atlas (grass, dirt, stone, ores, wood, leaves, water, glass, sand, crafting table, item icons, destroy-stage cracks). Nearest-filtered for crisp pixels.
- **Survival gameplay** — health + hunger with regeneration, starvation, fall damage, and drowning; hardness-based mining with a 5-stage crack overlay and tool bonuses; block drops as collectible item entities.
- **Inventory & crafting** — 36-slot inventory, drag/split item movement, 2×2 inventory crafting and a 3×3 crafting table. Recipes: log→planks→sticks, crafting table, wooden + stone tools.
- **Physics** — gravity + swept AABB collision; sneaking slows you and stops you walking off ledges; swimming, fall damage, and drowning.
- **Mobs** — passive pigs, cows, sheep, and chickens that wander, plus hostile zombies that spawn at night, path toward you, and melee. Box-model entities with walk animation; combat with knockback.
- **Day/night cycle** — moving sky-color gradient, distance fog, and a global daylight factor; zombies burn off after dawn.
- **Procedural audio** — Web Audio synthesizes every SFX (footsteps per material, break/place, pickup, hurt, eat). No audio files.
- **Persistence** — world edits + player + inventory autosave to `localStorage` and reload on return.

## Architecture

```
src/
  main.ts                 entry + title screen
  Game.ts                 orchestrator: renderer, loop, input, interactions
  engine/
    constants.ts          chunk dims + indexing
    Chunk.ts              voxel column + meshes
    ChunkMesher.ts        visible-face mesh builder (opaque + transparent)
    TerrainGenerator.ts   noise terrain, ores, caves, trees
    World.ts              chunk store, streaming, edits, persistence
    VoxelRaycaster.ts     DDA block targeting
  blocks/blockTypes.ts    block registry
  items/items.ts          item registry + drops
  textures/               procedural atlas generation
  player/Player.ts        pointer-look + AABB physics
  inventory/              Inventory model + Recipes
  survival/PlayerStats.ts health/hunger/air
  entities/               item pickups (EntityManager) + Mobs
  audio/SoundEngine.ts    Web Audio SFX
  ui/                     Hud + InventoryScreen
  persistence/WorldStore.ts  localStorage save/load
```

The world is rendered with a single texture atlas and two `MeshBasicMaterial`s (opaque + transparent) whose `color` is scaled for day/night; mobs use `MeshLambert` lit by one hemisphere light. Fixed per-face vertex shading gives the signature blocky depth without a lighting pass.
