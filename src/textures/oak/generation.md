# Oak texture generation

Generated with the built-in image generation tool. Normal, roughness and metalness used the color map as their edit reference. These are generated approximations, not measured PBR scans. Tiling and material appearance have not been verified in the renderer.

Bundled as `texture: local:oak`. The four PNGs are original generated outputs copied into project source. They may also be uploaded under materials/ in a remote asset store and used as `texture: materials/oak.png`.

## map

Use case: photorealistic-natural. Generate a single square 1024x1024 seamless tileable PBR base color / albedo texture of natural light honey oak wood. Entire image is one continuous oak surface, fine mostly vertical grain with restrained cathedral figuring, subtle medullary rays and pores. No plank boundaries, no knots, no objects, no perspective, no lighting gradients, no cast shadows, no baked highlights or ambient occlusion, no text, no borders. Flat neutral diffuse color suitable for a physically based material. Match opposite edges for seamless repetition. Output only the color map.

## normal

Use case: precise-object-edit. Edit target: attached oak base-color texture. Convert into a matching tangent-space OpenGL +Y normal map for a PBR material. Preserve exact grain position, scale, dimensions, framing and pores. Output only a purple-blue normal map, flat regions RGB 128,128,255, subtle red/green variations describing shallow oak grain and pores, positive blue everywhere. No albedo color, no lighting, no text, no borders. Maintain edge continuity. Same square image dimensions as reference.

## roughness

Use case: precise-object-edit. Edit target: attached oak base-color texture. Convert into a matching grayscale roughness map for natural unfinished oak. Preserve exact grain position, scale, dimensions, framing and pores. Output only grayscale RGB with identical R,G,B values, moderately rough mid-light gray overall (about 180-205 of 255), pores slightly rougher/lighter, subtle fine grain variation. No lighting, no brown color, no text, no borders. Maintain edge continuity. Same square image dimensions as reference.

## metalness

Use case: precise-object-edit. Edit target: attached oak texture. Produce its PBR metalness map. Oak is entirely nonmetallic: replace the whole image with uniform pure black RGB 0,0,0. Every pixel must be black, opaque, with no texture, no grain, no text, no border, no gradients. Preserve square dimensions of reference. Output only the black metalness map.

