from server.app.db import SessionLocal
from server.app.importer import import_kmz


def main() -> None:
    with SessionLocal() as session:
        result = import_kmz(session)
    print(
        f"Imported {result['features']} features across {result['categories']} categories "
        f"with {result['styles']} styles."
    )


if __name__ == "__main__":
    main()
