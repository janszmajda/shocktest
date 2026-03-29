"""
Remove all demo/fake shocks from MongoDB.
Demo shocks are identified by market_id starting with "demo-".

Usage:
    python scripts/remove_demo_shocks.py
"""

import os
import sys
from pathlib import Path
from pymongo import MongoClient

# Load .env files
for env_path in [
    Path(__file__).resolve().parent.parent / "dashboard" / ".env.local",
    Path(__file__).resolve().parent.parent / ".env.local",
    Path(__file__).resolve().parent.parent / ".env",
]:
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

MONGODB_URI = os.environ.get("MONGODB_URI")
if not MONGODB_URI:
    print("Error: MONGODB_URI not set")
    sys.exit(1)

client = MongoClient(MONGODB_URI)
db = client["shocktest"]

# Find demo shocks
demo_shocks = list(db["shock_events"].find(
    {"market_id": {"$regex": "^demo-"}},
    {"_id": 1, "question": 1, "market_id": 1},
))

if not demo_shocks:
    print("No demo shocks found.")
    client.close()
    sys.exit(0)

print(f"Found {len(demo_shocks)} demo shock(s):\n")
for s in demo_shocks:
    print(f"  • {s.get('question', 'unknown')[:60]}")
    print(f"    market_id: {s['market_id']}")

print()
confirm = input("Delete all? [y/N] ").strip().lower()

if confirm == "y":
    shocks = db["shock_events"].delete_many({"market_id": {"$regex": "^demo-"}})
    markets = db["market_series"].delete_many({"market_id": {"$regex": "^demo-"}})
    print(f"\nDeleted {shocks.deleted_count} demo shock(s) + {markets.deleted_count} demo market series.")
else:
    print("Cancelled.")

client.close()
