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

| file | tris | KB | size (m) | Poly Haven sources (CC0) |
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
