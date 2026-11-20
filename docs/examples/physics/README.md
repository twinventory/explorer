# First physics experiments

Paste any example into Explorer's XYZDSL source editor. The physics panel
appears automatically; use Play/Pause, Step (1/120 s), and Reset. Source edits
reset and pause the simulation.

- [gravity.xyzdsl](gravity.xyzdsl): equal-size bodies with different masses fall equally fast.
- [mass.xyzdsl](mass.xyzdsl): equal forces accelerate the lighter body more.
- [rotation.xyzdsl](rotation.xyzdsl): a centered push translates; an off-center push also spins.

Only explicitly declared rigid box bodies simulate. There are no collisions or
ground plane yet. Coordinates retain XYZDSL units (`m` means millimetres).
Forces use newtons, mass kilograms, and time seconds.

Actions use `Component/+Body` for a named application point, or
`Component/+Body/+x/+y/+z` for an explicit point in the component's local space.
For example:

```text
"Experiment/+Offset/+70c/+140c/+140c" : "action: force; vector: 2,0,0; duration: 1"
"Experiment/+Offset" : "action: force; vector: 2,0,0; point: top; duration: 1"
```

These are alternative ways to apply a force to the `Offset` body in the rotation
example. Including both declarations applies both forces. Named points select
the body center or a face center; numeric path coordinates refer to the owning
component. Do not combine path coordinates with a `point` property.

The [production specification](../../../SPECIFICATION.md#rigid-body-force-experiments)
documents coordinate frames, supported named points, compatibility syntax,
solver details, limits, and the replacement/inheritance follow-up.
To run the browser smoke test, start Explorer on port 5174, then run
`node tests/physics/smoke.mjs` from the Explorer directory. It uses an isolated
headless Chrome profile and does not change your normal browser's saved gallery.
