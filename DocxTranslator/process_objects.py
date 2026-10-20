"""Generate reusable translation and speech artifacts from Objects/*.json."""
import argparse

from object_pipeline import list_objects, process_object_to_result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default="vi", help="Source language code (default: vi)")
    parser.add_argument("--targets", nargs="+", default=["en", "zh"], help="Target language codes")
    parser.add_argument("--object-ids", nargs="+", help="Optional object IDs to process")
    args = parser.parse_args()

    failed = False
    selected = set(args.object_ids or [])
    items = [item for item in list_objects() if not selected or item["id"] in selected]
    for item in items:
        for target in args.targets:
            try:
                result = process_object_to_result(item["id"], args.source, target)
                print(f"OK {item['id']} [{target}] -> Result/{result['result_directory']}", flush=True)
            except Exception as error:
                failed = True
                print(f"ERROR {item['id']} [{target}]: {error}", flush=True)
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
