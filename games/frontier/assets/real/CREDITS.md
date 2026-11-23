# Realistic asset set, batch 1 (`assets/real/`)

Made in Blender 5.2 with headless Python generator scripts. Geometry was modelled procedurally. Materials come from **Poly Haven** scans, baked to one PBR material per model (plus `window`, `fire` or `crop` where noted).

**License:** every source asset is **CC0 1.0** (public domain, https://polyhaven.com/license). The generated models and textures are released under CC0 as well. No attribution is required; it is listed here for reference.

## Conventions
- glTF 2.0 binary (.glb), textures embedded, **no Draco**.
- +Y up, 1 unit = 1 m, origin at the base centre, real-world size.
- Size below is X × Z(depth) × height in metres.
- `window` material: dark glass with emissive **black** by default. At night, set e.g. `mat.emissive.setRGB(1, 0.62, 0.28)` (and `emissiveIntensity`) to light it.
- `fire` (campfire) is emissive orange. `crop` and the tree/bush materials use alphaMode MASK and are double-sided.
- Ambient occlusion is baked into the base colour, so no `uv2` is needed. Normal and ORM (roughness in G) maps are included on the building materials.

## Models

| file | tris | KB (original) | size (m) | Poly Haven sources (CC0) |
|---|---|---|---|---|
| bush.glb | 260 | 369.8 | 2.76 × 2.37 × 1.44 | [island_tree_02](https://polyhaven.com/a/island_tree_02) (leaf scans), [bark_brown_02](https://polyhaven.com/a/bark_brown_02) |
| campfire.glb | 317 | 138.7 | 1.52 × 1.54 × 0.57 | [rock_surface](https://polyhaven.com/a/rock_surface), [bark_brown_02](https://polyhaven.com/a/bark_brown_02) |
| castle_keep.glb | 1002 | 658.0 | 15.0 × 16.25 × 21.5 | [castle_wall_varriation](https://polyhaven.com/a/castle_wall_varriation), [grey_roof_tiles](https://polyhaven.com/a/grey_roof_tiles), [medieval_wood](https://polyhaven.com/a/medieval_wood) |
| farm_field.glb | 570 | 337.6 | 8.2 × 6.2 × 0.85 | [farm_soil](https://polyhaven.com/a/farm_soil), [medieval_wood](https://polyhaven.com/a/medieval_wood), [island_tree_02](https://polyhaven.com/a/island_tree_02) (leaf scans) |
| house_ancient.glb | 346 | 510.4 | 9.1 × 8.66 × 5.05 | [clay_plaster](https://polyhaven.com/a/clay_plaster), [clay_roof_tiles](https://polyhaven.com/a/clay_roof_tiles), [stone_wall](https://polyhaven.com/a/stone_wall), [medieval_wood](https://polyhaven.com/a/medieval_wood) |
| house_earlymodern.glb | 1522 | 679.0 | 9.6 × 8.17 × 11.55 | [castle_brick_07](https://polyhaven.com/a/castle_brick_07), [grey_roof_tiles](https://polyhaven.com/a/grey_roof_tiles), [stone_wall](https://polyhaven.com/a/stone_wall), [medieval_wood](https://polyhaven.com/a/medieval_wood) |
| house_medieval.glb | 1306 | 523.5 | 8.6 × 6.75 × 9.4 | [medieval_wall_01](https://polyhaven.com/a/medieval_wall_01), [medieval_wood](https://polyhaven.com/a/medieval_wood), [roof_slates_02](https://polyhaven.com/a/roof_slates_02), [stone_wall](https://polyhaven.com/a/stone_wall) |
| hut_tribal.glb | 352 | 450.1 | 6.2 × 6.2 × 5.5 | [reed_roof_04](https://polyhaven.com/a/reed_roof_04), [clay_plaster](https://polyhaven.com/a/clay_plaster), [brown_mud_dry](https://polyhaven.com/a/brown_mud_dry), [bark_brown_02](https://polyhaven.com/a/bark_brown_02) |
| palisade.glb | 580 | 149.9 | 4.01 × 0.55 × 3.5 | [bark_brown_02](https://polyhaven.com/a/bark_brown_02), [medieval_wood](https://polyhaven.com/a/medieval_wood) |
| rock_a.glb | 1400 | 126.9 | 0.95 × 1.8 × 0.8 | [rock_07](https://polyhaven.com/a/rock_07) (model, decimated) |
| rock_b.glb | 1199 | 107.5 | 0.62 × 1.2 × 0.27 | [rock_09](https://polyhaven.com/a/rock_09) (model, decimated) |
| tree_broadleaf_a.glb | 1430 | 1404.1 | 8.93 × 8.95 × 8.06 | [island_tree_02](https://polyhaven.com/a/island_tree_02) (leaf scans), [bark_brown_02](https://polyhaven.com/a/bark_brown_02) |
| tree_broadleaf_b.glb | 1370 | 1293.8 | 8.01 × 7.67 × 8.99 | [jacaranda_tree](https://polyhaven.com/a/jacaranda_tree) (leaf scans), [bark_brown_02](https://polyhaven.com/a/bark_brown_02) |
| tree_conifer.glb | 402 | 1241.2 | 8.23 × 7.75 × 11.79 | [jacaranda_tree](https://polyhaven.com/a/jacaranda_tree) (leaf scans, recoloured), [pine_bark](https://polyhaven.com/a/pine_bark) |
| wall_stone.glb | 88 | 649.6 | 8.0 × 3.2 × 7.2 | [castle_wall_varriation](https://polyhaven.com/a/castle_wall_varriation) |
| well.glb | 222 | 113.1 | 2.5 × 1.9 × 2.8 | [stone_wall](https://polyhaven.com/a/stone_wall), [medieval_wood](https://polyhaven.com/a/medieval_wood), [roof_planks](https://polyhaven.com/a/roof_planks), [bark_brown_02](https://polyhaven.com/a/bark_brown_02) |

## Ground textures (`ground/`, 1024 px JPEG, tiling)

| set | files | source (CC0) |
|---|---|---|
| grass | grass_albedo.jpg, grass_normal.jpg (OpenGL, +Y), grass_orm.jpg (R=AO, G=rough, B=metal) | [sparse_grass](https://polyhaven.com/a/sparse_grass) |
| dirt | dirt_albedo.jpg, dirt_normal.jpg (OpenGL, +Y), dirt_orm.jpg (R=AO, G=rough, B=metal) | [dirt](https://polyhaven.com/a/dirt) |
| sand | sand_albedo.jpg, sand_normal.jpg (OpenGL, +Y), sand_orm.jpg (R=AO, G=rough, B=metal) | [aerial_sand](https://polyhaven.com/a/aerial_sand) |
| rock | rock_albedo.jpg, rock_normal.jpg (OpenGL, +Y), rock_orm.jpg (R=AO, G=rough, B=metal) | [aerial_rocks_02](https://polyhaven.com/a/aerial_rocks_02) |

Generator scripts and .blend files are kept outside the repo, on the machine that built them (`%USERPROFILE%rontier-blenderatch1`).

## Game build (phone-sized copies in this folder)

The files here are the downscaled game copies; the originals (12 MB) are kept outside the repo.
- Textures 1024 → 512 px (ORM → 256 px). Small props (well, campfire, farm_field, bush, palisade, rocks) → 256 px.
- Leaf / crop alpha atlases stay lossless RGBA PNG; fully transparent texels are filled with the mean leaf colour (smaller file, no pale mip fringes).
- `rock_a` / `rock_b` simplified with meshoptimizer: 1400 → 349 and 1199 → 299 triangles.
- Ground textures → 512 px (ORM 256 px).
- Current sizes (KB): bush 52 · campfire 68 · castle_keep 158 · farm_field 95 · house_ancient 105 · house_earlymodern 211 · house_medieval 170 · hut_tribal 92 · palisade 76 · rock_a 47 · rock_b 43 · tree_broadleaf_a 221 · tree_broadleaf_b 204 · tree_conifer 149 · wall_stone 112 · well 52. Total with ground ≈ 2.2 MB.

## Batch 2: remaining buildings, mountain, ground scatter

Same pipeline and conventions as batch 1. Textures are 512 px (256 px for the scatter props). Base colour has been brightened and saturated to suit the game's lighting. Roughness is a constant 0.85, so there is no ORM map. All sources are CC0 1.0 from Poly Haven.

| file | tris | KB | size (m) | Poly Haven sources (CC0) |
|---|---|---|---|---|
| school.glb | 798 | 170.1 | 11.0 × 9.05 × 8.9 | [medieval_wall_01](https://polyhaven.com/a/medieval_wall_01), [clay_roof_tiles](https://polyhaven.com/a/clay_roof_tiles), [stone_wall](https://polyhaven.com/a/stone_wall), [medieval_wood](https://polyhaven.com/a/medieval_wood) |
| market.glb | 1642 | 208.8 | 12.0 × 9.0 × 2.87 | [rough_linen](https://polyhaven.com/a/rough_linen), [white_sandstone_blocks_02](https://polyhaven.com/a/white_sandstone_blocks_02), [raw_plank_wall](https://polyhaven.com/a/raw_plank_wall), [weathered_planks](https://polyhaven.com/a/weathered_planks), [medieval_wood](https://polyhaven.com/a/medieval_wood) |
| tower_wood.glb | 442 | 124.7 | 5.0 × 5.03 × 11.11 | [bark_brown_02](https://polyhaven.com/a/bark_brown_02), [weathered_planks](https://polyhaven.com/a/weathered_planks), [raw_plank_wall](https://polyhaven.com/a/raw_plank_wall), [reed_roof_04](https://polyhaven.com/a/reed_roof_04), [medieval_wood](https://polyhaven.com/a/medieval_wood) |
| tower_stone.glb | 384 | 146.1 | 6.3 × 6.3 × 15.6 | [castle_wall_varriation](https://polyhaven.com/a/castle_wall_varriation), [grey_roof_tiles](https://polyhaven.com/a/grey_roof_tiles), [rough_linen](https://polyhaven.com/a/rough_linen), [medieval_wood](https://polyhaven.com/a/medieval_wood) |
| lumber.glb | 756 | 132.4 | 11.09 × 7.74 × 4.83 | [bark_brown_02](https://polyhaven.com/a/bark_brown_02), [roof_slates_02](https://polyhaven.com/a/roof_slates_02), [raw_plank_wall](https://polyhaven.com/a/raw_plank_wall), [weathered_planks](https://polyhaven.com/a/weathered_planks), [medieval_wood](https://polyhaven.com/a/medieval_wood) |
| quarry.glb | 649 | 165.2 | 12.59 × 9.81 × 6.97 | [rocky_trail](https://polyhaven.com/a/rocky_trail), [white_sandstone_blocks_02](https://polyhaven.com/a/white_sandstone_blocks_02), [bark_brown_02](https://polyhaven.com/a/bark_brown_02), [weathered_planks](https://polyhaven.com/a/weathered_planks), [rough_linen](https://polyhaven.com/a/rough_linen) |
| mine.glb | 686 | 159.3 | 11.45 × 14.79 × 4.34 | [rocky_trail](https://polyhaven.com/a/rocky_trail), [bark_brown_02](https://polyhaven.com/a/bark_brown_02), [raw_plank_wall](https://polyhaven.com/a/raw_plank_wall), [medieval_wood](https://polyhaven.com/a/medieval_wood) |
| barracks.glb | 815 | 170.7 | 13.51 × 9.97 × 8.07 | [stone_wall](https://polyhaven.com/a/stone_wall), [medieval_wall_01](https://polyhaven.com/a/medieval_wall_01), [clay_roof_tiles](https://polyhaven.com/a/clay_roof_tiles), [rough_linen](https://polyhaven.com/a/rough_linen), [medieval_wood](https://polyhaven.com/a/medieval_wood) |
| range.glb | 1108 | 154.9 | 10.14 × 11.95 × 3.13 | [roof_slates_02](https://polyhaven.com/a/roof_slates_02), [raw_plank_wall](https://polyhaven.com/a/raw_plank_wall), [weathered_planks](https://polyhaven.com/a/weathered_planks), [reed_roof_04](https://polyhaven.com/a/reed_roof_04), [bark_brown_02](https://polyhaven.com/a/bark_brown_02), [medieval_wood](https://polyhaven.com/a/medieval_wood) |
| stable.glb | 408 | 125.0 | 12.15 × 10.35 × 5.82 | [raw_plank_wall](https://polyhaven.com/a/raw_plank_wall), [reed_roof_04](https://polyhaven.com/a/reed_roof_04), [stone_wall](https://polyhaven.com/a/stone_wall), [bark_brown_02](https://polyhaven.com/a/bark_brown_02), [medieval_wood](https://polyhaven.com/a/medieval_wood) |
| mountain_a.glb | 3900 | 248.7 | 28.0 × 14.48 × 28.86 | [mountainside](https://polyhaven.com/a/mountainside) (model, decimated) |
| scatter_grass.glb | 28 | 59.0 | 1.1 × 1.02 × 0.45 | [grass_medium_01](https://polyhaven.com/a/grass_medium_01) (model, rendered to cards) |
| scatter_flowers.glb | 28 | 33.8 | 1.06 × 0.98 × 0.35 | [flower_gazania](https://polyhaven.com/a/flower_gazania) (model, rendered to cards) |

Notes: `window` material appears on school, tower_wood (lantern), tower_stone (slits), mine (tunnel mouth), barracks and stable (stall interiors). Scatter props use alpha MASK; their back faces are real reversed faces with up-facing normals, so they light like the ground.

### Update: trees and bush rebuilt
The foliage cards now have real reversed back faces that keep the same up-biased normals, and the material is single-sided. Under three.js the canopies no longer darken from flipped normals. Each atlas is a 512 px 8-bit palette PNG with alpha (256 px for the bush).
Results: tree_broadleaf_a 2750 tris / 305 KB, tree_broadleaf_b 2618 / 283 KB, tree_conifer 772 / 167 KB, bush 480 / 66 KB. Sources are unchanged.

## Batch 3: realistic characters (`chars/`)

| file | tris | KB | source |
|---|---|---|---|
| chars/ruler_tribal.glb | 4308 | 298.5 | Body: [Blender Studio Human Base Meshes v1.4](https://download.blender.org/demo/asset-bundles/human-base-meshes/), GEO-body_male_realistic (CC0), decimated. Clothing, headgear and skeleton were made in this pipeline. Fabric grain: Poly Haven [rough_linen](https://polyhaven.com/a/rough_linen), [medieval_wood](https://polyhaven.com/a/medieval_wood), [reed_roof_04](https://polyhaven.com/a/reed_roof_04), [castle_brick_07](https://polyhaven.com/a/castle_brick_07) (CC0). |
| chars/ruler_king.glb | 4412 | 302.6 | Body: [Blender Studio Human Base Meshes v1.4](https://download.blender.org/demo/asset-bundles/human-base-meshes/), GEO-body_male_realistic (CC0), decimated. Clothing, headgear and skeleton were made in this pipeline. Fabric grain: Poly Haven [rough_linen](https://polyhaven.com/a/rough_linen), [medieval_wood](https://polyhaven.com/a/medieval_wood), [reed_roof_04](https://polyhaven.com/a/reed_roof_04), [castle_brick_07](https://polyhaven.com/a/castle_brick_07) (CC0). |
| chars/ruler_emperor.glb | 4552 | 312.1 | Body: [Blender Studio Human Base Meshes v1.4](https://download.blender.org/demo/asset-bundles/human-base-meshes/), GEO-body_male_realistic (CC0), decimated. Clothing, headgear and skeleton were made in this pipeline. Fabric grain: Poly Haven [rough_linen](https://polyhaven.com/a/rough_linen), [medieval_wood](https://polyhaven.com/a/medieval_wood), [reed_roof_04](https://polyhaven.com/a/reed_roof_04), [castle_brick_07](https://polyhaven.com/a/castle_brick_07) (CC0). |
| chars/soldier_spear.glb | 3860 | 270.1 | Body: [Blender Studio Human Base Meshes v1.4](https://download.blender.org/demo/asset-bundles/human-base-meshes/), GEO-body_male_realistic (CC0), decimated. Clothing, headgear and skeleton were made in this pipeline. Fabric grain: Poly Haven [rough_linen](https://polyhaven.com/a/rough_linen), [medieval_wood](https://polyhaven.com/a/medieval_wood), [reed_roof_04](https://polyhaven.com/a/reed_roof_04), [castle_brick_07](https://polyhaven.com/a/castle_brick_07) (CC0). |
| chars/soldier_archer.glb | 4092 | 266.3 | Body: [Blender Studio Human Base Meshes v1.4](https://download.blender.org/demo/asset-bundles/human-base-meshes/), GEO-body_male_realistic (CC0), decimated. Clothing, headgear and skeleton were made in this pipeline. Fabric grain: Poly Haven [rough_linen](https://polyhaven.com/a/rough_linen), [medieval_wood](https://polyhaven.com/a/medieval_wood), [reed_roof_04](https://polyhaven.com/a/reed_roof_04), [castle_brick_07](https://polyhaven.com/a/castle_brick_07) (CC0). |
| chars/soldier_sword.glb | 3964 | 260.2 | Body: [Blender Studio Human Base Meshes v1.4](https://download.blender.org/demo/asset-bundles/human-base-meshes/), GEO-body_male_realistic (CC0), decimated. Clothing, headgear and skeleton were made in this pipeline. Fabric grain: Poly Haven [rough_linen](https://polyhaven.com/a/rough_linen), [medieval_wood](https://polyhaven.com/a/medieval_wood), [reed_roof_04](https://polyhaven.com/a/reed_roof_04), [castle_brick_07](https://polyhaven.com/a/castle_brick_07) (CC0). |
| chars/villager.glb | 3900 | 261.1 | Body: [Blender Studio Human Base Meshes v1.4](https://download.blender.org/demo/asset-bundles/human-base-meshes/), GEO-body_male_realistic (CC0), decimated. Clothing, headgear and skeleton were made in this pipeline. Fabric grain: Poly Haven [rough_linen](https://polyhaven.com/a/rough_linen), [medieval_wood](https://polyhaven.com/a/medieval_wood), [reed_roof_04](https://polyhaven.com/a/reed_roof_04), [castle_brick_07](https://polyhaven.com/a/castle_brick_07) (CC0). |

The skeleton copies the bone names and rest orientations of **KayKit Rig_Medium** (Kay Lousberg, CC0, already credited in `../CREDITS.md`), so the game's KayKit animation clips drive these characters. See `chars/README.md`. No KayKit geometry or animation data is included in these files.

## Horse (`horse.glb`)
| file | tris | KB | source |
|---|---|---|---|
| horse.glb | 3464 | 300 | [White Horse by Quaternius](https://poly.pizza/m/bEdE4rmZy9) (Ultimate Animated Animal pack, **CC0**). Changes: vertices welded and smoothed (subdivided once, then decimated), rescaled to a real horse (2.3 m to the ear tips, saddle seat at about 1.74 m), and coat baked into one 512 px texture. Saddle, blanket and noseband added. |

- Materials:
  - `coat`: a light neutral body with darker mane, tail and hooves. Multiply it by the mount colour, e.g. `#c9a27a`.
  - `cloth`: the white saddle blanket; tint it with the team colour.
  - `tack`: leather.
- Clips: `Idle`, `Walk`, `Gallop`, `Attack_Kick`, `Death`.
- Facing: the head points along glTF +Z (Blender −Y), not −Z like the KayKit characters, so rotate it 180° in the game. Origin is between the hooves at ground level.
- The rider sits at about y = 1.74 m. Bones `Torso` and `Back` carry the saddle; `Head` is the head.
- Fix (game side): the four hoof IK bones `FF.L`, `FF.R`, `FFB.L`, `FFB.R` were orphan nodes outside the scene, so a cloned rig (SkeletonUtils.clone) lost them and the hooves stretched to the origin. They are now children of `AnimalArmature` (identity transform, so nothing moves); real3d.js also re-parents any orphan bone as a guard.
- In game: `RA.horse(col, cloth)` (real3d.js), used through `R3D.horse`. Idle / Walk / Gallop are picked from the horse's measured speed; the rider sits on a point attached to the `Torso` bone. The cute style and load failures fall back to the old procedural horse.
