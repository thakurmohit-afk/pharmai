#!/bin/bash
set -e
pip install -r requirements.txt
python -c "import asyncio; from seed_data import seed_database; asyncio.run(seed_database()); print('DB seeded')"
