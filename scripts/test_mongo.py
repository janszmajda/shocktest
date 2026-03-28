"""Test MongoDB Atlas connection — run this first to verify your setup."""

import os
import sys

from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

MONGO_URI = os.environ.get("MONGODB_URI", "")

if not MONGO_URI:
    print("ERROR: MONGODB_URI environment variable not set.")
    print("  export MONGODB_URI='mongodb+srv://...'")
    sys.exit(1)


def main() -> None:
    """Connect to MongoDB, write a test doc, read it back, clean up."""
    try:
        client: MongoClient = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        # Force a connection attempt
        client.admin.command("ping")
    except ConnectionFailure as e:
        print(f"FAILED to connect to MongoDB: {e}")
        print("Check: IP whitelist, password, cluster status.")
        sys.exit(1)

    db = client["shocktest"]

    # Write
    db["test"].insert_one({"status": "connected"})
    # Read back
    result = db["test"].find_one({"status": "connected"})
    print(f"MongoDB connected: {result}")

    # Clean up
    db["test"].drop()
    print("Test collection dropped — connection verified.")


if __name__ == "__main__":
    main()
