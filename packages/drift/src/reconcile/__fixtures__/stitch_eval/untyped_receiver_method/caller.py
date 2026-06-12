from processor import Item


def run_item(item):
    return item.process()


def main():
    return run_item(Item())
