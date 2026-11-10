MAUERBRECHER - game assets
Units: metres. +Y up. Characters face +Z. All GLB (glTF binary), textures embedded.

characters/
  Player.glb  - 6 floating parts: Head, Torso, Hand_L, Hand_R, Foot_L, Foot_R (pivot = part centre)
  Guard.glb   - same 6 parts + outfit pieces named <Part>_<Item> (Head_Cap, Torso_Belt, Hand_R_Flashlight...)
                Move each outfit piece with its part. The vision cone starts at Hand_R_FlashlightLens, pointing +Z.
wall/
  Wall_Segment.glb            - one tall, thick segment (2.4 m wide, 8.9 m tall)
  Wall_Row6.glb               - 6 segments in a row, one node per segment
  Wall_Segment_Outline.glb    - single segment with a black comic outline
  Wall_Segment_Fractured.glb  - same segment pre-broken: Chunk_01..Chunk_33 + Pipe_1/2
                                (swap the intact segment for this one on the first hit, then hide/drop chunks as HP falls)
  Rubble_Pieces.glb           - 6 rubble rocks
  Crack_Decal.png             - transparent crack for hit feedback
tools/  (grip at origin -> parent to Hand_R)
  Tool_1_HandWraps, Tool_2_BrassKnuckles, Tool_3_Hammer, Tool_4_Sledgehammer, Tool_5_Pickaxe, Tool_6_Jackhammer
props/
  Prop_Watchtower (with searchlight), Prop_StreetLamp, Prop_BarbedFence (3 m), Prop_CzechHedgehog,
  Prop_Crate, Prop_Sandbags, Prop_Barrel (cover), Prop_Coin, Prop_GroundTile (10x10 m sand)
ui_icons/  - transparent PNG renders of the tools + characters for the shop / HUD
