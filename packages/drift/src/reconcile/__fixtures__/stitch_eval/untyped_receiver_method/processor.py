# Weakness: untyped_receiver_method — `item.process()` is a method call on a parameter that
# carries no type annotation, so Ariadne cannot bind the receiver type and the method is promoted
# to its own orphan entrypoint, fragmenting the processing functionality.
# Expected agent behaviour: stitch the caller and the method into one umbrella. The corroborable
# bridge site is the `run_item(Item())` line in the caller's tree: Ariadne emits no call node at
# all for `item.process()` on the unannotated receiver (which is exactly why the method orphans),
# so the constructor-call line is the unresolved-site evidence the inventory offers.
# Consumed by reconcile_stitch_eval.test.ts (Tier 1, structural) and bin/stitch_eval.ts (Tier 2,
# live agent scoring).


class Item:
    def process(self):
        return 1
