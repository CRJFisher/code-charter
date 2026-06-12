# Weakness: untyped_receiver_method — `item.process()` is a method call on a parameter that
# carries no type annotation, so Ariadne cannot bind the receiver type and the method is promoted
# to its own orphan entrypoint, fragmenting the processing functionality.
# Expected agent behaviour: stitch the caller and the method into one umbrella, bridged at the
# `item.process()` call site.


class Item:
    def process(self):
        return 1
