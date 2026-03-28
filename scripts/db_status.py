"""Print MongoDB collection counts."""

import os
import sys

from pymongo import MongoClient

MONGO_URI = os.environ.get("MONGODB_URI", "")
if not MONGO_URI:
    print("ERROR: MONGODB_URI not set.")
    sys.exit(1)

db = MongoClient(MONGO_URI)["shocktest"]
for col in ["market_series", "shock_events", "shock_results"]:
    print(f"{col}: {db[col].count_documents({})} docs")
