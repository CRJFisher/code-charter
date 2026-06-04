// Fixture for task-27.1.6.2 — two top-level, block-bodied anonymous callbacks collide on
// `<file>#<anonymous>:function`, plus one named, bodied, described symbol that must survive re-sync.
// Do not "tidy" the callbacks into named functions: the colliding <anonymous> symbol_paths are the
// whole point of the regression. Each callback is block-bodied so Ariadne gives it a body_scope_id.

const inputs = [1, 2, 3];

const doubled = inputs.map((value) => {
  const next = value * 2;
  return next;
});

inputs.forEach((value) => {
  const label = `item-${value}`;
  console.log(label);
});

export function named_thing(seed: number): number {
  let total = seed;
  for (const value of doubled) {
    total += value;
  }
  return total;
}
