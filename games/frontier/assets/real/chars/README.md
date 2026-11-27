# Realistic characters (`assets/real/chars/`)

These are skinned characters: mesh and skeleton only, with **no animation clips inside**. They are driven by the game's existing **KayKit** clips (`knight.glb`, `anims_ranged.glb`, and so on).

| file | tris | KB | height (m, incl. headgear) |
|---|---|---|---|
| ruler_tribal.glb | 4308 | 298.5 | 1.765 |
| ruler_king.glb | 4412 | 302.6 | 1.735 |
| ruler_emperor.glb | 4552 | 312.1 | 1.855 |
| soldier_spear.glb | 3860 | 270.1 | 1.78 |
| soldier_archer.glb | 4092 | 266.3 | 1.7 |
| soldier_sword.glb | 3964 | 260.2 | 1.76 |
| villager.glb | 3900 | 261.1 | 1.694 |

- One baked 512 px JPEG base-colour material per character. There is no normal map, and roughness is a constant 0.85.
- +Y up, metres, origin between the feet, facing −Z (the same as KayKit).
- Rest pose = **KayKit T-pose**.
- Weapons are not included. Attach them to the `handslot.r` / `handslot.l` bones exactly as the KayKit models do.

## Why KayKit clips work
The skeleton has the same bone names and hierarchy as KayKit Rig_Medium (`root, hips, spine, chest, head, upperarm/lowerarm/wrist/hand/handslot .l/.r, upperleg/lowerleg/foot/toes .l/.r`).

Every joint's rest rotation is identical to KayKit's: the glTF node rotations were checked and differ by less than 1e-7. Only the joint positions differ, because the body is realistic rather than chibi. So KayKit **rotation** tracks can be used unchanged.

KayKit's IK/control helper bones (`kneeIK.*`, `IK-foot.*`, `control-*`, `elbowIK.*`, `handIK.*`) are not in these rigs. Drop their tracks.

## How to apply a KayKit clip (three.js)
```js
const HIPS_SCALE = 2.2186;            // realistic hips height 0.900 m / KayKit 0.4057
const HIPS_OFFSET_Z = -0.0247;        // realistic hips rest z (glTF), KayKit is 0
function retargetClip(clip, model) {
  const names = new Set(); model.traverse(o => names.add(o.name));
  const tracks = [];
  for (const t of clip.tracks) {
    const [node, prop] = t.name.split('.').length > 2
      ? [t.name.slice(0, t.name.lastIndexOf('.')), t.name.slice(t.name.lastIndexOf('.') + 1)]
      : t.name.split('.');
    if (!names.has(node)) continue;               // IK/control bones are not in these rigs
    if (prop === 'quaternion') { tracks.push(t); continue; }   // rotations: as-is
    if (prop === 'position' && node === 'hips') {             // hips: scale the motion
      const v = t.values.slice();
      for (let i = 0; i < v.length; i += 3) { v[i] *= HIPS_SCALE; v[i+1] *= HIPS_SCALE; v[i+2] = v[i+2] * HIPS_SCALE + HIPS_OFFSET_Z; }
      tracks.push(new THREE.VectorKeyframeTrack(t.name, t.times, v));
    }
    // every other position/scale track is dropped: it would pull joints back to KayKit (chibi) lengths
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
```
Bone names contain dots (`upperarm.l`). three.js track names are `"<node>.<property>"`, so split on the **last** dot, as above.

If the game sanitizes names (`PropertyBinding.sanitizeNodeName`), it applies equally to KayKit and these rigs.

## Notes
- The characters are realistic size (about 1.7–1.85 m). KayKit models are about 1.5 m including the big head. Scale per unit type as needed.
- Robes and skirts are skinned partly to the legs, so they swing during walk and run. There are no cloth physics.
- `ruler_king` is red/gold and can be tinted for ancient and medieval kings. `ruler_emperor` is purple/gold with an arched crown. `ruler_tribal` has a fur cloak and a headband with feathers.

Sources: the body is from Blender Studio "Human Base Meshes" v1.4 (CC0); see `../CREDITS.md`.
